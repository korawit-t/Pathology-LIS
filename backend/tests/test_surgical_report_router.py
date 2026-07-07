"""Router-level tests for app/routers/surgical_report.py. The crud layer
(app/crud/surgical_report.py) already has thorough coverage in
test_surgical_report.py (finalize/publish rules, cosign worklist,
pagination/filters) — this is RBAC + wiring only.

REGRESSION TEST for a real fix: unlike every other route in this file (all
gated by CAN_READ_REPORT or CAN_WRITE_REPORT), preview_report_pdf
(POST /cases/{case_id}/preview-pdf) and preview_report_data_api
(POST /cases/{case_id}/preview-data) had no dependency at all — reachable
with zero authentication. The "final" PDF endpoint two lines below
(get_latest_finalized_report_pdf) was already properly gated; only the
preview pair was missed. Fixed by adding CAN_READ_REPORT to both, matching
their siblings."""

from tests.factories import make_signable_case, build_bulk_save_payload, make_system_setting


class TestRbacReadEndpoints:
    def test_clinician_can_list_all_reports(self, clinician_client):
        assert clinician_client.get("/surgical-reports/all").status_code == 200

    def test_clinician_can_read_archive(self, clinician_client):
        assert clinician_client.get("/surgical-reports/archive").status_code == 200

    def test_requires_authentication(self, client):
        assert client.get("/surgical-reports/all").status_code == 401


class TestRbacWriteEndpoints:
    def test_clinician_cannot_finalize(self, db, clinician_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        payload = build_bulk_save_payload(case.id, specimen.id, pathologist.id)

        r = clinician_client.post(
            f"/surgical-reports/{case.id}/finalize-snapshot", json=payload.model_dump(mode="json")
        )

        assert r.status_code == 403

    def test_pathologist_can_finalize(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        payload = build_bulk_save_payload(case.id, specimen.id, pathologist.id)

        r = pathologist_client.post(
            f"/surgical-reports/{case.id}/finalize-snapshot", json=payload.model_dump(mode="json")
        )

        assert r.status_code == 200
        assert r.json()["case_id"] == case.id

    def test_clinician_cannot_delete(self, clinician_client):
        assert clinician_client.delete("/surgical-reports/999999").status_code == 403


class TestPreviewEndpointsNowRequireAuthentication:
    """See module docstring — these two previously had no dependency at
    all; now gated by CAN_READ_REPORT like every other route in the file."""

    def test_preview_data_requires_authentication(self, client):
        assert client.post("/surgical-reports/cases/1/preview-data", json={}).status_code == 401

    def test_preview_data_reachable_with_auth(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(f"/surgical-reports/cases/{case.id}/preview-data", json={})

        assert r.status_code == 200

    def test_preview_data_missing_case_returns_404(self, pathologist_client):
        assert pathologist_client.post("/surgical-reports/cases/999999/preview-data", json={}).status_code == 404

    def test_preview_pdf_requires_authentication(self, client):
        assert client.post("/surgical-reports/cases/1/preview-pdf", json={}).status_code == 401

    def test_preview_pdf_reachable_with_auth(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db)

        r = pathologist_client.post(f"/surgical-reports/cases/{case.id}/preview-pdf", json={})

        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


class TestReportByIdAndDelete:
    def test_read_by_id_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/surgical-reports/999999").status_code == 404

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/surgical-reports/999999").status_code == 404

    def test_full_lifecycle_read_print_status_delete(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        payload = build_bulk_save_payload(case.id, specimen.id, pathologist.id)
        created = pathologist_client.post(
            f"/surgical-reports/{case.id}/finalize-snapshot", json=payload.model_dump(mode="json")
        ).json()

        read = pathologist_client.get(f"/surgical-reports/{created['id']}")
        assert read.status_code == 200

        printed = pathologist_client.patch(
            f"/surgical-reports/{created['id']}/print-status", json={"is_print": True}
        )
        assert printed.status_code == 200
        assert printed.json()["is_print"] is True

        history = pathologist_client.get(f"/surgical-reports/cases/{case.id}")
        assert history.status_code == 200
        assert history.json()["total"] >= 1

        if created["status"] == "draft":
            deleted = pathologist_client.delete(f"/surgical-reports/{created['id']}")
            assert deleted.status_code == 200


class TestMarkReadAndBarcode:
    def test_mark_read_missing_returns_404(self, pathologist_client):
        assert pathologist_client.post("/surgical-reports/999999/mark-read").status_code == 404

    def test_mark_read_requires_authentication(self, client):
        assert client.post("/surgical-reports/1/mark-read").status_code == 401

    def test_barcode_pdf_no_ids_returns_400(self, pathologist_client):
        assert pathologist_client.post("/surgical-reports/barcode-pdf", json={"report_ids": []}).status_code == 400

    def test_barcode_pdf_no_valid_reports_returns_404(self, pathologist_client):
        r = pathologist_client.post("/surgical-reports/barcode-pdf", json={"report_ids": [999999]})
        assert r.status_code == 404
