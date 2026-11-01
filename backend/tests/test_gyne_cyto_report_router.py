"""Router-level tests for app/routers/gyne_cyto_report.py. Neither the
router nor app/crud/gyne_cyto_report.py had ANY test coverage before this
file (confirmed: no test_gyne_cyto_report.py existed at the crud layer
either) — so this gives fuller coverage than a typical "RBAC + wiring only"
router file, exercising publish/complete-review/pdf generation through
their real code paths rather than re-deriving business rules from scratch.

Uses tests.factories.make_pending_gyne_report for the "already published,
pending co-sign" starting state, and builds a fresh unpublished
case+diagnosis directly (via make_bare_gyne_case + create_initial_diagnosis)
for tests that need to exercise the publish transition itself."""

import uuid

from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate

from tests.conftest import _make_user
from tests.factories import make_bare_gyne_case, make_hospital, make_pending_gyne_report, make_system_setting
from tests.pdf_probe import footer_barcode_bars


class TestRbac:
    def test_clinician_cannot_read_the_lab_list(self, clinician_client):
        # CAN_READ_* lists clinician, but InternalStaffOnly closes this router
        # to clinician and hospital accounts outside the results portal.
        assert clinician_client.get("/gyne-cyto-reports").status_code == 403

    def test_clinician_cannot_publish(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))

        r = clinician_client.post(f"/gyne-cyto-reports/{case.id}/publish", json={"is_abnormal": False})

        assert r.status_code == 403

    def test_pathologist_can_publish(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))

        r = pathologist_client.post(f"/gyne-cyto-reports/{case.id}/publish", json={"is_abnormal": False})

        assert r.status_code == 200
        assert r.json()["case_id"] == case.id


class TestReadEndpoints:
    def test_list_pagination_shape(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get("/gyne-cyto-reports")

        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body

    def test_read_report_by_id(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get(f"/gyne-cyto-reports/{report.id}")

        assert r.status_code == 200
        assert r.json()["id"] == report.id

    def test_read_missing_report_returns_404(self, pathologist_client):
        assert pathologist_client.get("/gyne-cyto-reports/999999").status_code == 404

    def test_read_report_history_by_case(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get(f"/gyne-cyto-reports/cases/{case.id}")

        assert r.status_code == 200
        assert any(item["id"] == report.id for item in r.json())

    def test_pending_cosign_worklist(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get("/gyne-cyto-reports/pending-cosign")

        assert r.status_code == 200
        assert "items" in r.json()

    def test_archive_is_reachable(self, pathologist_client):
        r = pathologist_client.get("/gyne-cyto-reports/archive")
        assert r.status_code == 200
        assert "items" in r.json()


class TestCompleteReview:
    def test_pathologist_can_complete_review(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        # A pathologist's own abnormal read-out publishes directly now, so the
        # pending review has to come from someone else's sign-out.
        case, _ = make_pending_gyne_report(db, registrar.id, pathologist.id)

        r = pathologist_client.post(
            f"/gyne-cyto-reports/cases/{case.id}/complete-review",
            json={"review_result": "agree"},
        )

        assert r.status_code == 200

    def test_clinician_cannot_complete_review(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        r = clinician_client.post(
            f"/gyne-cyto-reports/cases/{case.id}/complete-review",
            json={"review_result": "agree"},
        )

        assert r.status_code == 403


class TestPdfAndPreview:
    def test_preview_data_missing_case_returns_404(self, pathologist_client):
        assert pathologist_client.post("/gyne-cyto-reports/cases/999999/preview-data").status_code == 404

    def test_report_pdf_generates_real_pdf_bytes(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get(f"/gyne-cyto-reports/{report.id}/pdf")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_preview_pdf_missing_case_returns_404(self, pathologist_client):
        assert pathologist_client.get("/gyne-cyto-reports/cases/999999/preview-pdf").status_code == 404

    def test_with_barcode_puts_a_barcode_in_the_footer(self, db, pathologist_client, admin_user, pathologist_user):
        """The print queue asks for with_barcode; every other caller must keep
        getting the report exactly as it was, with a bare footer."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        case.vn = "690807084156"
        db.commit()

        plain = pathologist_client.get(f"/gyne-cyto-reports/{report.id}/pdf")
        coded = pathologist_client.get(f"/gyne-cyto-reports/{report.id}/pdf?with_barcode=true")

        assert not footer_barcode_bars(plain.content)
        assert footer_barcode_bars(coded.content)

    def test_no_footer_barcode_when_the_case_has_no_visit(self, db, pathologist_client, admin_user, pathologist_user):
        """Cases from before gyne had vn/an columns have neither. The label
        sheet still falls back to the HN for in-lab tracking, but the report
        footer would carry a barcode the HIS cannot resolve, so it is left
        off."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        assert not case.vn and not case.an

        r = pathologist_client.get(f"/gyne-cyto-reports/{report.id}/pdf?with_barcode=true")

        assert r.status_code == 200
        assert not footer_barcode_bars(r.content)


class TestPrintStatusAndMarkRead:
    def test_update_print_status(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.patch(f"/gyne-cyto-reports/{report.id}/print-status", json={"is_print": True})

        assert r.status_code == 200
        assert r.json()["is_print"] is True

    def test_update_print_status_missing_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/gyne-cyto-reports/999999/print-status", json={"is_print": True}).status_code == 404

    def test_mark_read_is_scoped_to_the_clinicians_hospitals(self, db, client, admin_user, pathologist_user):
        # The results portal marks a report read when it opens it. It used to
        # accept any report id from any account.
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        own, other = make_hospital(db), make_hospital(db)
        report.hospital_id = own.id
        db.commit()

        for hospital, expected in ((other, 403), (own, 200)):
            clinician, pwd = _make_user(db, f"clin_{uuid.uuid4().hex[:8]}", "ClinPass1!", ["clinician"])
            clinician.hospitals = [hospital]
            db.commit()
            client.post("/auth/login", data={"username": clinician.username, "password": pwd})

            assert client.post(f"/gyne-cyto-reports/{report.id}/mark-read").status_code == expected

    def test_mark_read_missing_returns_404(self, pathologist_client):
        assert pathologist_client.post("/gyne-cyto-reports/999999/mark-read").status_code == 404


class TestBarcodePdf:
    def test_generates_pdf_for_valid_report_ids(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.post("/gyne-cyto-reports/barcode-pdf", json={"report_ids": [report.id]})

        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_no_report_ids_returns_400(self, pathologist_client):
        assert pathologist_client.post("/gyne-cyto-reports/barcode-pdf", json={"report_ids": []}).status_code == 400

    def test_no_valid_reports_returns_404(self, pathologist_client):
        assert pathologist_client.post("/gyne-cyto-reports/barcode-pdf", json={"report_ids": [999999]}).status_code == 404


def test_requires_authentication(client):
    assert client.get("/gyne-cyto-reports").status_code == 401
