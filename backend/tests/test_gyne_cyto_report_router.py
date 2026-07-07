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

from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate

from tests.factories import make_bare_gyne_case, make_pending_gyne_report, make_system_setting


class TestRbac:
    def test_clinician_can_read_list(self, clinician_client):
        assert clinician_client.get("/gyne-cyto-reports").status_code == 200

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
    def test_pathologist_can_complete_review(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        pathologist_client.post(f"/gyne-cyto-reports/{case.id}/publish", json={"is_abnormal": True})

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

    def test_mark_read_only_requires_authentication_not_a_role(self, db, clinician_client, admin_user, pathologist_user):
        # Documents current behavior: this route only depends on
        # get_current_user (any authenticated user), unlike its siblings
        # which require CAN_READ_GYNE_CYTO_REPORT/CAN_WRITE_GYNE_CYTO_REPORT
        # (clinician happens to be in both anyway, so this doesn't currently
        # under-protect anything — noted for the consolidated RBAC report).
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = clinician_client.post(f"/gyne-cyto-reports/{report.id}/mark-read")

        assert r.status_code == 200
        assert r.json()["success"] is True

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
