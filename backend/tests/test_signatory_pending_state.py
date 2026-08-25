"""
Regression suite for the signatory "pending" state across surgical, gyne and
non-gyne. All three domains encode the same thing the same way — a signer row
whose signed_at is null is someone the case was assigned to, not someone who
signed it — and all three leaked that distinction:

  1. publish_nongyne_report() rewrote NongyneDiagnosis.signers without the
     signed_at key, so a published case showed every signatory back as
     PENDING on the next page load and never dropped out of the signing
     pathologist's worklist (exclude_signed_by matches `@.signed_at != null`
     against exactly that JSON).
  2. Every report template printed unsigned signers under "Reported By" /
     "Digitally Signed by" indistinguishably from people who had signed.
  3. require_all_gyne_sign / require_all_non_gyne_sign were only checked in
     process_*_report_approval(), which the ordinary publish path — the one
     that actually sets PUBLISHED — never reaches.
"""

import uuid

import pytest
from fastapi import HTTPException

from app.crud.gyne_cyto_report import publish_gyne_report
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.nongyne_cyto_report import publish_nongyne_report
from app.crud.nongyne_cyto_case import get_nongyne_cases
from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.crud.surgical_report_builder import prepare_report_data
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
from app.services.pdf_service import env

from tests.conftest import _make_user
from tests.factories import (
    build_bulk_save_payload,
    clear_system_settings,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_signable_case,
    make_system_setting,
)

SIGNED_AT = "2026-08-20T09:30:00"


@pytest.fixture
def cytotech(db):
    user, _ = _make_user(
        db, f"cyto_{uuid.uuid4().hex[:12]}", "CytoPass1!", ["cytotechnologist"]
    )
    return user


@pytest.fixture(autouse=True)
def _isolate_system_settings(db):
    """SystemSetting is a singleton and real-DB commits outlive the test, so a
    require_all_* flag left behind here would gate every later publish in the
    same run."""
    yield
    clear_system_settings(db)


class TestNongyneDiagnosisKeepsSignedAt:
    def test_publish_preserves_signed_at_on_the_diagnosis(
        self, db, admin_user, two_pathologists, cytotech
    ):
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )

        publish_nongyne_report(
            db,
            case_id=case.id,
            signers=[
                {
                    "user_id": cytotech.id,
                    "role": "cytotechnologist",
                    "signed_at": SIGNED_AT,
                },
                {"user_id": pathologist.id, "role": "primary"},
            ],
            current_user_id=pathologist.id,
        )

        diagnosis = (
            db.query(NongyneDiagnosis)
            .filter(
                NongyneDiagnosis.case_id == case.id,
                NongyneDiagnosis.is_current.is_(True),
            )
            .first()
        )
        by_user = {s["user_id"]: s for s in diagnosis.signers}

        # The screener's own signature time is carried through untouched...
        assert by_user[cytotech.id]["signed_at"] == SIGNED_AT
        # ...and the publisher gets stamped rather than left null.
        assert by_user[pathologist.id]["signed_at"] is not None

    def test_signed_case_leaves_the_signers_worklist(
        self, db, admin_user, two_pathologists
    ):
        """exclude_signed_by is the "cases I still have to sign" filter — it
        only works if signed_at survives onto the diagnosis JSON."""
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )

        publish_nongyne_report(
            db,
            case_id=case.id,
            signers=[{"user_id": pathologist.id, "role": "primary"}],
            current_user_id=pathologist.id,
        )

        result = get_nongyne_cases(db, limit=200, exclude_signed_by=pathologist.id)
        assert case.id not in [c.id for c in result["items"]]


class TestUnsignedSignersAreNotPrintedAsReporters:
    SIGNERS = [
        {
            "user_id": 1,
            "full_name": "Signed Pathologist",
            "role": "primary",
            "signed_at": "20/08/2026 09:30",
        },
        {
            "user_id": 2,
            "full_name": "Unsigned Consultant",
            "role": "co-signer",
            "signed_at": None,
        },
    ]

    @pytest.mark.parametrize(
        "template_name",
        [
            "reports/gyne_cyto_report_template.html",
            "reports/nongyne_cyto_report_template.html",
        ],
    )
    def test_released_report_names_only_signers_who_signed(self, template_name):
        html = env.get_template(template_name).render(
            signers=self.SIGNERS, is_preview=False
        )
        assert "Signed Pathologist" in html
        assert "Unsigned Consultant" not in html

    @pytest.mark.parametrize(
        "template_name",
        [
            "reports/gyne_cyto_report_template.html",
            "reports/nongyne_cyto_report_template.html",
        ],
    )
    def test_preview_keeps_the_full_roster_and_flags_who_is_outstanding(
        self, template_name
    ):
        html = env.get_template(template_name).render(
            signers=self.SIGNERS, is_preview=True
        )
        assert "Signed Pathologist" in html
        assert "Unsigned Consultant" in html
        assert "Awaiting signature" in html

    def test_surgical_digitally_signed_by_omits_an_unsigned_cosigner(
        self, db, admin_user, two_pathologists
    ):
        # Primary-only policy so the report finalizes with path2 still unsigned.
        make_system_setting(db, require_all_pathologists_sign=False)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        finalize_and_snapshot_orchestrator(
            db,
            case.id,
            build_bulk_save_payload(
                case.id,
                specimen.id,
                path1.id,
                pathologists=[
                    {"user_id": path1.id, "role": "primary"},
                    {"user_id": path2.id, "role": "co-signer"},
                ],
            ),
            path1.id,
        )

        data = prepare_report_data(db, case.id)

        assert path1.full_name in data["diagnosis_summary"]
        assert path2.full_name not in data["diagnosis_summary"]
        assert path2.full_name not in (data["pathologist_name"] or "")


class TestRequireAllSignaturesGatesPublish:
    def test_nongyne_publish_rejected_while_a_signature_is_outstanding(
        self, db, admin_user, two_pathologists, cytotech
    ):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )

        with pytest.raises(HTTPException) as exc:
            publish_nongyne_report(
                db,
                case_id=case.id,
                signers=[
                    {"user_id": cytotech.id, "role": "cytotechnologist"},
                    {"user_id": pathologist.id, "role": "primary"},
                ],
                current_user_id=pathologist.id,
            )

        assert exc.value.status_code == 400
        assert "have not signed yet" in exc.value.detail

    def test_nongyne_publish_allowed_once_everyone_has_signed(
        self, db, admin_user, two_pathologists, cytotech
    ):
        make_system_setting(db, require_all_non_gyne_sign=True)
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )

        report = publish_nongyne_report(
            db,
            case_id=case.id,
            signers=[
                {
                    "user_id": cytotech.id,
                    "role": "cytotechnologist",
                    "signed_at": SIGNED_AT,
                },
                # The publisher is stamped by publish itself, so an absent
                # signed_at here must not count as outstanding.
                {"user_id": pathologist.id, "role": "primary"},
            ],
            current_user_id=pathologist.id,
        )

        assert report.id is not None

    def test_nongyne_publish_unaffected_when_the_setting_is_off(
        self, db, admin_user, two_pathologists, cytotech
    ):
        make_system_setting(db, require_all_non_gyne_sign=False)
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )

        report = publish_nongyne_report(
            db,
            case_id=case.id,
            signers=[
                {"user_id": cytotech.id, "role": "cytotechnologist"},
                {"user_id": pathologist.id, "role": "primary"},
            ],
            current_user_id=pathologist.id,
        )

        assert report.id is not None

    def test_gyne_publish_rejected_while_a_signature_is_outstanding(
        self, db, admin_user, two_pathologists, cytotech
    ):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))

        with pytest.raises(HTTPException) as exc:
            publish_gyne_report(
                db,
                case.id,
                signers=[
                    {"user_id": cytotech.id, "role": "cytotechnologist"},
                    {"user_id": pathologist.id, "role": "primary"},
                ],
                current_user_id=pathologist.id,
                is_abnormal=True,
            )

        assert exc.value.status_code == 400
        assert "have not signed yet" in exc.value.detail

    def test_gyne_publish_allowed_once_everyone_has_signed(
        self, db, admin_user, two_pathologists, cytotech
    ):
        make_system_setting(db, require_all_gyne_sign=True)
        registrar, _ = admin_user
        pathologist, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))

        report = publish_gyne_report(
            db,
            case.id,
            signers=[
                {
                    "user_id": cytotech.id,
                    "role": "cytotechnologist",
                    "signed_at": SIGNED_AT,
                },
                {"user_id": pathologist.id, "role": "primary"},
            ],
            current_user_id=pathologist.id,
            is_abnormal=True,
        )

        assert report.id is not None
