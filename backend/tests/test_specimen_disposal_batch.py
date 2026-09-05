"""Tests for the specimen disposal checklist flow
(app/routers/specimen_disposal_batch.py + app/crud/specimen_disposal_batch.py).

The whole point of the feature is that a specimen cannot be marked disposed
without a printed sheet that three people signed, so the tests care most about
the guards: no double-listing a case, no confirming twice, and the case's
discard_by_id ending up as the person who actually did the disposing rather
than whoever clicked confirm.
"""

import uuid
from datetime import timedelta

import pytest
from passlib.context import CryptContext

from app.models.specimen_disposal_batch import SpecimenDisposalBatch
from app.models.surgical_case import SurgicalCase
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.utils.time import local_now
from tests.factories import make_bare_case

_pwd = CryptContext(schemes=["argon2"], deprecated="auto")

RETENTION = 30


@pytest.fixture(autouse=True)
def retention_setting(db):
    """Pin the retention rule so the gate tests don't depend on whatever the
    settings row happens to hold from an earlier test in the same run."""
    settings = db.query(SystemSetting).first()
    if not settings:
        settings = SystemSetting(hospital_slug="master")
        db.add(settings)
    settings.specimen_retention_days = RETENTION
    db.commit()
    return settings


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


def _stored_case(
    db,
    registrar_id: int,
    container: str = "B-12",
    *,
    days_ago: int = RETENTION * 3,
    reported: bool = True,
    is_pending: bool = False,
    is_cancelled: bool = False,
) -> SurgicalCase:
    """A stored case old enough to dispose unless a test says otherwise.

    days_ago backdates report_at, which is what the retention gate measures —
    without it every case would be a day old and fail the gate.
    """
    case = make_bare_case(db, registrar_id=registrar_id)
    case.specimen_storage_status = "Stored"
    case.specimen_storage_container = container
    case.specimen_storage_at = local_now()
    case.report_at = local_now() - timedelta(days=days_ago) if reported else None
    case.is_pending = is_pending
    case.is_cancelled = is_cancelled
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
        assert body["retention_days"] == RETENTION
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

    @pytest.mark.parametrize("external_role", ["clinician", "hospital"])
    def test_rejects_a_signer_from_outside_the_lab(
        self, db, admin_client, admin_user, signers, external_role
    ):
        """clinician/hospital เป็นบัญชีผู้ส่งตรวจ ไม่มีทางยืนหน้าตู้เก็บชิ้นเนื้อ
        — ต้องกันที่ API ด้วย ไม่ใช่แค่ซ่อนใน dropdown"""
        registrar, _ = admin_user
        _, verifier, approver = signers
        outsider, _ = _make_user(db, [external_role], external_role)
        case = _stored_case(db, registrar.id)

        r = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [case.id],
                "disposer_id": outsider.id,
                "verifier_id": verifier.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400
        assert "ผู้ทิ้ง" in r.json()["detail"]

    def test_rejects_an_outside_verifier_or_approver_too(
        self, db, admin_client, admin_user, signers
    ):
        registrar, _ = admin_user
        disposer, verifier, _ = signers
        outsider, _ = _make_user(db, ["clinician"], "clin")
        case = _stored_case(db, registrar.id)

        as_verifier = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [case.id],
                "disposer_id": disposer.id,
                "verifier_id": outsider.id,
                "approver_id": verifier.id,
            },
        )
        assert as_verifier.status_code == 400
        assert "ผู้ตรวจสอบ" in as_verifier.json()["detail"]

        as_approver = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [case.id],
                "disposer_id": disposer.id,
                "verifier_id": verifier.id,
                "approver_id": outsider.id,
            },
        )
        assert as_approver.status_code == 400
        assert "ผู้อนุมัติ" in as_approver.json()["detail"]

    def test_rejects_a_signer_holding_an_external_role_alongside_a_lab_role(
        self, db, admin_client, admin_user, signers
    ):
        """roles เป็น list — บัญชีที่มีทั้ง gross และ clinician ก็ยังถือว่าอยู่นอกแลป"""
        registrar, _ = admin_user
        _, verifier, approver = signers
        mixed, _ = _make_user(db, ["gross", "clinician"], "mixed")
        case = _stored_case(db, registrar.id)

        r = admin_client.post(
            "/specimen-disposal-batches",
            json={
                "case_ids": [case.id],
                "disposer_id": mixed.id,
                "verifier_id": verifier.id,
                "approver_id": approver.id,
            },
        )
        assert r.status_code == 400

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


class TestRetentionGate:
    """เกณฑ์อายุบังคับที่ backend ไม่ใช่แค่ซ่อนปุ่มบนจอ — ยิง POST ตรงก็ต้องโดนปฏิเสธ"""

    def test_rejects_a_case_that_has_not_reached_retention(
        self, db, admin_client, admin_user, signers
    ):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, days_ago=RETENTION - 1)

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert f"ยังไม่ครบ {RETENTION} วัน" in detail
        assert case.accession_no in detail
        assert f"{RETENTION - 1} วัน" in detail

    def test_exactly_retention_days_is_accepted(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, days_ago=RETENTION)

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 201, r.text

    def test_one_young_case_blocks_the_whole_sheet(
        self, db, admin_client, admin_user, signers
    ):
        """ใบเดียวปนเคสที่ยังไม่ครบกำหนด = ทั้งใบต้องไม่ถูกสร้าง
        ไม่ใช่สร้างแบบตัดเคสนั้นออกเงียบ ๆ แล้วคนถือกระดาษไม่รู้ตัว"""
        registrar, _ = admin_user
        old_case = _stored_case(db, registrar.id)
        young = _stored_case(db, registrar.id, days_ago=1)
        # นับก่อน/หลัง ไม่ใช่ == 0 เพราะเทสต์อื่นใน run เดียวกัน commit ใบไว้แล้ว
        before = db.query(SpecimenDisposalBatch).count()

        r = admin_client.post(
            "/specimen-disposal-batches", json=_payload([old_case, young], signers)
        )
        assert r.status_code == 400
        assert young.accession_no in r.json()["detail"]
        assert db.query(SpecimenDisposalBatch).count() == before

    def test_rejects_a_case_with_no_report_date(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, reported=False)

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยังไม่ได้รายงานผล" in r.json()["detail"]

    def test_rejects_a_pending_case(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, is_pending=True)

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 400
        assert "Pending" in r.json()["detail"]

    def test_rejects_a_cancelled_case(self, db, admin_client, admin_user, signers):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, is_cancelled=True)

        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 400
        assert "ยกเลิก" in r.json()["detail"]


class TestRetentionSetting:
    def test_gate_follows_the_setting(
        self, db, admin_client, admin_user, signers, retention_setting
    ):
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, days_ago=10)
        assert admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).status_code == 400

        retention_setting.specimen_retention_days = 7
        db.commit()
        r = admin_client.post("/specimen-disposal-batches", json=_payload([case], signers))
        assert r.status_code == 201, r.text

    def test_client_cannot_supply_retention_days(self, db, admin_client, admin_user, signers):
        """รับค่าจาก payload เมื่อไหร่ คนยิง API ก็ส่ง 0 มาข้ามเกณฑ์ได้ทันที"""
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id, days_ago=1)

        payload = _payload([case], signers) | {"retention_days": 0}
        r = admin_client.post("/specimen-disposal-batches", json=payload)
        assert r.status_code == 400
        assert f"ยังไม่ครบ {RETENTION} วัน" in r.json()["detail"]

    def test_stored_picker_reports_the_same_criterion(self, admin_client, retention_setting):
        """หน้าจอต้องได้เกณฑ์จาก server ไม่ใช่ hardcode เลขของตัวเอง"""
        r = admin_client.get("/surgical-cases/stored/specimens", params={"limit": 1})
        assert r.status_code == 200
        assert r.json()["retention_days"] == RETENTION


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
            printed_by_id=registrar.id,
        )

        data = build_disposal_checklist_data(db, batch.id)
        assert [g["container"] for g in data["groups"]] == ["B-12", "B-13"]
        assert [g["count"] for g in data["groups"]] == [2, 1]
        assert data["total_items"] == 3
        assert data["total_containers"] == 2
        assert data["disposer_name"] == disposer.full_name
        # อายุนับจาก report_at ที่ _stored_case ย้อนไว้ — เป็นตัวเลข ไม่ใช่ "-"
        assert data["groups"][0]["rows"][0]["age_days"] == RETENTION * 3

        # วันที่จัดเก็บพิมพ์ต่อจากชื่อผู้ป่วย ให้เทียบกับสติกเกอร์บนกล่องได้
        today_str = local_now().strftime("%d/%m/%Y")
        assert data["groups"][0]["rows"][0]["storage_date"] == today_str

    def test_row_shows_a_dash_when_the_storage_date_is_missing(
        self, db, admin_user, signers
    ):
        from app.crud.specimen_disposal_batch import (
            build_disposal_checklist_data,
            create_batch,
        )

        registrar, _ = admin_user
        disposer, verifier, approver = signers
        case = _stored_case(db, registrar.id)
        case.specimen_storage_at = None
        db.commit()

        batch = create_batch(
            db,
            case_ids=[case.id],
            disposer_id=disposer.id,
            verifier_id=verifier.id,
            approver_id=approver.id,
            printed_by_id=registrar.id,
        )
        data = build_disposal_checklist_data(db, batch.id)
        assert data["groups"][0]["rows"][0]["storage_date"] == "-"

    def test_pdf_survives_a_case_with_no_report_date(self, db, admin_client, admin_user, signers):
        """report_at ถูกล้างทีหลังได้ (แก้เคส/ถอนผล) ใบที่พิมพ์ไปแล้วต้องยังเรนเดอร์ได้

        ล้างหลังสร้างใบ เพราะตอนสร้าง gate บังคับว่าต้องมี report_at อยู่แล้ว
        """
        registrar, _ = admin_user
        case = _stored_case(db, registrar.id)

        batch = admin_client.post(
            "/specimen-disposal-batches", json=_payload([case], signers)
        ).json()

        case.report_at = None
        db.commit()

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
        # ย้อนวันรายงานผลให้พ้นเกณฑ์ ไม่งั้นโดน retention gate ปฏิเสธก่อน
        case.report_at = local_now() - timedelta(days=RETENTION * 3)
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
