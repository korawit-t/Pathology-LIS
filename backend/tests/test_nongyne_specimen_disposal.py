"""Tests for the non-gyne cytology specimen disposal flow
(app/routers/nongyne_specimen_disposal_batch.py + app/crud/nongyne_specimen_disposal_batch.py
+ the /nongyne-cytology/disposal/* listing endpoints).

The surgical version of this feature shows "days since reported" and a Pending
tag but never checks either — you can put yesterday's case on a disposal sheet.
Here that rule is the feature, so most of these tests are about the gate holding
against a direct POST, not just against a frontend that hides the button.
"""

import uuid
from datetime import timedelta

import pytest
from passlib.context import CryptContext

from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.specimen_disposal_batch import SpecimenDisposalBatch
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.utils.time import local_now
from tests.factories import make_hospital, make_patient

_pwd = CryptContext(schemes=["argon2"], deprecated="auto")

BATCHES = "/nongyne-specimen-disposal-batches"
CANDIDATES = "/nongyne-cytology/disposal/candidates"
DISPOSED = "/nongyne-cytology/disposal/disposed"

RETENTION = 30


def _make_user(db, roles: list[str], prefix: str) -> tuple[User, str]:
    password = "DisposalPass1!"
    user = User(
        username=f"{prefix}_{uuid.uuid4().hex[:12]}",
        hashed_password=_pwd.hash(password),
        full_name=f"คุณ{prefix} ทดสอบ",
        roles=roles,
        status=True,
        is_temporary_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, password


def _login(client, user, password):
    r = client.post("/auth/login", data={"username": user.username, "password": password})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture(autouse=True)
def retention_setting(db):
    """Pin the retention rule so the gate tests don't depend on whatever the
    settings row happens to hold from an earlier test in the same run."""
    settings = db.query(SystemSetting).first()
    if not settings:
        settings = SystemSetting(hospital_slug="master")
        db.add(settings)
    settings.nongyne_specimen_retention_days = RETENTION
    db.commit()
    return settings


@pytest.fixture
def cyto_user(db):
    """cytotechnologist holds CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL but not
    CAN_APPROVE_SPECIMEN_DISPOSAL."""
    return _make_user(db, ["cytotechnologist"], "cyto")


@pytest.fixture
def cyto_client(client, cyto_user):
    return _login(client, *cyto_user)


@pytest.fixture
def approver_user(db):
    return _make_user(db, ["senior_pathologist"], "ngapprover")


@pytest.fixture
def as_cyto(client, cyto_user):
    """Re-authenticate as the cytotech.

    The `client` fixture is a single TestClient, so logging in as somebody else
    replaces the session rather than opening a second one. Tests that need both
    roles have to switch back and forth explicitly.
    """

    def _switch():
        return _login(client, *cyto_user)

    return _switch


@pytest.fixture
def as_approver(client, approver_user):
    def _switch():
        return _login(client, *approver_user)

    return _switch


@pytest.fixture
def signers(db):
    disposer, _ = _make_user(db, ["cytotechnologist"], "ngdisposer")
    verifier, _ = _make_user(db, ["lab_manager"], "ngverifier")
    approver, _ = _make_user(db, ["senior_pathologist"], "ngapprover2")
    return disposer, verifier, approver


def _case(
    db,
    registrar_id: int,
    *,
    days_ago: int | None = RETENTION,
    status: str = "published",
    is_pending: bool = False,
    is_cancelled: bool = False,
    specimen_type: str = "Fluid",
) -> NongyneCytologyCase:
    """A non-gyne case whose report went out `days_ago` days ago.

    days_ago=None leaves report_at NULL (never reported).
    """
    case = NongyneCytologyCase(
        accession_no=f"N26-{uuid.uuid4().hex[:12]}",
        patient_id=make_patient(db, name=f"NG{uuid.uuid4().hex[:8]}").id,
        hospital_id=make_hospital(db).id,
        registrar_id=registrar_id,
        status=status,
        specimen_type=specimen_type,
        collection_site="Pleural fluid",
        is_pending=is_pending,
        is_cancelled=is_cancelled,
        report_at=None if days_ago is None else local_now() - timedelta(days=days_ago),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def _payload(cases, signers) -> dict:
    disposer, verifier, approver = signers
    return {
        "case_ids": [c.id for c in cases],
        "disposer_id": disposer.id,
        "verifier_id": verifier.id,
        "approver_id": approver.id,
    }


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get(BATCHES).status_code == 401

    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get(BATCHES).status_code == 403

    def test_gross_cannot_list(self, client, db):
        """gross/histo run the surgical specimen room, not the cytology fridge."""
        user, pwd = _make_user(db, ["gross"], "grossng")
        _login(client, user, pwd)
        assert client.get(BATCHES).status_code == 403

    def test_cytotech_can_list(self, cyto_client):
        assert cyto_client.get(BATCHES).status_code == 200

    def test_cytotech_cannot_confirm(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 201, r.text
        batch_id = r.json()["id"]
        # creating the sheet and closing it are deliberately different people
        assert cyto_client.post(f"{BATCHES}/{batch_id}/confirm", json={}).status_code == 403

    def test_candidates_requires_role(self, clinician_client):
        assert clinician_client.get(CANDIDATES).status_code == 403


class TestEligibilityGate:
    """The reason this feature exists — every one of these is a 400 from the
    server, reachable by POSTing directly with no frontend involved."""

    def test_unreported_case_rejected(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, status="screened", days_ago=RETENTION)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยังไม่ได้รายงานผล" in r.json()["detail"]
        assert case.accession_no in r.json()["detail"]

    def test_null_report_at_rejected(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, days_ago=None)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยังไม่ได้รายงานผล" in r.json()["detail"]

    def test_one_day_short_rejected(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, days_ago=RETENTION - 1)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert f"ยังไม่ครบ {RETENTION} วัน" in detail
        assert f"{RETENTION - 1} วัน" in detail

    def test_exactly_retention_days_accepted(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, days_ago=RETENTION)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 201, r.text

    def test_pending_case_rejected(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, days_ago=RETENTION * 3, is_pending=True)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        assert "Pending" in r.json()["detail"]

    def test_cancelled_case_rejected(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, is_cancelled=True)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยกเลิก" in r.json()["detail"]

    def test_already_discarded_rejected(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        case.discard_status = True
        db.commit()
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        assert "ถูกทำลายไปแล้ว" in r.json()["detail"]

    def test_one_bad_case_blocks_the_whole_sheet(self, cyto_client, cyto_user, db, signers):
        good = _case(db, cyto_user[0].id)
        bad = _case(db, cyto_user[0].id, days_ago=1)
        r = cyto_client.post(BATCHES, json=_payload([good, bad], signers))
        assert r.status_code == 400
        assert bad.accession_no in r.json()["detail"]
        # nothing partially created — scoped to these two cases, since rows
        # committed by earlier tests in the same run are still in the DB
        from app.models.nongyne_specimen_disposal_batch import (
            NongyneSpecimenDisposalBatchItem,
        )

        assert (
            db.query(NongyneSpecimenDisposalBatchItem)
            .filter(
                NongyneSpecimenDisposalBatchItem.case_id.in_([good.id, bad.id])
            )
            .count()
            == 0
        )


class TestRetentionSetting:
    def test_gate_follows_the_setting(self, cyto_client, cyto_user, db, signers, retention_setting):
        case = _case(db, cyto_user[0].id, days_ago=10)
        assert cyto_client.post(BATCHES, json=_payload([case], signers)).status_code == 400

        retention_setting.nongyne_specimen_retention_days = 7
        db.commit()
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 201, r.text

    def test_batch_snapshots_the_rule_it_applied(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.json()["retention_days"] == RETENTION

    def test_client_cannot_supply_retention_days(self, cyto_client, cyto_user, db, signers):
        """Accepting it from the payload would let a caller send 0 and skip the gate."""
        case = _case(db, cyto_user[0].id, days_ago=1)
        payload = _payload([case], signers) | {"retention_days": 0}
        r = cyto_client.post(BATCHES, json=payload)
        assert r.status_code == 400


class TestCreateBatch:
    def test_verifier_must_differ_from_disposer(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        disposer, _, approver = signers
        r = cyto_client.post(
            BATCHES,
            json={
                "case_ids": [case.id],
                "disposer_id": disposer.id,
                "verifier_id": disposer.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400
        assert "คนละคน" in r.json()["detail"]

    def test_unknown_case_id_rejected(self, cyto_client, signers):
        disposer, verifier, approver = signers
        r = cyto_client.post(
            BATCHES,
            json={
                "case_ids": [99_999_999],
                "disposer_id": disposer.id,
                "verifier_id": verifier.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400
        assert "ไม่พบเคส" in r.json()["detail"]

    def test_external_account_cannot_sign(self, cyto_client, cyto_user, db, signers):
        outsider, _ = _make_user(db, ["clinician"], "ngoutsider")
        case = _case(db, cyto_user[0].id)
        _, verifier, approver = signers
        r = cyto_client.post(
            BATCHES,
            json={
                "case_ids": [case.id],
                "disposer_id": outsider.id,
                "verifier_id": verifier.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400

    def test_case_cannot_sit_on_two_open_sheets(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        assert cyto_client.post(BATCHES, json=_payload([case], signers)).status_code == 201
        r = cyto_client.post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยังไม่ปิด" in r.json()["detail"]

    def test_batch_no_format(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        batch_no = cyto_client.post(BATCHES, json=_payload([case], signers)).json()["batch_no"]
        year = local_now().strftime("%Y")
        assert batch_no.startswith(f"NDSP-{year}-")
        assert len(batch_no.split("-")[-1]) == 4

    def test_signer_names_snapshotted(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        body = cyto_client.post(BATCHES, json=_payload([case], signers)).json()
        disposer, verifier, approver = signers
        assert body["disposer_name"] == disposer.full_name
        assert body["verifier_name"] == verifier.full_name
        assert body["approver_name"] == approver.full_name

    def test_item_carries_specimen_details(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id, specimen_type="Sputum")
        item = cyto_client.post(BATCHES, json=_payload([case], signers)).json()["items"][0]
        assert item["specimen_type"] == "Sputum"
        assert item["collection_site"] == "Pleural fluid"
        assert item["days_since_report"] == RETENTION


class TestCandidateBuckets:
    def _accessions(self, resp):
        return {i["accession_no"] for i in resp.json()["items"]}

    def test_due_bucket(self, cyto_client, cyto_user, db):
        due = _case(db, cyto_user[0].id, days_ago=RETENTION + 5)
        young = _case(db, cyto_user[0].id, days_ago=2)
        r = cyto_client.get(f"{CANDIDATES}?bucket=due&limit=200")
        assert r.status_code == 200
        accs = self._accessions(r)
        assert due.accession_no in accs
        assert young.accession_no not in accs

    def test_not_due_bucket(self, cyto_client, cyto_user, db):
        young = _case(db, cyto_user[0].id, days_ago=2)
        r = cyto_client.get(f"{CANDIDATES}?bucket=not_due&limit=200")
        accs = self._accessions(r)
        assert young.accession_no in accs
        row = next(i for i in r.json()["items"] if i["accession_no"] == young.accession_no)
        assert row["days_since_report"] == 2
        assert row["is_due"] is False
        assert f"ยังไม่ครบ {RETENTION} วัน" in row["block_reason"]

    def test_blocked_bucket_holds_pending(self, cyto_client, cyto_user, db):
        pending = _case(db, cyto_user[0].id, days_ago=RETENTION + 5, is_pending=True)
        clean = _case(db, cyto_user[0].id, days_ago=RETENTION + 5)
        r = cyto_client.get(f"{CANDIDATES}?bucket=blocked&limit=200")
        accs = self._accessions(r)
        assert pending.accession_no in accs
        assert clean.accession_no not in accs

    def test_pending_case_never_shows_as_due(self, cyto_client, cyto_user, db):
        pending = _case(db, cyto_user[0].id, days_ago=RETENTION * 2, is_pending=True)
        r = cyto_client.get(f"{CANDIDATES}?bucket=due&limit=200")
        assert pending.accession_no not in self._accessions(r)

    def test_unpublished_case_appears_in_no_bucket(self, cyto_client, cyto_user, db):
        draft = _case(db, cyto_user[0].id, status="screened", days_ago=RETENTION * 2)
        for bucket in ("due", "not_due", "blocked"):
            r = cyto_client.get(f"{CANDIDATES}?bucket={bucket}&limit=200")
            assert draft.accession_no not in self._accessions(r)

    def test_case_on_open_sheet_leaves_due(self, cyto_client, cyto_user, db, signers):
        case = _case(db, cyto_user[0].id)
        before = cyto_client.get(f"{CANDIDATES}?bucket=due&limit=200")
        assert case.accession_no in self._accessions(before)

        cyto_client.post(BATCHES, json=_payload([case], signers))
        after = cyto_client.get(f"{CANDIDATES}?bucket=due&limit=200")
        assert case.accession_no not in self._accessions(after)

    def test_retention_days_returned_to_caller(self, cyto_client):
        assert cyto_client.get(CANDIDATES).json()["retention_days"] == RETENTION

    def test_bad_bucket_rejected(self, cyto_client):
        assert cyto_client.get(f"{CANDIDATES}?bucket=whatever").status_code == 422

    def test_search_by_accession(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id)
        r = cyto_client.get(f"{CANDIDATES}?bucket=due&search={case.accession_no}")
        assert self._accessions(r) == {case.accession_no}


class TestConfirm:
    def _open_batch(self, as_cyto, db, cyto_user, signers, **kw):
        case = _case(db, cyto_user[0].id, **kw)
        r = as_cyto().post(BATCHES, json=_payload([case], signers))
        assert r.status_code == 201, r.text
        return case, r.json()

    def test_confirm_stamps_the_case(self, as_cyto, as_approver, db, cyto_user, signers):
        case, batch = self._open_batch(as_cyto, db, cyto_user, signers)
        r = as_approver().post(
            f"{BATCHES}/{batch['id']}/confirm",
            json={"disposal_method": "เผา", "remark": "ครบทุกชิ้น"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "DISPOSED"
        assert r.json()["disposal_method"] == "เผา"

        db.refresh(case)
        assert case.discard_status is True
        assert case.discard_at is not None
        # the person who signed the paper as ผู้ทิ้ง, not whoever clicked confirm
        assert case.discard_by_id == signers[0].id

    def test_confirmed_case_moves_to_disposed_list(
        self, as_cyto, as_approver, db, cyto_user, signers
    ):
        case, batch = self._open_batch(as_cyto, db, cyto_user, signers)
        as_approver().post(f"{BATCHES}/{batch['id']}/confirm", json={})
        r = as_cyto().get(f"{DISPOSED}?search={case.accession_no}")
        assert case.accession_no in {i["accession_no"] for i in r.json()["items"]}

    def test_confirm_twice_conflicts(self, as_cyto, as_approver, db, cyto_user, signers):
        _, batch = self._open_batch(as_cyto, db, cyto_user, signers)
        approver = as_approver()
        assert approver.post(f"{BATCHES}/{batch['id']}/confirm", json={}).status_code == 200
        assert approver.post(f"{BATCHES}/{batch['id']}/confirm", json={}).status_code == 409

    def test_open_count_drops_after_confirm(self, as_cyto, as_approver, db, cyto_user, signers):
        _, batch = self._open_batch(as_cyto, db, cyto_user, signers)
        before = as_cyto().get(f"{BATCHES}/open-count").json()["count"]
        as_approver().post(f"{BATCHES}/{batch['id']}/confirm", json={})
        assert as_cyto().get(f"{BATCHES}/open-count").json()["count"] == before - 1


class TestCancel:
    def test_cancel_releases_the_case(self, as_cyto, as_approver, db, cyto_user, signers):
        case = _case(db, cyto_user[0].id)
        batch = as_cyto().post(BATCHES, json=_payload([case], signers)).json()

        r = as_approver().post(
            f"{BATCHES}/{batch['id']}/cancel", json={"reason": "หาของไม่เจอ"}
        )
        assert r.status_code == 200
        assert r.json()["status"] == "CANCELLED"
        assert r.json()["cancel_reason"] == "หาของไม่เจอ"

        db.refresh(case)
        assert case.discard_status is False
        # back on the shelf, selectable again
        r = as_cyto().get(f"{CANDIDATES}?bucket=due&search={case.accession_no}")
        assert r.json()["total"] == 1

    def test_cancel_twice_conflicts(self, as_cyto, as_approver, db, cyto_user, signers):
        case = _case(db, cyto_user[0].id)
        batch = as_cyto().post(BATCHES, json=_payload([case], signers)).json()
        approver = as_approver()
        assert approver.post(f"{BATCHES}/{batch['id']}/cancel", json={}).status_code == 200
        assert approver.post(f"{BATCHES}/{batch['id']}/cancel", json={}).status_code == 409

    def test_cytotech_cannot_cancel(self, cyto_client, db, cyto_user, signers):
        case = _case(db, cyto_user[0].id)
        batch = cyto_client.post(BATCHES, json=_payload([case], signers)).json()
        assert cyto_client.post(f"{BATCHES}/{batch['id']}/cancel", json={}).status_code == 403


class TestListAndRead:
    def test_get_missing_batch_404(self, cyto_client):
        assert cyto_client.get(f"{BATCHES}/99999999").status_code == 404

    def test_status_filter(self, as_cyto, as_approver, db, cyto_user, signers):
        case = _case(db, cyto_user[0].id)
        batch = as_cyto().post(BATCHES, json=_payload([case], signers)).json()
        as_approver().post(f"{BATCHES}/{batch['id']}/confirm", json={})

        cyto = as_cyto()
        printed = cyto.get(f"{BATCHES}?status=PRINTED&limit=200").json()
        assert batch["id"] not in [b["id"] for b in printed["items"]]
        disposed = cyto.get(f"{BATCHES}?status=DISPOSED&limit=200").json()
        assert batch["id"] in [b["id"] for b in disposed["items"]]

    def test_item_count_matches(self, cyto_client, db, cyto_user, signers):
        cases = [_case(db, cyto_user[0].id) for _ in range(3)]
        body = cyto_client.post(BATCHES, json=_payload(cases, signers)).json()
        assert body["item_count"] == 3
        assert len(body["items"]) == 3


class TestChecklistPdf:
    def test_pdf_renders_inline(self, cyto_client, db, cyto_user, signers):
        cases = [
            _case(db, cyto_user[0].id, specimen_type="Fluid"),
            _case(db, cyto_user[0].id, specimen_type="Sputum"),
        ]
        batch = cyto_client.post(BATCHES, json=_payload(cases, signers)).json()
        r = cyto_client.get(f"{BATCHES}/{batch['id']}/checklist-pdf")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert "inline" in r.headers["content-disposition"]
        assert batch["batch_no"] in r.headers["content-disposition"]
        assert r.content[:4] == b"%PDF"

    def test_grouped_by_specimen_type(self, db, cyto_user, signers, cyto_client):
        from app.crud import nongyne_specimen_disposal_batch as crud

        cases = [
            _case(db, cyto_user[0].id, specimen_type="Fluid"),
            _case(db, cyto_user[0].id, specimen_type="Fluid"),
            _case(db, cyto_user[0].id, specimen_type="Urine"),
        ]
        batch = cyto_client.post(BATCHES, json=_payload(cases, signers)).json()
        data = crud.build_disposal_checklist_data(db, batch["id"])
        assert data["total_items"] == 3
        assert data["total_groups"] == 2
        assert {g["specimen_type"] for g in data["groups"]} == {"Fluid", "Urine"}
        assert data["retention_days"] == RETENTION

    def test_uses_its_own_controlled_document_no(
        self, db, cyto_user, signers, cyto_client, retention_setting
    ):
        """The non-gyne sheet is a separate QMS form from the surgical one."""
        from app.crud import nongyne_specimen_disposal_batch as crud

        retention_setting.specimen_disposal_doc_no = "FM-PAT-025"
        retention_setting.nongyne_specimen_disposal_doc_no = "FM-CYT-011"
        db.commit()

        case = _case(db, cyto_user[0].id)
        batch = cyto_client.post(BATCHES, json=_payload([case], signers)).json()
        assert crud.build_disposal_checklist_data(db, batch["id"])["doc_no"] == "FM-CYT-011"


class TestIsolationFromSurgical:
    def test_surgical_batches_untouched(self, cyto_client, db, cyto_user, signers):
        before = db.query(SpecimenDisposalBatch).count()
        case = _case(db, cyto_user[0].id)
        assert cyto_client.post(BATCHES, json=_payload([case], signers)).status_code == 201
        assert db.query(SpecimenDisposalBatch).count() == before

    def test_surgical_endpoint_rejects_cytotech(self, cyto_client):
        """The two features have separate role gates, not one shared one."""
        assert cyto_client.get("/specimen-disposal-batches").status_code == 403
