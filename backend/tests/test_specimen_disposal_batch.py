"""Tests for the specimen disposal checklist flow
(app/routers/specimen_disposal_batch.py + app/crud/specimen_disposal_batch.py).

The whole point of the feature is that a specimen cannot be marked disposed
without a printed sheet that three people signed, so the tests care most about
the guards: no double-listing a case, no confirming twice, and the case's
discard_by_id ending up as the person who actually did the disposing rather
than whoever clicked confirm.
"""

import uuid

import pytest
from passlib.context import CryptContext

from app.models.specimen_disposal_batch import SpecimenDisposalBatch
from app.models.surgical_case import SurgicalCase
from app.models.user import User
from app.utils.time import local_now
from tests.factories import make_bare_case

_pwd = CryptContext(schemes=["argon2"], deprecated="auto")


def _make_user(db, roles: list[str], prefix: str) -> tuple[User, str]:
    password = "StoragePass1!"
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


@pytest.fixture
def gross_user(db):
    """gross holds CAN_MANAGE_SPECIMEN_STORAGE but not CAN_APPROVE_SPECIMEN_DISPOSAL."""
    return _make_user(db, ["gross"], "gross")


@pytest.fixture
def gross_client(client, gross_user):
    user, pwd = gross_user
    r = client.post("/auth/login", data={"username": user.username, "password": pwd})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def signers(db):
    disposer, _ = _make_user(db, ["gross"], "disposer")
    verifier, _ = _make_user(db, ["histo"], "verifier")
    approver, _ = _make_user(db, ["lab_manager"], "approver")
    return disposer, verifier, approver


def _stored_case(db, registrar_id: int, container: str = "B-12") -> SurgicalCase:
    case = make_bare_case(db, registrar_id=registrar_id)
    case.specimen_storage_status = "Stored"
    case.specimen_storage_container = container
    case.specimen_storage_at = local_now()
    case.report_at = local_now()
    db.commit()
    db.refresh(case)
    return case


def _payload(cases, signers, retention_days: int = 90) -> dict:
    disposer, verifier, approver = signers
    return {
        "case_ids": [c.id for c in cases],
        "disposer_id": disposer.id,
        "verifier_id": verifier.id,
        "approver_id": approver.id,
        "retention_days": retention_days,
    }


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/specimen-disposal-batches").status_code == 401

    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/specimen-disposal-batches").status_code == 403

    def test_clinician_cannot_create(self, db, clinician_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        r = clinician_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 403

    def test_gross_can_create_but_not_confirm(self, db, gross_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        created = gross_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert created.status_code == 201, created.text

        # ยืนยันการทำลายเป็นการปิดรายการถาวร จึงต้องเป็นระดับหัวหน้าเท่านั้น
        confirmed = gross_client.post(
            f"/specimen-disposal-batches/{created.json()['id']}/confirm", json={}
        )
        assert confirmed.status_code == 403


class TestCreateBatch:
    def test_creates_batch_with_items_and_snapshots(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        disposer, verifier, approver = signers
        cases = [
            _stored_case(db, registrar.id, container="B-12"),
            _stored_case(db, registrar.id, container="B-13"),
        ]

        r = admin_client.post("/specimen-disposal-batches", json=_payload(cases, signers))
        assert r.status_code == 201, r.text
        body = r.json()

        assert body["batch_no"].startswith("DSP-")
        assert body["status"] == "PRINTED"
        assert body["retention_days"] == 90
        assert body["item_count"] == 2
        assert body["disposer_name"] == disposer.full_name
        assert body["verifier_name"] == verifier.full_name
        assert body["approver_name"] == approver.full_name
        assert sorted(i["container_snapshot"] for i in body["items"]) == ["B-12", "B-13"]
        assert {i["accession_no"] for i in body["items"]} == {c.accession_no for c in cases}

    def test_batch_numbers_are_sequential(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        first = admin_client.post(
            "/specimen-disposal-batches", json=_payload([_stored_case(db, registrar.id)], signers)
        ).json()
        second = admin_client.post(
            "/specimen-disposal-batches", json=_payload([_stored_case(db, registrar.id)], signers)
        ).json()

        seq = lambda b: int(b["batch_no"].split("-")[-1])  # noqa: E731
        assert seq(second) == seq(first) + 1

    def test_rejects_case_already_on_an_open_sheet(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        assert admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).status_code == 201

        again = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert again.status_code == 400
        assert case.accession_no in again.json()["detail"]

    def test_rejects_already_disposed_case(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        case.discard_status = True
        db.commit()

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 400
        assert "ทำลายไปแล้ว" in r.json()["detail"]

    def test_rejects_unstored_case(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)  # ยังไม่ได้จัดเก็บ

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยังไม่ได้จัดเก็บ" in r.json()["detail"]

    def test_rejects_unknown_case_id(self, admin_client, signers):
        disposer, verifier, approver = signers
        r = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [9_999_999],
                "disposer_id": disposer.id,
                "verifier_id": verifier.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400

    def test_rejects_verifier_same_as_disposer(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        disposer, _, approver = signers
        case = _stored_case(db, registrar.id)

        r = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [case.id],
                "disposer_id": disposer.id,
                "verifier_id": disposer.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400
        assert "ผู้ตรวจสอบ" in r.json()["detail"]

    def test_rejects_empty_case_list(self, admin_client, signers):
        disposer, verifier, approver = signers
        r = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [],
                "disposer_id": disposer.id,
                "verifier_id": verifier.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 422


class TestStoredListExclusion:
    def test_open_batch_cases_drop_out_of_the_stored_picker(
        self, db, admin_client, admin_user, signers
    ):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)

        def stored_ids(exclude: bool):
            r = admin_client.get(
                "/surgical-cases/stored/specimens",
                params={"limit": 500, "exclude_in_open_batch": exclude},
            )
            assert r.status_code == 200
            return {c["id"] for c in r.json()["items"]}

        assert case.id in stored_ids(False)
        admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))

        assert case.id not in stored_ids(True)
        assert case.id in stored_ids(False)


class TestConfirm:
    def test_confirm_disposes_every_case_and_credits_the_disposer(
        self, db, admin_client, admin_user, signers
    ):
        registrar, _ = admin_user
        disposer, _, _ = signers
        cases = [_stored_case(db, registrar.id), _stored_case(db, registrar.id)]
        batch_id = admin_client.post(
            "/specimen-disposal-batches", json=_payload(cases, signers)
        ).json()["id"]

        r = admin_client.post(
            f"/specimen-disposal-batches/{batch_id}/confirm",
            json={"disposal_method": "เตาเผาขยะติดเชื้อ", "remark": "ครบทุกรายการ"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "DISPOSED"
        assert body["disposal_method"] == "เตาเผาขยะติดเชื้อ"
        assert body["disposed_at"] is not None

        for case in cases:
            db.refresh(case)
            assert case.discard_status is True
            assert case.specimen_storage_status == "Discarded"
            assert case.discard_at is not None
            # คนที่ลงมือทิ้งและเซ็นบนกระดาษ ไม่ใช่คนที่กดยืนยันในระบบ (admin)
            assert case.discard_by_id == disposer.id

    def test_confirmed_cases_show_up_in_the_disposed_tab(
        self, db, admin_client, admin_user, signers
    ):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        batch_id = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()["id"]
        admin_client.post(f"/specimen-disposal-batches/{batch_id}/confirm", json={})

        r = admin_client.get("/surgical-cases/disposed/specimens", params={"limit": 500})
        assert r.status_code == 200
        assert case.id in {c["id"] for c in r.json()["items"]}

    def test_confirming_twice_is_a_conflict(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        batch_id = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()["id"]

        assert admin_client.post(
            f"/specimen-disposal-batches/{batch_id}/confirm", json={}
        ).status_code == 200
        assert admin_client.post(
            f"/specimen-disposal-batches/{batch_id}/confirm", json={}
        ).status_code == 409

    def test_confirm_unknown_batch_is_404(self, admin_client):
        assert admin_client.post(
            "/specimen-disposal-batches/999999/confirm", json={}
        ).status_code == 404


class TestCancel:
    def test_cancel_returns_cases_to_the_stored_picker(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        batch_id = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()["id"]

        r = admin_client.post(
            f"/specimen-disposal-batches/{batch_id}/cancel", json={"reason": "พิมพ์ผิดกล่อง"}
        )
        assert r.status_code == 200
        assert r.json()["status"] == "CANCELLED"
        assert r.json()["cancel_reason"] == "พิมพ์ผิดกล่อง"

        db.refresh(case)
        assert case.discard_status is False

        listed = admin_client.get(
            "/surgical-cases/stored/specimens",
            params={"limit": 500, "exclude_in_open_batch": True},
        ).json()["items"]
        assert case.id in {c["id"] for c in listed}

    def test_cannot_cancel_a_disposed_sheet(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        batch_id = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()["id"]
        admin_client.post(f"/specimen-disposal-batches/{batch_id}/confirm", json={})

        assert admin_client.post(
            f"/specimen-disposal-batches/{batch_id}/cancel", json={}
        ).status_code == 409


class TestListAndRead:
    def test_list_filters_by_status_and_counts_open_sheets(
        self, db, admin_client, admin_user, signers
    ):
        registrar, _ = admin_user
        batch_id = admin_client.post(
            "/specimen-disposal-batches", json=_payload([_stored_case(db, registrar.id)], signers)
        ).json()["id"]

        before = admin_client.get("/specimen-disposal-batches/open-count").json()["count"]
        assert before >= 1

        listed = admin_client.get(
            "/specimen-disposal-batches", params={"status": "PRINTED", "limit": 500}
        )
        assert listed.status_code == 200
        assert batch_id in {b["id"] for b in listed.json()["items"]}
        assert all(b["status"] == "PRINTED" for b in listed.json()["items"])

        admin_client.post(f"/specimen-disposal-batches/{batch_id}/confirm", json={})
        after = admin_client.get("/specimen-disposal-batches/open-count").json()["count"]
        assert after == before - 1

    def test_read_unknown_batch_is_404(self, admin_client):
        assert admin_client.get("/specimen-disposal-batches/999999").status_code == 404


class TestChecklistPdf:
    def test_renders_a_pdf_grouped_by_container(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        cases = [
            _stored_case(db, registrar.id, container="B-12"),
            _stored_case(db, registrar.id, container="B-12"),
            _stored_case(db, registrar.id, container="B-13"),
        ]
        batch = admin_client.post(
            "/specimen-disposal-batches", json=_payload(cases, signers)
        ).json()

        r = admin_client.get(f"/specimen-disposal-batches/{batch['id']}/checklist-pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert batch["batch_no"] in r.headers["content-disposition"]
        assert r.content[:4] == b"%PDF"

    def test_template_data_groups_and_ages_the_rows(self, db, admin_user, signers):
        from app.crud.specimen_disposal_batch import (
            build_disposal_checklist_data,
            create_batch,
        )

        registrar, _ = admin_user
        disposer, verifier, approver = signers
        cases = [
            _stored_case(db, registrar.id, container="B-13"),
            _stored_case(db, registrar.id, container="B-12"),
            _stored_case(db, registrar.id, container="B-12"),
        ]
        batch = create_batch(
            db,
            case_ids=[c.id for c in cases],
            disposer_id=disposer.id,
            verifier_id=verifier.id,
            approver_id=approver.id,
            retention_days=90,
            printed_by_id=registrar.id,
        )

        data = build_disposal_checklist_data(db, batch.id)
        assert [g["container"] for g in data["groups"]] == ["B-12", "B-13"]
        assert [g["count"] for g in data["groups"]] == [2, 1]
        assert data["total_items"] == 3
        assert data["total_containers"] == 2
        assert data["disposer_name"] == disposer.full_name
        # report_at ตั้งเป็นวันนี้ อายุจึงเป็น 0 วัน ไม่ใช่ "-"
        assert data["groups"][0]["rows"][0]["age_days"] == 0

    def test_pdf_survives_a_case_with_no_report_date(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)
        case.report_at = None
        db.commit()

        batch = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()
        r = admin_client.get(f"/specimen-disposal-batches/{batch['id']}/checklist-pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


class TestControlledDocumentNo:
    """เลขคุมเอกสารมาจาก system setting ไม่ใช่ค่าตายในเทมเพลต"""

    def test_doc_no_flows_from_system_setting_to_the_sheet(self, db, admin_user, signers):
        from app.crud.specimen_disposal_batch import (
            build_disposal_checklist_data,
            create_batch,
        )
        from tests.factories import make_system_setting

        make_system_setting(db, specimen_disposal_doc_no="FM-PAT-025 แก้ไขครั้งที่ 01")

        registrar, _ = admin_user
        disposer, verifier, approver = signers
        batch = create_batch(
            db,
            case_ids=[_stored_case(db, registrar.id).id],
            disposer_id=disposer.id,
            verifier_id=verifier.id,
            approver_id=approver.id,
            retention_days=None,
            printed_by_id=registrar.id,
        )

        data = build_disposal_checklist_data(db, batch.id)
        assert data["doc_no"] == "FM-PAT-025 แก้ไขครั้งที่ 01"

    def test_sheet_prints_without_a_doc_no_configured(self, db, admin_client, admin_user, signers):
        from tests.factories import make_system_setting

        make_system_setting(db)  # ไม่ตั้งเลขเอกสาร

        registrar, _ = admin_user
        batch = admin_client.post(
            "/specimen-disposal-batches",
            json=_payload([_stored_case(db, registrar.id)], signers),
        ).json()

        r = admin_client.get(f"/specimen-disposal-batches/{batch['id']}/checklist-pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


class TestPatientNameOnTheSheet:
    def test_uses_title_plus_first_name_plus_last_name(self, db, admin_client, admin_user, signers):
        """ชื่อบนใบต้องตรงกับสติกเกอร์บนกล่อง — ชื่อต้นอย่างเดียวเทียบไม่ได้"""
        from app.models.organization import Title
        from app.models.patient import Patient

        title = db.query(Title).filter(Title.title == "นาง").first()
        if not title:
            title = Title(title="นาง")
            db.add(title)
            db.commit()
            db.refresh(title)

        patient = Patient(name="สมศรี", ln="ใจงาม", title_id=title.id)
        db.add(patient)
        db.commit()
        db.refresh(patient)

        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id, patient=patient)
        case.specimen_storage_status = "Stored"
        case.specimen_storage_container = "B-99"
        case.report_at = local_now()
        db.commit()

        batch = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()
        assert batch["items"][0]["patient_name"] == "นางสมศรี ใจงาม"


class TestNoBypass:
    def test_direct_bulk_dispose_endpoint_is_gone(self, admin_client):
        """ทางเดียวที่ทิ้งได้คือผ่านใบตรวจสอบ — ปุ่มกดทิ้งทันทีถูกถอดออกแล้ว"""
        r = admin_client.post(
            "/surgical-cases/storage/bulk-dispose", json={"case_ids": [1]}
        )
        assert r.status_code in (404, 405)

    def test_storage_endpoints_are_role_gated(self, clinician_client):
        assert clinician_client.get("/surgical-cases/stored/specimens").status_code == 403
        assert clinician_client.get("/surgical-cases/unstored/specimens").status_code == 403
        assert clinician_client.get("/surgical-cases/disposed/specimens").status_code == 403
