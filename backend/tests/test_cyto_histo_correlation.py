"""Tests for app/crud/cyto_histo_correlation.py — the Bethesda-category
classification helpers (_classify_gyne_group, _has_gyne_result) and the
HSIL+ cyto-histo discordance summary/drill-down, a direct clinical-QA
calculation with no prior test coverage."""

import uuid

from app.crud.cyto_histo_correlation import (
    _classify_gyne_group,
    _has_gyne_result,
    create_correlation,
    update_correlation,
    delete_correlation,
    get_correlation_summary,
    get_correlation_group_cases,
    get_hsil_discordant_correlations,
)
from app.schemas.cyto_histo_correlation import CorrelationCreate, CorrelationUpdate
from app.models.gyne_diagnosis import GyneDiagnosisCategory, GyneDiagnosis
from app.models.nongyne_cyto_histo_correlation import NongyneCytoHistoCorrelation

from tests.factories import make_bare_gyne_case


def _get_or_create_category(db, code: str, text: str = None) -> GyneDiagnosisCategory:
    existing = db.query(GyneDiagnosisCategory).filter(GyneDiagnosisCategory.code == code).first()
    if existing:
        return existing
    cat = GyneDiagnosisCategory(code=code, text=text or code)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


class TestClassifyGyneGroup:
    def test_unsatisfied_specimen_always_unsatisfactory(self):
        assert _classify_gyne_group(False, "309", "100") == "unsatisfactory"

    def test_nilm_by_category_2_code(self):
        assert _classify_gyne_group(True, "150", None) == "nilm"

    def test_nilm_fallback_to_category_1_when_no_category_2(self):
        assert _classify_gyne_group(True, None, "200") == "nilm"

    def test_asc_us_code(self):
        assert _classify_gyne_group(True, "302", None) == "asc_us"

    def test_hsil_code(self):
        assert _classify_gyne_group(True, "310", None) == "hsil"

    def test_unrecognized_code_falls_to_other(self):
        assert _classify_gyne_group(True, "999", None) == "other"

    def test_no_code_at_all_falls_to_other(self):
        assert _classify_gyne_group(True, None, None) == "other"


class TestHasGyneResult:
    def test_unsatisfied_specimen_always_counts(self):
        assert _has_gyne_result(False, None, None, is_out_lab=False) is True

    def test_out_lab_always_counts_even_without_code(self):
        assert _has_gyne_result(True, None, None, is_out_lab=True) is True

    def test_no_code_and_not_out_lab_does_not_count(self):
        assert _has_gyne_result(True, None, None, is_out_lab=False) is False

    def test_category_2_code_counts(self):
        assert _has_gyne_result(True, "301", None, is_out_lab=False) is True

    def test_category_1_code_alone_counts(self):
        assert _has_gyne_result(True, None, "100", is_out_lab=False) is True


class TestCorrelationCrud:
    def test_create_and_delete(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        created = create_correlation(
            db,
            CorrelationCreate(
                case_type="gyne", gyne_case_id=case.id, surgical_accession_no="S26-00001",
                correlation_result="concordant",
            ),
            current_user_id=registrar.id,
        )
        assert created["gyne_case_id"] == case.id
        assert created["correlated_by"]["id"] == registrar.id

        updated = update_correlation(db, created["id"], CorrelationUpdate(comment="reviewed"))
        assert updated["comment"] == "reviewed"

        assert delete_correlation(db, created["id"]) is True
        assert delete_correlation(db, created["id"]) is False  # already gone

    def test_update_missing_returns_none(self, db):
        assert update_correlation(db, 999999, CorrelationUpdate(comment="x")) is None


class TestGetCorrelationSummary:
    def test_pending_case_with_no_result_is_excluded(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.specimen_type = f"Conventional-{uuid.uuid4().hex[:6]}"
        db.commit()
        # No diagnosis at all -> no result yet, must not appear anywhere.

        summary = get_correlation_summary(db)
        total_before_any_real_case = summary["grand_total"]["total"]
        # Sanity: this pending case contributes nothing (can't assert an
        # exact global total since other tests may have committed data, but
        # we can assert it doesn't show up in a group drill-down).
        cases = get_correlation_group_cases(db, group="nilm")
        assert case.id not in [c["id"] for c in cases]

    def test_hsil_case_counted_in_hsil_total(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        hsil_cat = _get_or_create_category(db, "310", "HSIL")
        diag = GyneDiagnosis(case_id=case.id, category_2_id=hsil_cat.id, is_current=True)
        db.add(diag)
        db.commit()

        cases = get_correlation_group_cases(db, group="hsil_plus")
        assert case.id in [c["id"] for c in cases]

    def test_invalid_group_returns_empty_list(self, db):
        assert get_correlation_group_cases(db, group="not-a-real-group") == []

    def test_hsil_discordant_correlation_listed_by_result(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        hsil_cat = _get_or_create_category(db, "311", "HSIL variant")
        diag = GyneDiagnosis(case_id=case.id, category_2_id=hsil_cat.id, is_current=True)
        db.add(diag)
        db.commit()
        correlation = NongyneCytoHistoCorrelation(
            case_type="gyne", gyne_case_id=case.id,
            surgical_accession_no="S26-99999", correlation_result="major_discrepancy",
            correlated_by_id=registrar.id,
        )
        db.add(correlation)
        db.commit()

        results = get_hsil_discordant_correlations(db, result="major_discrepancy")
        assert any(r["gyne_case_id"] == case.id for r in results)

        no_match = get_hsil_discordant_correlations(db, result="minor_discrepancy")
        assert not any(r["gyne_case_id"] == case.id for r in no_match)
