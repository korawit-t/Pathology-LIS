"""Tests for app/crud/surgical_report_builder.py — the report-content
assembly helpers behind prepare_report_data (diagnosis grouping/rendering,
patient age calc, submitted-sections text, ICD-O lookup, image encoding).
Previously reached only transitively through routers, never unit tested."""

from datetime import date, datetime

from PIL import Image

from app.crud.surgical_report_builder import (
    _darken_hex,
    _calculate_patient_age,
    _build_submitted_text,
    get_image_base64_from_path,
    _get_grouped_diagnoses,
    _get_microscopic_summary,
    _get_diagnosis_html_summary,
    _get_icd_o_for_report,
    prepare_report_data,
)
from app.crud.surgical_diagnosis import create_diagnosis
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.schemas.surgical_diagnosis import SurgicalDiagnosisCreate
from app.enums.surgical_diagnosis_enums import DiagnosisLevel, DiagnosisStatus
from app.models.surgical_report import ReportStatus
from app.models.tumor_registry import TumorRegistry

from tests.factories import (
    make_signable_case,
    build_bulk_save_payload,
    make_system_setting,
    clear_system_settings,
)


class TestDarkenHex:
    def test_darkens_each_channel(self):
        assert _darken_hex("#0056b3", factor=0.5) == "#002b59"

    def test_handles_hash_prefix_present_or_absent(self):
        assert _darken_hex("#ffffff", factor=0.5) == _darken_hex("ffffff", factor=0.5)


class TestCalculatePatientAge:
    def test_no_birth_date_returns_dash(self):
        assert _calculate_patient_age(None) == {"years": None, "display": "-"}

    def test_two_years_or_older_shows_years_only(self):
        ref = date(2026, 1, 1)
        result = _calculate_patient_age(date(2023, 1, 1), ref)
        assert result == {"years": 3, "display": "3 Y"}

    def test_between_one_and_two_years_shows_years_and_months(self):
        ref = date(2026, 6, 15)
        result = _calculate_patient_age(date(2025, 1, 15), ref)
        assert result["years"] == 1
        assert result["display"] == "1 Y 5 M"

    def test_under_one_year_shows_months_and_days(self):
        ref = date(2026, 6, 15)
        result = _calculate_patient_age(date(2026, 3, 1), ref)
        assert result["years"] == 0
        assert result["display"] == "3 M 14 D"

    def test_under_one_month_shows_days_only(self):
        ref = date(2026, 6, 15)
        result = _calculate_patient_age(date(2026, 6, 1), ref)
        assert result["display"] == "14 D"


class TestBuildSubmittedText:
    def test_no_blocks_returns_empty_string(self):
        assert _build_submitted_text("A", True, []) == ""

    def test_entirely_submitted_prefix(self):
        text = _build_submitted_text("A", True, [{"block_no": 1}])
        assert text.startswith("Entirely submitted:")

    def test_representative_prefix_when_not_entirely_submitted(self):
        text = _build_submitted_text("A", False, [{"block_no": 1}])
        assert text.startswith("Representative sections are submitted:")

    def test_uncountable_block_shows_multiple_fragments(self):
        text = _build_submitted_text("A", False, [{"block_no": 1, "is_tissue_uncountable": True, "tissue_description": "necrotic"}])
        assert "A1(multiple fragments, necrotic)" in text

    def test_count_and_description(self):
        text = _build_submitted_text("A", False, [{"block_no": 1, "tissue_count": 3, "tissue_description": "grey-white"}])
        assert "A1(3, grey-white)" in text

    def test_count_only(self):
        text = _build_submitted_text("A", False, [{"block_no": 2, "tissue_count": 2}])
        assert "A2(2)" in text

    def test_description_only(self):
        text = _build_submitted_text("A", False, [{"block_no": 3, "tissue_description": "cystic"}])
        assert "A3(cystic)" in text

    def test_no_count_or_description_just_code(self):
        text = _build_submitted_text("A", False, [{"block_no": 4}])
        assert "A4" in text
        assert "A4(" not in text


class TestGetImageBase64FromPath:
    def test_missing_file_returns_none(self):
        assert get_image_base64_from_path("/no/such/file.jpg") is None

    def test_encodes_and_resizes_large_image(self, tmp_path):
        img_path = tmp_path / "test.png"
        Image.new("RGB", (2000, 1000), color="red").save(img_path)

        result = get_image_base64_from_path(str(img_path), max_width=500)

        assert result is not None
        assert result.startswith("data:image/jpeg;base64,")

    def test_flattens_transparency_to_white(self, tmp_path):
        img_path = tmp_path / "transparent.png"
        Image.new("RGBA", (100, 100), color=(255, 0, 0, 0)).save(img_path)

        result = get_image_base64_from_path(str(img_path))

        assert result is not None  # must not raise on RGBA input


class TestGetIcdOForReport:
    def test_no_tumor_registry_row_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        assert _get_icd_o_for_report(db, case.id) is None

    def test_row_with_no_codes_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        db.add(TumorRegistry(surgical_case_id=case.id))
        db.commit()

        assert _get_icd_o_for_report(db, case.id) is None

    def test_row_with_codes_returns_dict(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        db.add(TumorRegistry(
            surgical_case_id=case.id, topography_code="C50.1", morphology_code="8500/3", grade="G2",
        ))
        db.commit()

        result = _get_icd_o_for_report(db, case.id)
        assert result["topography_code"] == "C50.1"
        assert result["morphology_code"] == "8500/3"
        assert result["grade"] == "G2"


class TestGetGroupedDiagnoses:
    def test_always_includes_signed_diagnoses(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        signed = create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
            diagnosis_order=1, status=DiagnosisStatus.SIGNED,
        ))

        groups = _get_grouped_diagnoses(db, case.id)
        assert signed in groups[1]

    def test_draft_dedup_keeps_only_latest_per_specimen(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1", diagnosis_order=5,
        ))
        latest = create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v2", diagnosis_order=5,
        ))

        groups = _get_grouped_diagnoses(db, case.id)
        specimen_diags = [d for d in groups[5] if d.surgical_specimen_id == specimen.id]
        assert len(specimen_diags) == 1
        assert specimen_diags[0].id == latest.id


class TestGetMicroscopicSummary:
    def test_none_when_no_descriptions(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
        ))
        groups = _get_grouped_diagnoses(db, case.id)
        assert _get_microscopic_summary(groups) is None

    def test_includes_specimen_label_and_text(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
            microscopic_description="<p>Atypical cells present</p>",
        ))
        groups = _get_grouped_diagnoses(db, case.id)

        summary = _get_microscopic_summary(groups)
        assert "Atypical cells present" in summary
        assert specimen.specimen_label in summary


class TestGetDiagnosisHtmlSummary:
    def test_individual_mode_shows_specimen_label(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="Benign tissue",
        ))
        groups = _get_grouped_diagnoses(db, case.id)

        result = _get_diagnosis_html_summary(db, case, groups, "individual", {"sorted_specimens": [specimen]}, True)

        assert "Benign tissue" in result["diagnosis_html"]
        assert specimen.specimen_label in result["diagnosis_html"]

    def test_addendum_entry_type_labeled(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
            diagnosis_order=1, status=DiagnosisStatus.SIGNED,
        ))
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v2",
            diagnosis_order=2,
        ))
        groups = _get_grouped_diagnoses(db, case.id)

        result = _get_diagnosis_html_summary(db, case, groups, "individual", {"sorted_specimens": [specimen]}, True)

        assert "ADDENDUM REPORT" in result["diagnosis_html"]


class TestPrepareReportData:
    def test_missing_case_returns_none(self, db, admin_user):
        assert prepare_report_data(db, 999999) is None

    def test_no_settings_defaults_to_published_status(self, db, admin_user, two_pathologists):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id))

        data = prepare_report_data(db, case.id)

        assert data["status"] == ReportStatus.PUBLISHED
        assert data["accession_no"] == case.accession_no

    def test_approve_enabled_targets_pending_approval(self, db, admin_user, two_pathologists):
        make_system_setting(db, enable_approve_system=True)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
        ))

        data = prepare_report_data(db, case.id)

        assert data["status"] == ReportStatus.PENDING_APPROVAL
        assert data["published_at"] is None

    def test_version_no_increments_with_existing_reports(self, db, admin_user, two_pathologists):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id))

        data = prepare_report_data(db, case.id)

        assert data["version_no"] == 2  # one PUBLISHED report already exists

    def test_icd_o_omitted_when_setting_disabled(self, db, admin_user, two_pathologists):
        make_system_setting(db, show_icd_o_in_report=False)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=specimen.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
        ))

        data = prepare_report_data(db, case.id)

        assert data["icd_o_data"] is None
