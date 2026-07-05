"""Tests for app/crud/internal_consult.py — the cross-pathologist consult
workflow (request → respond → optionally promote the consultant to a
co-signer on the underlying report). Coverage focuses on the guard chain on
each state transition (who may act, from which status) and the "cannot
consult yourself" check on creation."""

import pytest
from fastapi import HTTPException

from app.crud.internal_consult import (
    create_consult,
    get_my_pending,
    get_for_report,
    respond,
    promote,
    close_consult,
)
from app.schemas.internal_consult import InternalConsultCreate
from tests.factories import make_pending_gyne_report, make_pending_nongyne_report


def _payload(report_id, consultant_id, case_type="gyne", reason="Need a second opinion"):
    return InternalConsultCreate(case_type=case_type, report_id=report_id, consultant_id=consultant_id, reason=reason)


class TestCreateConsult:
    def test_cannot_consult_yourself(self, db, admin_user):
        registrar, _ = admin_user

        with pytest.raises(HTTPException) as exc:
            create_consult(db, _payload(report_id=1, consultant_id=registrar.id), requester_id=registrar.id)
        assert exc.value.status_code == 400

    def test_invalid_case_type_returns_400(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists

        with pytest.raises(HTTPException) as exc:
            create_consult(db, _payload(report_id=1, consultant_id=path1.id, case_type="bogus"), requester_id=path2.id)
        assert exc.value.status_code == 400

    def test_missing_report_returns_404(self, db, two_pathologists):
        path1, path2 = two_pathologists

        with pytest.raises(HTTPException) as exc:
            create_consult(db, _payload(report_id=999999, consultant_id=path1.id), requester_id=path2.id)
        assert exc.value.status_code == 404

    def test_success_snapshots_accession_no_and_defaults_to_pending(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)

        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id, case_type="gyne"), requester_id=path1.id
        )

        assert consult.status == "pending"
        assert consult.accession_no_snapshot == report.accession_no
        assert consult.requester_id == path1.id
        assert consult.consultant_id == path2.id
        assert consult.promoted_to_signer is False


class TestGetMyPendingAndForReport:
    def test_get_my_pending_filters_by_consultant_and_status(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )

        items, total = get_my_pending(db, consultant_id=path2.id)

        assert any(c.id == consult.id for c in items)
        assert total >= 1
        # Not visible to the requester's own "my pending" (they're not the consultant).
        other_items, _ = get_my_pending(db, consultant_id=path1.id)
        assert not any(c.id == consult.id for c in other_items)

    def test_get_for_report_filters_by_case_type_and_report_id(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id, case_type="gyne"), requester_id=path1.id
        )

        results = get_for_report(db, case_type="gyne", report_id=report.id)
        assert any(c.id == consult.id for c in results)

        assert get_for_report(db, case_type="nongyne", report_id=report.id) == []


class TestRespond:
    def test_missing_consult_returns_404(self, db, admin_user):
        registrar, _ = admin_user
        with pytest.raises(HTTPException) as exc:
            respond(db, 999999, consultant_id=registrar.id, opinion="x")
        assert exc.value.status_code == 404

    def test_only_consultant_can_respond(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )

        with pytest.raises(HTTPException) as exc:
            respond(db, consult.id, consultant_id=path1.id, opinion="Not yours to answer")
        assert exc.value.status_code == 403

    def test_success_sets_opinion_and_responded_status(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )

        result = respond(db, consult.id, consultant_id=path2.id, opinion="Agree with malignant call")

        assert result.status == "responded"
        assert result.opinion == "Agree with malignant call"
        assert result.responded_at is not None

    def test_cannot_respond_twice(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )
        respond(db, consult.id, consultant_id=path2.id, opinion="First answer")

        with pytest.raises(HTTPException) as exc:
            respond(db, consult.id, consultant_id=path2.id, opinion="Second answer")
        assert exc.value.status_code == 400


class TestPromote:
    def test_must_be_responded_before_promoting(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )

        with pytest.raises(HTTPException) as exc:
            promote(db, consult.id, requester_id=path1.id, role="co-signer", consult_note=None, current_user=path1)
        assert exc.value.status_code == 400

    def test_only_requester_can_promote(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )
        respond(db, consult.id, consultant_id=path2.id, opinion="Agree")

        with pytest.raises(HTTPException) as exc:
            promote(db, consult.id, requester_id=path2.id, role="co-signer", consult_note=None, current_user=path2)
        assert exc.value.status_code == 403

    def test_success_adds_gyne_signer_and_marks_promoted(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id, case_type="gyne"), requester_id=path1.id
        )
        respond(db, consult.id, consultant_id=path2.id, opinion="Agree")

        result = promote(db, consult.id, requester_id=path1.id, role="co-signer", consult_note="fyi", current_user=path1)

        assert result.promoted_to_signer is True
        from app.models.gyne_cyto_report import GyneReportSigner
        signer = (
            db.query(GyneReportSigner)
            .filter(GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == path2.id)
            .first()
        )
        assert signer is not None

    def test_success_adds_nongyne_signer_and_marks_promoted(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id, case_type="nongyne"), requester_id=path1.id
        )
        respond(db, consult.id, consultant_id=path2.id, opinion="Agree")

        result = promote(db, consult.id, requester_id=path1.id, role="co-signer", consult_note=None, current_user=path1)

        assert result.promoted_to_signer is True

    def test_cannot_promote_twice(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id, case_type="gyne"), requester_id=path1.id
        )
        respond(db, consult.id, consultant_id=path2.id, opinion="Agree")
        promote(db, consult.id, requester_id=path1.id, role="co-signer", consult_note=None, current_user=path1)

        with pytest.raises(HTTPException) as exc:
            promote(db, consult.id, requester_id=path1.id, role="co-signer", consult_note=None, current_user=path1)
        assert exc.value.status_code == 400


class TestCloseConsult:
    def test_missing_consult_returns_404(self, db, admin_user):
        registrar, _ = admin_user
        with pytest.raises(HTTPException) as exc:
            close_consult(db, 999999, requester_id=registrar.id)
        assert exc.value.status_code == 404

    def test_only_requester_can_close(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )

        with pytest.raises(HTTPException) as exc:
            close_consult(db, consult.id, requester_id=path2.id)
        assert exc.value.status_code == 403

    def test_success_sets_closed_status(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )

        result = close_consult(db, consult.id, requester_id=path1.id)

        assert result.status == "closed"
        assert result.closed_at is not None

    def test_cannot_close_twice(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=path1.id)
        consult = create_consult(
            db, _payload(report_id=report.id, consultant_id=path2.id), requester_id=path1.id
        )
        close_consult(db, consult.id, requester_id=path1.id)

        with pytest.raises(HTTPException) as exc:
            close_consult(db, consult.id, requester_id=path1.id)
        assert exc.value.status_code == 400
