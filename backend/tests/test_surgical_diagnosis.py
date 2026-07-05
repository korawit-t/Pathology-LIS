"""
Unit tests for app/crud/surgical_diagnosis.py — bulk_save_draft_orchestrator,
create_diagnosis/update_diagnosis/delete_diagnosis, and the validate_sign_off
guard. Previously only exercised incidentally via
test_surgical_consult_finalize.py's happy-path finalize flow.
"""

import pytest
from fastapi import HTTPException

from app.crud.surgical_diagnosis import (
    bulk_save_draft_orchestrator,
    create_diagnosis,
    update_diagnosis,
    delete_diagnosis,
    validate_sign_off,
    get_latest_diagnosis,
    list_diagnoses_by_case,
)
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.schemas.surgical_bulk import BulkSaveDraft, DiagnosisEntry
from app.schemas.surgical_diagnosis import SurgicalDiagnosisCreate, SurgicalDiagnosisUpdate
from app.enums.surgical_diagnosis_enums import DiagnosisLevel, DiagnosisEntryType, DiagnosisStatus
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import ReportSigner
from app.models.surgical_specimen import SurgicalSpecimen

from tests.factories import make_signable_case, build_bulk_save_payload


def _diagnoses_for(db, case_id, level=None):
    q = db.query(SurgicalDiagnosis).filter(SurgicalDiagnosis.case_id == case_id)
    if level is not None:
        q = q.filter(SurgicalDiagnosis.diagnosis_level == level)
    return q.all()


class TestBulkSaveDraftOrchestrator:
    def test_missing_case_raises_404(self, db, admin_user, two_pathologists):
        path1, _ = two_pathologists
        payload = build_bulk_save_payload(999999, 1, path1.id)
        with pytest.raises(HTTPException) as exc:
            bulk_save_draft_orchestrator(db, payload)
        assert exc.value.status_code == 404

    def test_consult_dispatched_no_pdf_raises_423_and_saves_nothing(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_out_lab_consult = True
        case.consult_status = "processing"
        case.consult_pdf_path = None
        db.commit()

        payload = build_bulk_save_payload(case.id, specimen.id, path1.id)
        with pytest.raises(HTTPException) as exc:
            bulk_save_draft_orchestrator(db, payload)
        assert exc.value.status_code == 423
        assert _diagnoses_for(db, case.id) == []

    def test_consult_dispatched_with_pdf_saves_metadata_only(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_out_lab_consult = True
        case.consult_status = "processing"
        case.consult_pdf_path = "/tmp/fake_consult.pdf"
        db.commit()

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id, clinical_diagnosis="Updated clinical note"
        )
        result = bulk_save_draft_orchestrator(db, payload)
        assert "order" in result

        db.refresh(case)
        assert case.clinical_diagnosis == "Updated clinical note"
        assert _diagnoses_for(db, case.id) == []

    def test_gross_descriptions_applied_to_specimen(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            gross_descriptions={specimen.id: "Gross: pink-tan tissue"},
        )
        bulk_save_draft_orchestrator(db, payload)

        db.refresh(specimen)
        assert specimen.gross_description == "Gross: pink-tan tissue"

    def test_integrated_mode_creates_case_level_and_specimen_level_rows(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, spec1 = make_signable_case(db, registrar_id=registrar.id)
        spec2 = SurgicalSpecimen(case_id=case.id, specimen_label="B", specimen_name="Test Specimen B")
        db.add(spec2)
        db.commit()
        db.refresh(spec2)

        payload = BulkSaveDraft(
            case_id=case.id,
            diagnosis_mode="integrated",
            gross_descriptions={},
            case_diagnosis_text="Overall malignant neoplasm",
            diagnoses={
                spec1.id: DiagnosisEntry(microscopic_description="Micro A"),
                spec2.id: DiagnosisEntry(microscopic_description="Micro B"),
            },
            pathologists=[{"user_id": path1.id, "role": "primary"}],
            signed_by_id=path1.id,
        )
        bulk_save_draft_orchestrator(db, payload)

        case_rows = _diagnoses_for(db, case.id, level=DiagnosisLevel.CASE)
        assert len(case_rows) == 1
        assert case_rows[0].diagnosis == "Overall malignant neoplasm"
        assert set(case_rows[0].linked_specimen_ids) == {spec1.id, spec2.id}

        spec_rows = _diagnoses_for(db, case.id, level=DiagnosisLevel.SPECIMEN)
        assert len(spec_rows) == 2
        # Integrated mode only carries microscopic_description at specimen level —
        # the "diagnosis" free-text field is not set for these rows.
        assert all(r.diagnosis is None for r in spec_rows)
        assert {r.microscopic_description for r in spec_rows} == {"Micro A", "Micro B"}

    def test_switching_to_individual_clears_stale_case_level_drafts(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, spec1 = make_signable_case(db, registrar_id=registrar.id)

        integrated_payload = BulkSaveDraft(
            case_id=case.id,
            diagnosis_mode="integrated",
            gross_descriptions={},
            case_diagnosis_text="Overall dx",
            diagnoses={spec1.id: DiagnosisEntry(microscopic_description="Micro A")},
            pathologists=[{"user_id": path1.id, "role": "primary"}],
            signed_by_id=path1.id,
        )
        bulk_save_draft_orchestrator(db, integrated_payload)
        assert len(_diagnoses_for(db, case.id, level=DiagnosisLevel.CASE)) == 1

        individual_payload = build_bulk_save_payload(case.id, spec1.id, path1.id)
        bulk_save_draft_orchestrator(db, individual_payload)

        assert _diagnoses_for(db, case.id, level=DiagnosisLevel.CASE) == []

    def test_order_increments_past_a_signed_prior_round(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        round1 = build_bulk_save_payload(case.id, specimen.id, path1.id)
        finalize_and_snapshot_orchestrator(db, case.id, round1, path1.id)

        round2 = build_bulk_save_payload(case.id, specimen.id, path1.id)
        bulk_save_draft_orchestrator(db, round2)

        orders = sorted({d.diagnosis_order for d in _diagnoses_for(db, case.id)})
        assert orders == [1, 2]

    def test_reuses_draft_order_when_unsigned(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        bulk_save_draft_orchestrator(db, build_bulk_save_payload(case.id, specimen.id, path1.id))
        bulk_save_draft_orchestrator(db, build_bulk_save_payload(case.id, specimen.id, path1.id))

        rows = _diagnoses_for(db, case.id, level=DiagnosisLevel.SPECIMEN)
        assert len(rows) == 1
        assert rows[0].diagnosis_order == 1

    def test_unsigned_signer_dropped_from_payload_is_deleted(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        both_payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
        )
        result = bulk_save_draft_orchestrator(db, both_payload)
        report_id = result["report_id"]

        signer_ids = {
            s.user_id
            for s in db.query(ReportSigner).filter(ReportSigner.report_id == report_id).all()
        }
        assert signer_ids == {path1.id, path2.id}

        solo_payload = build_bulk_save_payload(case.id, specimen.id, path1.id)
        bulk_save_draft_orchestrator(db, solo_payload)

        signer_ids_after = {
            s.user_id
            for s in db.query(ReportSigner).filter(ReportSigner.report_id == report_id).all()
        }
        assert signer_ids_after == {path1.id}

    def test_duplicate_pathologist_id_in_payload_deduped_in_name(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[
                {"user_id": path1.id, "role": "primary"},
                {"user_id": path1.id, "role": "consultant"},
            ],
        )
        result = bulk_save_draft_orchestrator(db, payload)
        from app.models.surgical_report import SurgicalReport
        report = db.query(SurgicalReport).filter(SurgicalReport.id == result["report_id"]).first()
        assert report.pathologist_name.count(path1.full_name) == 1


class TestCreateDiagnosis:
    def test_upsert_reuses_existing_draft_at_same_order(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        first = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1", diagnosis_order=1,
            ),
        )
        second = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v2", diagnosis_order=1,
            ),
        )
        assert second.id == first.id
        assert second.diagnosis == "v2"
        assert len(_diagnoses_for(db, case.id)) == 1

    def test_insert_computes_target_order_from_signed_global_latest(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
                diagnosis_order=1, status=DiagnosisStatus.SIGNED,
            ),
        )
        new_diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v2",
            ),
        )
        assert new_diag.diagnosis_order == 2

    def test_insert_reuses_draft_order_when_latest_is_draft(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1", diagnosis_order=1,
            ),
        )
        new_diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v2",
            ),
        )
        assert new_diag.diagnosis_order == 1

    def test_case_level_clears_specimen_id_and_specimen_level_clears_linked_ids(
        self, db, admin_user
    ):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        case_diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, diagnosis_level=DiagnosisLevel.CASE,
                linked_specimen_ids=[specimen.id], diagnosis="Overall dx",
            ),
        )
        assert case_diag.surgical_specimen_id is None

        spec_diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="Specimen dx",
                diagnosis_order=2,
            ),
        )
        assert spec_diag.linked_specimen_ids is None

    def test_entry_type_defaults_original_then_addendum(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        first = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
                diagnosis_order=1, status=DiagnosisStatus.SIGNED,
            ),
        )
        assert first.entry_type == "Original"

        second = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v2",
                diagnosis_order=2,
            ),
        )
        assert second.entry_type == "Addendum"

    def test_signed_insert_sets_diagnosis_at(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
                status=DiagnosisStatus.SIGNED,
            ),
        )
        assert diag.diagnosis_at is not None


class TestUpdateDiagnosis:
    def test_signed_diagnosis_cannot_be_edited(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
                status=DiagnosisStatus.SIGNED,
            ),
        )
        with pytest.raises(HTTPException) as exc:
            update_diagnosis(db, diag.id, SurgicalDiagnosisUpdate(diagnosis="edited"))
        assert exc.value.status_code == 400

    def test_missing_diagnosis_returns_none(self, db, admin_user):
        assert update_diagnosis(db, 999999, SurgicalDiagnosisUpdate(diagnosis="x")) is None

    def test_level_switch_cleans_up_opposite_field(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
            ),
        )
        updated = update_diagnosis(
            db, diag.id,
            SurgicalDiagnosisUpdate(diagnosis_level=DiagnosisLevel.CASE, linked_specimen_ids=[specimen.id]),
        )
        assert updated.surgical_specimen_id is None

    def test_signing_sets_diagnosis_at(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
            ),
        )
        updated = update_diagnosis(db, diag.id, SurgicalDiagnosisUpdate(status=DiagnosisStatus.SIGNED))
        assert updated.diagnosis_at is not None

    def test_signing_revised_without_reason_raises_400(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
                entry_type=DiagnosisEntryType.REVISED, revision_reason="initial reason",
            ),
        )
        # Clear the reason directly to simulate an update that tries to sign
        # a Revised entry with no reason recorded anywhere.
        diag.revision_reason = None
        db.commit()

        with pytest.raises(HTTPException) as exc:
            update_diagnosis(db, diag.id, SurgicalDiagnosisUpdate(status=DiagnosisStatus.SIGNED))
        assert exc.value.status_code == 400


class TestValidateSignOff:
    def test_signing_revised_with_reason_in_update_passes(self):
        diag = SurgicalDiagnosis(entry_type="Revised", revision_reason=None)
        validate_sign_off(diag, {"status": "signed", "revision_reason": "fixed typo"})

    def test_signing_revised_with_reason_only_on_existing_row_passes(self):
        diag = SurgicalDiagnosis(entry_type="Revised", revision_reason="already recorded")
        validate_sign_off(diag, {"status": "signed"})

    def test_signing_non_revised_no_reason_required(self):
        diag = SurgicalDiagnosis(entry_type="Original", revision_reason=None)
        validate_sign_off(diag, {"status": "signed"})

    def test_not_signing_skips_validation_even_if_revised_and_no_reason(self):
        diag = SurgicalDiagnosis(entry_type="Revised", revision_reason=None)
        validate_sign_off(diag, {"status": "draft"})

    def test_signing_revised_without_reason_raises_400(self):
        diag = SurgicalDiagnosis(entry_type="Revised", revision_reason=None)
        with pytest.raises(HTTPException) as exc:
            validate_sign_off(diag, {"status": "signed"})
        assert exc.value.status_code == 400


class TestDeleteDiagnosis:
    def test_delete_missing_raises_404(self, db, admin_user):
        with pytest.raises(HTTPException) as exc:
            delete_diagnosis(db, 999999)
        assert exc.value.status_code == 404

    def test_delete_signed_raises_400(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
                status=DiagnosisStatus.SIGNED,
            ),
        )
        with pytest.raises(HTTPException) as exc:
            delete_diagnosis(db, diag.id)
        assert exc.value.status_code == 400

    def test_delete_draft_succeeds_and_removes_row(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        diag = create_diagnosis(
            db,
            SurgicalDiagnosisCreate(
                case_id=case.id, surgical_specimen_id=specimen.id,
                diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="v1",
            ),
        )
        delete_diagnosis(db, diag.id)
        assert db.query(SurgicalDiagnosis).filter(SurgicalDiagnosis.id == diag.id).first() is None


class TestGetLatestDiagnosis:
    def test_specimen_level_filters_by_specimen_id(self, db, admin_user):
        registrar, _ = admin_user
        case, spec1 = make_signable_case(db, registrar_id=registrar.id)
        spec2 = SurgicalSpecimen(case_id=case.id, specimen_label="B", specimen_name="Specimen B")
        db.add(spec2)
        db.commit()
        db.refresh(spec2)

        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=spec1.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="A-dx",
        ))
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=spec2.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="B-dx",
        ))

        latest = get_latest_diagnosis(db, case.id, specimen_id=spec1.id, level=DiagnosisLevel.SPECIMEN)
        assert latest.diagnosis == "A-dx"

    def test_case_level_ignores_specimen_id(self, db, admin_user):
        registrar, _ = admin_user
        case, spec1 = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, diagnosis_level=DiagnosisLevel.CASE,
            linked_specimen_ids=[spec1.id], diagnosis="Overall dx",
        ))
        latest = get_latest_diagnosis(db, case.id, specimen_id=999999, level=DiagnosisLevel.CASE)
        assert latest is not None
        assert latest.diagnosis == "Overall dx"

    def test_accepts_string_level_value(self, db, admin_user):
        registrar, _ = admin_user
        case, spec1 = make_signable_case(db, registrar_id=registrar.id)
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, diagnosis_level=DiagnosisLevel.CASE,
            linked_specimen_ids=[spec1.id], diagnosis="Overall dx",
        ))
        latest = get_latest_diagnosis(db, case.id, level="CASE")
        assert latest is not None
        assert latest.diagnosis == "Overall dx"


class TestListDiagnosesByCase:
    def test_orders_by_level_then_order(self, db, admin_user):
        registrar, _ = admin_user
        case, spec1 = make_signable_case(db, registrar_id=registrar.id)

        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=spec1.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="spec-1", diagnosis_order=1,
        ))
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, diagnosis_level=DiagnosisLevel.CASE,
            linked_specimen_ids=[spec1.id], diagnosis="case-1", diagnosis_order=1,
        ))
        create_diagnosis(db, SurgicalDiagnosisCreate(
            case_id=case.id, surgical_specimen_id=spec1.id,
            diagnosis_level=DiagnosisLevel.SPECIMEN, diagnosis="spec-2", diagnosis_order=2,
        ))

        rows = list_diagnoses_by_case(db, case.id)
        # diagnosis_level is a native Postgres enum — ORDER BY sorts by the
        # type's declared label order (SPECIMEN declared before CASE), not
        # alphabetically. Within a level, diagnosis_order must be ascending.
        assert [r.diagnosis for r in rows] == ["spec-1", "spec-2", "case-1"]
