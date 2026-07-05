"""Tests for app/crud/surgical_case_correlation.py — thin CRUD for
cyto-histo-style cross-case correlation records, kept lean since the only
non-trivial logic is get_by_case's OR-matching on either side of the
from/to relationship and update's partial-field application."""

from app.crud.surgical_case_correlation import get_by_case, create, update, delete
from app.schemas.surgical_case_correlation import SurgicalCaseCorrelationCreate, SurgicalCaseCorrelationUpdate
from app.models.surgical_case_correlation import SurgicalCaseCorrelation

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
