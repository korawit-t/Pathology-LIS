"""Server-side enforcement of "Require All Signatures" for gyne and non-gyne.

The gate itself (every listed signer must have signed before publish/approve)
already ran on the server; what it judged was the signed_at values the client
sent. These tests pin the hardening on top of it — while the setting is on, a
signature exists only if its owner recorded it — and that with the setting off
nothing changed.
"""

import uuid

import pytest
from fastapi import HTTPException

from app.crud.gyne_cyto_report import publish_gyne_report
from app.crud.gyne_diagnosis import (
    create_initial_diagnosis,
    get_current_diagnosis as get_current_gyne_diagnosis,
    update_diagnosis,
)
from app.crud.nongyne_cyto_case import send_nongyne_to_pathologist
from app.crud.nongyne_cyto_report import publish_nongyne_report
from app.crud.nongyne_diagnosis import (
    create_nongyne_diagnosis,
    get_current_diagnosis as get_current_nongyne_diagnosis,
    update_nongyne_diagnosis,
)
from app.models.gyne_cyto_report import GyneReportSigner
from app.models.nongyne_cyto_report import NongyneReportSigner
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate, GyneDiagnosisUpdate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate, NongyneDiagnosisUpdate
from tests.conftest import _login, _make_user
from tests.factories import (
    clear_system_settings,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_system_setting,
)

CLAIMED = "2026-10-01T09:00:00"


@pytest.fixture(autouse=True)
def _isolate_system_settings(db):
    """A require_all flag left on would gate every later publish in the run."""
    yield
    clear_system_settings(db)


@pytest.fixture
def people(db):
    def make(*roles):
        return _make_user(db, f"s_{uuid.uuid4().hex[:10]}", "TestPass1!", list(roles))

    cyto, cyto_pwd = make("cytotechnologist")
    path, path_pwd = make("pathologist")
    return {"cyto": cyto, "cyto_pwd": cyto_pwd, "path": path, "path_pwd": path_pwd}


def _signed(signers, user_id):
    return next(s for s in signers if s["user_id"] == user_id).get("signed_at")


# ─── Gyne ────────────────────────────────────────────────────────────────────


def _gyne_case(db, registrar_id, cyto, path, *, cyto_signs_own=False):
    """Case + diagnosis listing the screener and the primary pathologist. With
    cyto_signs_own the screener's signature is recorded by their own save."""
    case = make_bare_gyne_case(db, registrar_id=registrar_id)
    create_initial_diagnosis(
        db,
        GyneDiagnosisCreate(
            case_id=case.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist",
                 "signed_at": CLAIMED if cyto_signs_own else None},
                {"user_id": path.id, "role": "primary"},
            ],
        ),
        actor_id=cyto.id,
    )
    return case


class TestGyneRequireAllOn:
    def test_publisher_cannot_claim_another_persons_signature(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path, cyto_signs_own=True)

        with pytest.raises(HTTPException) as exc:
            publish_gyne_report(
                db, case.id,
                signers=[
                    {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                    {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
                ],
                current_user_id=cyto.id, is_abnormal=True,
            )

        assert exc.value.status_code == 409
        assert path.full_name in exc.value.detail
        assert cyto.full_name not in exc.value.detail

    def test_a_diagnosis_save_cannot_sign_for_someone_else(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path)
        diag = get_current_gyne_diagnosis(db, case.id)

        update_diagnosis(
            db, diag.id,
            GyneDiagnosisUpdate(signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
            ]),
            actor_id=cyto.id,
        )

        db.refresh(diag)
        # Their own signature is recorded — at the server's time, not the claim...
        assert _signed(diag.signers, cyto.id) not in (None, CLAIMED)
        # ...the pathologist's is not, however it was claimed.
        assert _signed(diag.signers, path.id) is None

    def test_a_signature_already_recorded_is_kept_on_later_saves(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path, cyto_signs_own=True)
        diag = get_current_gyne_diagnosis(db, case.id)
        recorded = _signed(diag.signers, cyto.id)

        update_diagnosis(
            db, diag.id,
            GyneDiagnosisUpdate(signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": "2030-01-01T00:00:00"},
                {"user_id": path.id, "role": "primary", "signed_at": "2030-01-01T00:00:00"},
            ]),
            actor_id=path.id,
        )

        db.refresh(diag)
        assert _signed(diag.signers, cyto.id) == recorded
        assert _signed(diag.signers, path.id) is not None

    def test_unlock_and_edit_can_still_clear_everyone(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path, cyto_signs_own=True)
        diag = get_current_gyne_diagnosis(db, case.id)

        update_diagnosis(
            db, diag.id,
            GyneDiagnosisUpdate(signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": None},
                {"user_id": path.id, "role": "primary", "signed_at": None},
            ]),
            actor_id=path.id,
        )

        db.refresh(diag)
        assert all(s.get("signed_at") is None for s in diag.signers)

    def test_publishes_once_everyone_signed_for_themselves(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path, cyto_signs_own=True)

        report = publish_gyne_report(
            db, case.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary"},
            ],
            current_user_id=path.id, is_abnormal=False,
        )

        rows = db.query(GyneReportSigner).filter(GyneReportSigner.report_id == report.id).all()
        assert len(rows) == 2
        assert all(r.signed_at is not None for r in rows)

    def test_api_returns_409_naming_who_is_missing(self, db, client, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path)
        ct_client = _login(client, cyto.username, people["cyto_pwd"])

        r = ct_client.post(
            f"/gyne-cyto-reports/{case.id}/publish",
            json={
                "is_abnormal": False,
                "signers": [
                    {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                    {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
                ],
            },
        )

        assert r.status_code == 409
        assert path.full_name in r.json()["detail"]
        db.refresh(case)
        assert case.status != "published"

    def test_api_diagnosis_save_uses_the_logged_in_user(self, db, client, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path)
        diag = get_current_gyne_diagnosis(db, case.id)
        ct_client = _login(client, cyto.username, people["cyto_pwd"])

        r = ct_client.put(
            f"/gyne-diagnosis/{diag.id}",
            json={"signers": [
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
            ]},
        )

        assert r.status_code == 200
        assert _signed(r.json()["signers"], cyto.id) is not None
        assert _signed(r.json()["signers"], path.id) is None


class TestGyneRequireAllOff:
    """Off means "primary only" — the sign-out stamps every listed signer and
    the server keeps accepting that, exactly as before."""

    def test_claimed_signatures_are_stored_as_sent(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=False)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path)
        diag = get_current_gyne_diagnosis(db, case.id)

        update_diagnosis(
            db, diag.id,
            GyneDiagnosisUpdate(signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
            ]),
            actor_id=cyto.id,
        )

        db.refresh(diag)
        assert _signed(diag.signers, path.id) == CLAIMED

    def test_publish_goes_through_with_signers_outstanding(self, db, admin_user, people):
        make_system_setting(db, require_all_gyne_sign=False)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _gyne_case(db, registrar.id, cyto, path)

        report = publish_gyne_report(
            db, case.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist"},
                {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
            ],
            current_user_id=cyto.id, is_abnormal=False,
        )

        row = (
            db.query(GyneReportSigner)
            .filter(GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == path.id)
            .first()
        )
        assert row.signed_at is not None


# ─── Non-gyne ────────────────────────────────────────────────────────────────


def _nongyne_case(db, registrar_id):
    case = make_bare_nongyne_case(db, registrar_id=registrar_id)
    create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Dx"))
    return case


def _hand_off(db, case, cyto, path):
    """The screener's hand-off — where their signature gets recorded."""
    send_nongyne_to_pathologist(
        db, case.id, pathologist_id=path.id, current_user_id=cyto.id,
        signers=[
            {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
            {"user_id": path.id, "role": "primary", "signed_at": None},
        ],
    )


class TestNongyneRequireAllOn:
    def test_publisher_cannot_claim_the_screeners_signature(self, db, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)

        with pytest.raises(HTTPException) as exc:
            publish_nongyne_report(
                db, case_id=case.id,
                signers=[
                    {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                    {"user_id": path.id, "role": "primary"},
                ],
                current_user_id=path.id,
            )

        assert exc.value.status_code == 409
        assert cyto.full_name in exc.value.detail

    def test_publishes_after_the_screener_signed_their_hand_off(self, db, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)
        _hand_off(db, case, cyto, path)

        report = publish_nongyne_report(
            db, case_id=case.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary"},
            ],
            current_user_id=path.id,
        )

        rows = db.query(NongyneReportSigner).filter(NongyneReportSigner.report_id == report.id).all()
        assert all(r.signed_at is not None for r in rows)

    def test_hand_off_cannot_sign_for_the_pathologist(self, db, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)

        send_nongyne_to_pathologist(
            db, case.id, pathologist_id=path.id, current_user_id=cyto.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary", "signed_at": CLAIMED},
            ],
        )

        diag = get_current_nongyne_diagnosis(db, case.id)
        assert _signed(diag.signers, cyto.id) is not None
        assert _signed(diag.signers, path.id) is None

    def test_a_diagnosis_save_cannot_sign_for_someone_else(self, db, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)
        diag = get_current_nongyne_diagnosis(db, case.id)

        update_nongyne_diagnosis(
            db, diag,
            NongyneDiagnosisUpdate(signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary", "signed_at": None},
            ]),
            actor_id=path.id,
        )

        db.refresh(diag)
        assert _signed(diag.signers, cyto.id) is None

    def test_api_returns_409_naming_who_is_missing(self, db, client, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)
        path_client = _login(client, path.username, people["path_pwd"])

        r = path_client.post(
            f"/nongyne-cyto-reports/{case.id}/publish",
            json={"signers": [
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary"},
            ]},
        )

        assert r.status_code == 409
        assert cyto.full_name in r.json()["detail"]


class TestNongyneRequireAllOff:
    def test_claimed_signatures_are_accepted_as_before(self, db, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=False)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)

        report = publish_nongyne_report(
            db, case_id=case.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist", "signed_at": CLAIMED},
                {"user_id": path.id, "role": "primary"},
            ],
            current_user_id=path.id,
        )

        diag = get_current_nongyne_diagnosis(db, case.id)
        assert _signed(diag.signers, cyto.id) == CLAIMED
        assert report.id is not None

    def test_publish_goes_through_with_signers_outstanding(self, db, admin_user, people):
        make_system_setting(db, require_all_non_gyne_sign=False)
        registrar, _ = admin_user
        cyto, path = people["cyto"], people["path"]
        case = _nongyne_case(db, registrar.id)

        report = publish_nongyne_report(
            db, case_id=case.id,
            signers=[
                {"user_id": cyto.id, "role": "cytotechnologist"},
                {"user_id": path.id, "role": "primary"},
            ],
            current_user_id=path.id,
        )

        assert report.id is not None
