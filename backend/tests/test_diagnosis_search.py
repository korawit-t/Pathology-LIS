"""Tests for app/crud/diagnosis_search.py — the free-text case finder behind
the Diagnosis Search report.

Every test embeds a per-test uuid tag inside the words it searches for
(``colon<tag>``, not ``colon``), because `db` commits persist across tests in
the same run: without the tag, totals would pick up rows another test left
behind. Diagnoses are inserted directly rather than through the bulk-save
orchestrator — this module is about the matching query, and the text of a
diagnosis is exactly the thing each case needs to control.
"""

import uuid
from datetime import timedelta

from app.crud.diagnosis_search import (
    MAX_TERMS,
    normalize_terms,
    search_cases,
)
from app.enums.surgical_diagnosis_enums import DiagnosisLevel
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_specimen import SurgicalSpecimen
from app.utils.time import local_now

from tests.factories import make_bare_case, make_hospital


_UNSET = object()


def _tag() -> str:
    return uuid.uuid4().hex[:10]


def _case(
    db,
    registrar_id,
    *,
    specimens: list[str],
    diagnoses: list[str],
    hospital=None,
    is_reported: bool = True,
    report_at=_UNSET,
    registered_at=None,
    is_cancelled: bool = False,
    has_malignancy=None,
    diagnosis_status: str = "signed",
    pathologist_id=None,
):
    """A surgical case carrying the given specimen names and diagnosis texts."""
    case = make_bare_case(db, registrar_id=registrar_id, hospital=hospital)
    case.is_reported = is_reported
    case.is_cancelled = is_cancelled
    case.has_malignancy = has_malignancy
    case.pathologist_id = pathologist_id
    case.report_at = local_now() if report_at is _UNSET else report_at
    if registered_at is not None:
        case.registered_at = registered_at

    for i, name in enumerate(specimens):
        db.add(
            SurgicalSpecimen(
                case_id=case.id,
                specimen_label=chr(ord("A") + i),
                specimen_name=name,
                gross_description=f"gross for {name}",
            )
        )
    for i, text in enumerate(diagnoses):
        db.add(
            SurgicalDiagnosis(
                case_id=case.id,
                diagnosis_level=DiagnosisLevel.CASE,
                diagnosis=text,
                diagnosis_order=i + 1,
                status=diagnosis_status,
            )
        )
    db.commit()
    db.refresh(case)
    return case


def _accessions(result) -> set[str]:
    return {item["accession_no"] for item in result["items"]}


class TestNormalizeTerms:
    def test_trims_drops_blanks_and_deduplicates_case_insensitively(self):
        assert normalize_terms(["  colon ", "", "   ", "COLON", "biopsy"]) == [
            "colon",
            "biopsy",
        ]

    def test_caps_term_count(self):
        assert len(normalize_terms([f"t{i}" for i in range(MAX_TERMS + 5)])) == MAX_TERMS

    def test_handles_none(self):
        assert normalize_terms(None) == []


class TestSpecimenAndDiagnosisMatching:
    def test_finds_case_matching_both_sides(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        wanted = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}, biopsy{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}, moderately differentiated"],
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}", f"biopsy{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
        )

        assert result["total"] == 1
        assert _accessions(result) == {wanted.accession_no}

    def test_specimen_terms_are_anded_by_default(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Stomach{tag}, biopsy{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}", f"biopsy{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
        )

        assert result["total"] == 0

    def test_any_mode_matches_either_term(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        stomach = _case(
            db,
            registrar.id,
            specimens=[f"Stomach{tag}, biopsy{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
        )
        colon = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}, resection{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}", f"stomach{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            match_mode="any",
        )

        assert _accessions(result) == {stomach.accession_no, colon.accession_no}

    def test_diagnosis_condition_excludes_non_matching_diagnosis(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}, biopsy{tag}"],
            diagnoses=[f"Tubular adenoma{tag}, low grade dysplasia"],
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}", f"biopsy{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
        )

        assert result["total"] == 0

    def test_matching_is_case_insensitive(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"COLON{tag}, BIOPSY{tag}"],
            diagnoses=[f"ADENOCARCINOMA{tag}"],
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}", f"biopsy{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
        )

        assert result["total"] == 1

    def test_one_sided_query_needs_no_diagnosis_terms(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}, biopsy{tag}"],
            diagnoses=[f"Tubular adenoma{tag}"],
        )

        result = search_cases(db, specimen_terms=[f"colon{tag}"])

        assert result["total"] == 1

    def test_like_wildcards_in_a_term_are_matched_literally(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        literal = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Tumour cells 100%{tag} of the field"],
        )
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Tumour cells 10 of the field{tag}"],
        )

        # Without escaping, "%" would act as a wildcard and match both rows.
        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"100%{tag}"],
        )

        assert _accessions(result) == {literal.accession_no}


class TestOptionalTextFields:
    def test_gross_description_is_searched_only_when_asked(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Unlabelled tissue {tag}"],  # the term lives in gross only
            diagnoses=[f"Adenocarcinoma{tag}"],
        )

        off = search_cases(
            db,
            specimen_terms=[f"unlabelled tissue {tag}", "gross for"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
        )
        on = search_cases(
            db,
            specimen_terms=[f"unlabelled tissue {tag}", "gross for"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            include_gross=True,
        )

        assert off["total"] == 0
        assert on["total"] == 1

    def test_microscopic_description_is_searched_only_when_asked(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        case = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Malignant neoplasm{tag}"],
        )
        diag = (
            db.query(SurgicalDiagnosis)
            .filter(SurgicalDiagnosis.case_id == case.id)
            .first()
        )
        diag.microscopic_description = f"Glands consistent with adenocarcinoma{tag}."
        db.commit()

        off = search_cases(
            db, specimen_terms=[f"colon{tag}"], diagnosis_terms=[f"adenocarcinoma{tag}"]
        )
        on = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            include_microscopic=True,
        )

        assert off["total"] == 0
        assert on["total"] == 1


class TestExclusions:
    def test_cancelled_case_is_excluded(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            is_cancelled=True,
        )

        result = search_cases(
            db, specimen_terms=[f"colon{tag}"], diagnosis_terms=[f"adenocarcinoma{tag}"]
        )

        assert result["total"] == 0

    def test_cancelled_diagnosis_does_not_satisfy_the_condition(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            diagnosis_status="cancelled",
        )

        result = search_cases(
            db, specimen_terms=[f"colon{tag}"], diagnosis_terms=[f"adenocarcinoma{tag}"]
        )

        assert result["total"] == 0

    def test_unreported_case_is_excluded_unless_only_reported_is_off(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        draft = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            is_reported=False,
            report_at=None,
            diagnosis_status="draft",
        )

        reported_only = search_cases(
            db, specimen_terms=[f"colon{tag}"], diagnosis_terms=[f"adenocarcinoma{tag}"]
        )
        everything = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            only_reported=False,
        )

        assert reported_only["total"] == 0
        assert _accessions(everything) == {draft.accession_no}


class TestFilters:
    def test_date_window_applies_to_the_chosen_field(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        today = local_now()
        old_registration = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            registered_at=today - timedelta(days=400),
            report_at=today,
        )

        by_received = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            date_field="registered",
            date_from=(today - timedelta(days=7)).date(),
            date_to=today.date(),
        )
        by_reported = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            date_field="reported",
            date_from=(today - timedelta(days=7)).date(),
            date_to=today.date(),
        )

        assert by_received["total"] == 0
        assert _accessions(by_reported) == {old_registration.accession_no}

    def test_date_window_on_report_at_drops_never_reported_cases(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        today = local_now()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            is_reported=False,
            report_at=None,
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            only_reported=False,
            date_field="reported",
            date_from=(today - timedelta(days=7)).date(),
            date_to=today.date(),
        )

        assert result["total"] == 0

    def test_hospital_filter_narrows_to_one_hospital(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        h1 = make_hospital(db)
        h2 = make_hospital(db)
        wanted = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            hospital=h1,
        )
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            hospital=h2,
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            hospital_id=h1.id,
        )

        assert _accessions(result) == {wanted.accession_no}

    def test_scoped_hospital_ids_restrict_results(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        h1 = make_hospital(db)
        h2 = make_hospital(db)
        wanted = _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            hospital=h1,
        )
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}"],
            hospital=h2,
        )

        scoped = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            scoped_hospital_ids={h1.id},
        )
        no_hospital = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            scoped_hospital_ids=set(),
        )

        assert _accessions(scoped) == {wanted.accession_no}
        assert no_hospital["total"] == 0

    def test_total_counts_every_match_while_items_respect_the_limit(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        for _ in range(3):
            _case(
                db,
                registrar.id,
                specimens=[f"Colon{tag}"],
                diagnoses=[f"Adenocarcinoma{tag}"],
            )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
            limit=2,
        )

        assert result["total"] == 3
        assert len(result["items"]) == 2


class TestRowContents:
    def test_row_carries_the_matching_specimen_and_diagnosis(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}, biopsy{tag}", f"Stomach{tag}, biopsy{tag}"],
            diagnoses=[f"<p>Adenocarcinoma{tag}</p>", f"Chronic gastritis{tag}"],
            has_malignancy=True,
            pathologist_id=registrar.id,
        )

        result = search_cases(
            db,
            specimen_terms=[f"colon{tag}"],
            diagnosis_terms=[f"adenocarcinoma{tag}"],
        )
        row = result["items"][0]

        assert row["matched_specimens"] == [f"A: Colon{tag}, biopsy{tag}"]
        # HTML stripped — the stored diagnosis is rich text, the report is not.
        assert row["matched_diagnoses"] == [f"Adenocarcinoma{tag}"]
        assert row["pathologist_name"] == registrar.full_name
        assert row["has_malignancy"] is True
        assert result["malignant_count"] == 1

    def test_patient_name_includes_title_and_surname(self, db, admin_user):
        from app.models.organization import Title
        from app.models.patient import Patient

        registrar, _ = admin_user
        tag = _tag()
        # titles.title is unique and `db` commits persist across tests in this
        # run, so the row has to be this test's own, not a shared "นาย".
        title = Title(title=f"นาย{tag}")
        db.add(title)
        db.commit()
        patient = Patient(title_id=title.id, name="สมชาย", ln="ใจดี")
        db.add(patient)
        db.commit()

        case = make_bare_case(db, registrar_id=registrar.id, patient=patient)
        case.is_reported = True
        case.report_at = local_now()
        db.add(
            SurgicalSpecimen(case_id=case.id, specimen_label="A", specimen_name=f"Colon{tag}")
        )
        db.add(
            SurgicalDiagnosis(
                case_id=case.id,
                diagnosis_level=DiagnosisLevel.CASE,
                diagnosis=f"Adenocarcinoma{tag}",
                diagnosis_order=1,
                status="signed",
            )
        )
        db.commit()

        result = search_cases(
            db, specimen_terms=[f"colon{tag}"], diagnosis_terms=[f"adenocarcinoma{tag}"]
        )

        assert result["items"][0]["patient_name"] == f"นาย{tag} สมชาย ใจดี"

    def test_duplicate_diagnosis_text_is_listed_once(self, db, admin_user):
        registrar, _ = admin_user
        tag = _tag()
        _case(
            db,
            registrar.id,
            specimens=[f"Colon{tag}"],
            diagnoses=[f"Adenocarcinoma{tag}", f"Adenocarcinoma{tag}"],
        )

        result = search_cases(
            db, specimen_terms=[f"colon{tag}"], diagnosis_terms=[f"adenocarcinoma{tag}"]
        )

        assert result["items"][0]["matched_diagnoses"] == [f"Adenocarcinoma{tag}"]
