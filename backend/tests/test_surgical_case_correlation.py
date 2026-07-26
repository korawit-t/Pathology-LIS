"""Tests for app/crud/surgical_case_correlation.py — thin CRUD for
cyto-histo-style cross-case correlation records, kept lean since the only
non-trivial logic is get_by_case's OR-matching on either side of the
from/to relationship and update's partial-field application."""

from app.crud.surgical_case_correlation import get_by_case, list_correlations, create, update, delete
from app.schemas.surgical_case_correlation import SurgicalCaseCorrelationCreate, SurgicalCaseCorrelationUpdate
from app.models.surgical_case_correlation import SurgicalCaseCorrelation
from app.models.surgical_report import SurgicalReport, ReportStatus

from tests.factories import make_bare_case


class TestCreate:
    def test_serializes_with_correlated_by_snapshot(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)

        result = create(
            db,
            SurgicalCaseCorrelationCreate(
                from_case_id=case_a.id, to_case_id=case_b.id,
                from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
                correlation_result="agree",
            ),
            current_user_id=registrar.id,
        )

        assert result["id"] is not None
        assert result["correlation_result"] == "agree"
        assert result["correlated_by"]["id"] == registrar.id


class TestGetByCase:
    def test_matches_case_on_either_side_of_relationship(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        case_c = make_bare_case(db, registrar_id=registrar.id)
        create(
            db,
            SurgicalCaseCorrelationCreate(
                from_case_id=case_a.id, to_case_id=case_b.id,
                from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
                correlation_result="agree",
            ),
            current_user_id=registrar.id,
        )

        as_from = get_by_case(db, case_a.id)
        as_to = get_by_case(db, case_b.id)
        unrelated = get_by_case(db, case_c.id)

        assert len(as_from) == 1
        assert len(as_to) == 1
        assert unrelated == []


class TestListCorrelations:
    # `db` commits persist across tests in this run (no per-test rollback), so
    # totals/counts must be asserted as deltas or membership, never absolutes.
    def test_paginates(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        case_c = make_bare_case(db, registrar_id=registrar.id)
        baseline = list_correlations(db, limit=1)["total"]
        create(db, SurgicalCaseCorrelationCreate(
            from_case_id=case_a.id, to_case_id=case_b.id,
            from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
            correlation_result="agree",
        ), current_user_id=registrar.id)
        create(db, SurgicalCaseCorrelationCreate(
            from_case_id=case_b.id, to_case_id=case_c.id,
            from_accession_no=case_b.accession_no, to_accession_no=case_c.accession_no,
            correlation_result="agree",
        ), current_user_id=registrar.id)

        all_rows = list_correlations(db, limit=1)
        assert all_rows["total"] == baseline + 2
        assert len(all_rows["items"]) == 1

    def test_filters_by_result(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        created = create(db, SurgicalCaseCorrelationCreate(
            from_case_id=case_a.id, to_case_id=case_b.id,
            from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
            correlation_result="major_discrepancy",
        ), current_user_id=registrar.id)

        filtered = list_correlations(db, result="major_discrepancy", limit=1000)

        assert created["id"] in {r["id"] for r in filtered["items"]}
        assert all(r["correlation_result"] == "major_discrepancy" for r in filtered["items"])

    def test_resolves_report_ids_when_case_is_both_from_and_to(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        case_c = make_bare_case(db, registrar_id=registrar.id)

        report_a = SurgicalReport(case_id=case_a.id, hospital_id=case_a.hospital_id, status=ReportStatus.PUBLISHED)
        report_b = SurgicalReport(case_id=case_b.id, hospital_id=case_b.hospital_id, status=ReportStatus.PUBLISHED)
        db.add_all([report_a, report_b])
        db.commit()

        # case_b is `to` in the first correlation and `from` in the second —
        # a single report_map lookup must resolve it correctly both times.
        create(db, SurgicalCaseCorrelationCreate(
            from_case_id=case_a.id, to_case_id=case_b.id,
            from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
            correlation_result="agree",
        ), current_user_id=registrar.id)
        create(db, SurgicalCaseCorrelationCreate(
            from_case_id=case_b.id, to_case_id=case_c.id,
            from_accession_no=case_b.accession_no, to_accession_no=case_c.accession_no,
            correlation_result="agree",
        ), current_user_id=registrar.id)

        rows = {r["from_case_id"]: r for r in list_correlations(db, limit=1000)["items"]
                if r["from_case_id"] in (case_a.id, case_b.id)}

        assert rows[case_a.id]["from_report_id"] == report_a.id
        assert rows[case_a.id]["to_report_id"] == report_b.id
        assert rows[case_b.id]["from_report_id"] == report_b.id
        assert rows[case_b.id]["to_report_id"] is None  # case_c has no published report


class TestUpdate:
    def test_missing_returns_none(self, db):
        assert update(db, 999999, SurgicalCaseCorrelationUpdate(comment="x")) is None

    def test_updates_only_provided_fields(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        created = create(
            db,
            SurgicalCaseCorrelationCreate(
                from_case_id=case_a.id, to_case_id=case_b.id,
                from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
                correlation_result="agree", comment="Initial",
            ),
            current_user_id=registrar.id,
        )

        result = update(db, created["id"], SurgicalCaseCorrelationUpdate(correlation_result="major_discrepancy"))

        assert result["correlation_result"] == "major_discrepancy"
        assert result["comment"] == "Initial"  # untouched


class TestDelete:
    def test_missing_returns_false(self, db):
        assert delete(db, 999999) is False

    def test_deletes_existing(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        created = create(
            db,
            SurgicalCaseCorrelationCreate(
                from_case_id=case_a.id, to_case_id=case_b.id,
                from_accession_no=case_a.accession_no, to_accession_no=case_b.accession_no,
                correlation_result="agree",
            ),
            current_user_id=registrar.id,
        )

        assert delete(db, created["id"]) is True
        assert db.query(SurgicalCaseCorrelation).filter(SurgicalCaseCorrelation.id == created["id"]).first() is None
