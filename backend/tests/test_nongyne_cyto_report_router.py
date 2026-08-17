"""Router-level tests for app/routers/nongyne_cyto_report.py. Mirrors
test_gyne_cyto_report_router.py's approach (neither the router nor
app/crud/nongyne_cyto_report.py had any test coverage before this file).
Unlike Gyne, there is no QC-review workflow here — publish_nongyne_report
lands the report in PENDING_APPROVAL only when enable_non_gyne_approve_system
is on (mirrors Surgical's enable_approve_system; see
tests.factories.make_pending_nongyne_report's docstring), so there's no
complete-review endpoint/test class to mirror."""

from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate

from tests.factories import make_bare_nongyne_case, make_pending_nongyne_report, make_system_setting
from tests.pdf_probe import footer_barcode_bars


class TestRbac:
    def test_clinician_can_read_list(self, clinician_client):
        assert clinician_client.get("/nongyne-cyto-reports").status_code == 200

    def test_clinician_cannot_publish(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))

        r = clinician_client.post(f"/nongyne-cyto-reports/{case.id}/publish", json={})

        assert r.status_code == 403

    def test_pathologist_can_publish(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))

        r = pathologist_client.post(f"/nongyne-cyto-reports/{case.id}/publish", json={})

        assert r.status_code == 200
        assert r.json()["case_id"] == case.id


class TestDiagnosticFlags:
    """has_malignancy/has_critical are set via a PATCH to the case (nongyne
    diagnosis form), then must round-trip through GET /nongyne-cytology/{id}
    (NongyneCytologyCaseResponse previously omitted both fields entirely, so
    a saved value could never be read back) and flow into the published
    report snapshot the same way is_pending already does."""

    def test_case_update_and_get_round_trip_both_flags(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        r = pathologist_client.patch(
            f"/nongyne-cytology/{case.id}",
            json={"has_malignancy": True, "has_critical": True},
        )
        assert r.status_code == 200
        assert r.json()["has_malignancy"] is True
        assert r.json()["has_critical"] is True

        r = pathologist_client.get(f"/nongyne-cytology/{case.id}")
        assert r.status_code == 200
        assert r.json()["has_malignancy"] is True
        assert r.json()["has_critical"] is True

    def test_publish_snapshots_both_flags_onto_report(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))

        pathologist_client.patch(
            f"/nongyne-cytology/{case.id}",
            json={"has_malignancy": True, "has_critical": True},
        )

        r = pathologist_client.post(f"/nongyne-cyto-reports/{case.id}/publish", json={})

        assert r.status_code == 200
        assert r.json()["has_malignancy"] is True
        assert r.json()["has_critical"] is True


class TestReadEndpoints:
    def test_list_pagination_shape(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get("/nongyne-cyto-reports")

        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body

    def test_read_report_by_id(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get(f"/nongyne-cyto-reports/{report.id}")

        assert r.status_code == 200
        assert r.json()["id"] == report.id

    def test_read_missing_report_returns_404(self, pathologist_client):
        assert pathologist_client.get("/nongyne-cyto-reports/999999").status_code == 404

    def test_read_report_history_by_case(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get(f"/nongyne-cyto-reports/cases/{case.id}")

        assert r.status_code == 200
        assert any(item["id"] == report.id for item in r.json())

    def test_pending_cosign_worklist(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get("/nongyne-cyto-reports/pending-cosign")

        assert r.status_code == 200
        assert "items" in r.json()

    def test_archive_is_reachable(self, pathologist_client):
        r = pathologist_client.get("/nongyne-cyto-reports/archive")
        assert r.status_code == 200
        assert "items" in r.json()


class TestPdfAndPreview:
    def test_preview_data_missing_case_returns_404(self, pathologist_client):
        assert pathologist_client.post("/nongyne-cyto-reports/cases/999999/preview-data").status_code == 404

    def test_report_pdf_generates_real_pdf_bytes(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.get(f"/nongyne-cyto-reports/{report.id}/pdf")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_preview_pdf_missing_case_returns_404(self, pathologist_client):
        assert pathologist_client.get("/nongyne-cyto-reports/cases/999999/preview-pdf").status_code == 404

    def test_with_barcode_puts_a_barcode_in_the_footer(self, db, pathologist_client, admin_user, pathologist_user):
        """The print queue asks for with_barcode; every other caller must keep
        getting the report exactly as it was, with a bare footer."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        case, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        case.vn = "690807084156"
        db.commit()

        plain = pathologist_client.get(f"/nongyne-cyto-reports/{report.id}/pdf")
        coded = pathologist_client.get(f"/nongyne-cyto-reports/{report.id}/pdf?with_barcode=true")

        assert not footer_barcode_bars(plain.content)
        assert footer_barcode_bars(coded.content)

    def test_no_footer_barcode_when_the_case_has_no_visit(self, db, pathologist_client, admin_user, pathologist_user):
        """Cases registered before non-gyne captured VN/AN have neither. The
        label sheet still falls back to the accession number for in-lab
        tracking, but the report footer would carry a barcode the HIS cannot
        resolve, so it is left off."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        case, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        assert not case.vn and not case.an

        r = pathologist_client.get(f"/nongyne-cyto-reports/{report.id}/pdf?with_barcode=true")

        assert r.status_code == 200
        assert not footer_barcode_bars(r.content)


class TestPrintStatusAndMarkRead:
    def test_update_print_status(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.patch(f"/nongyne-cyto-reports/{report.id}/print-status", json={"is_print": True})

        assert r.status_code == 200
        assert r.json()["is_print"] is True

    def test_update_print_status_missing_returns_404(self, pathologist_client):
        assert pathologist_client.patch("/nongyne-cyto-reports/999999/print-status", json={"is_print": True}).status_code == 404

    def test_mark_read_only_requires_authentication_not_a_role(self, db, clinician_client, admin_user, pathologist_user):
        # Same finding as gyne_cyto_report: this route only depends on
        # get_current_user, unlike its siblings' CAN_READ/CAN_WRITE gates —
        # clinician is in both anyway so nothing is under-protected today.
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = clinician_client.post(f"/nongyne-cyto-reports/{report.id}/mark-read")

        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_mark_read_missing_returns_404(self, pathologist_client):
        assert pathologist_client.post("/nongyne-cyto-reports/999999/mark-read").status_code == 404


class TestBarcodePdf:
    def test_generates_pdf_for_valid_report_ids(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db)
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.post("/nongyne-cyto-reports/barcode-pdf", json={"report_ids": [report.id]})

        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_no_report_ids_returns_400(self, pathologist_client):
        assert pathologist_client.post("/nongyne-cyto-reports/barcode-pdf", json={"report_ids": []}).status_code == 400

    def test_no_valid_reports_returns_404(self, pathologist_client):
        assert pathologist_client.post("/nongyne-cyto-reports/barcode-pdf", json={"report_ids": [999999]}).status_code == 404


def test_requires_authentication(client):
    assert client.get("/nongyne-cyto-reports").status_code == 401
