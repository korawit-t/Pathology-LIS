"""
Integration tests for the standalone out-lab consult flag endpoints
(POST/DELETE /surgical-cases/{id}/outlab-consult).

These exist so a pathologist can queue a case for external consultation from
the Case Actions panel without signing the report off — previously the flag
could only be set as a side effect of finalize (see test_surgical_consult_finalize.py).
"""

import pytest

from tests.factories import make_bare_case


@pytest.fixture
def surgical_case(db, admin_user):
    user, _ = admin_user
    return make_bare_case(db, registrar_id=user.id)


class TestRequestOutLabConsult:
    def test_requires_auth(self, client, surgical_case):
        r = client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "Need subspecialty opinion"},
        )
        assert r.status_code == 401

    def test_rejects_role_without_consult_permission(self, clinician_client, surgical_case):
        r = clinician_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "Need subspecialty opinion"},
        )
        assert r.status_code == 403

    def test_flags_case_as_pending_without_signing_off(self, pathologist_client, db, surgical_case):
        original_status = surgical_case.status

        r = pathologist_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "Complex case, need subspecialty"},
        )
        assert r.status_code == 200
        assert r.json() == {
            "is_out_lab_consult": True,
            "consult_status": "pending",
            "consult_reason": "Complex case, need subspecialty",
        }

        db.refresh(surgical_case)
        assert surgical_case.is_out_lab_consult is True
        assert surgical_case.consult_status == "pending"
        # The report is untouched — this is a queue action, not a sign-off.
        assert surgical_case.status == original_status
        assert surgical_case.is_pending is False

    def test_rejects_empty_reason(self, pathologist_client, surgical_case):
        r = pathologist_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": ""},
        )
        assert r.status_code == 422

    def test_reflagging_a_queued_case_updates_the_reason(self, pathologist_client, db, surgical_case):
        pathologist_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "First reason"},
        )
        r = pathologist_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "Second reason"},
        )
        assert r.status_code == 200

        db.refresh(surgical_case)
        assert surgical_case.consult_reason == "Second reason"
        assert surgical_case.consult_status == "pending"

    def test_conflicts_once_dispatched(self, pathologist_client, db, surgical_case):
        surgical_case.is_out_lab_consult = True
        surgical_case.consult_status = "processing"
        db.commit()

        r = pathologist_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "Changed my mind"},
        )
        assert r.status_code == 409

    def test_nonexistent_case_returns_404(self, pathologist_client):
        r = pathologist_client.post(
            "/surgical-cases/999999/outlab-consult",
            json={"reason": "Need subspecialty opinion"},
        )
        assert r.status_code == 404


class TestCancelOutLabConsult:
    def test_clears_the_flag_while_still_queued(self, pathologist_client, db, surgical_case):
        pathologist_client.post(
            f"/surgical-cases/{surgical_case.id}/outlab-consult",
            json={"reason": "Complex case"},
        )

        r = pathologist_client.delete(f"/surgical-cases/{surgical_case.id}/outlab-consult")
        assert r.status_code == 200
        assert r.json() == {
            "is_out_lab_consult": False,
            "consult_status": None,
            "consult_reason": None,
        }

        db.refresh(surgical_case)
        assert surgical_case.is_out_lab_consult is False
        assert surgical_case.consult_status is None
        assert surgical_case.consult_reason is None

    def test_conflicts_once_dispatched(self, pathologist_client, db, surgical_case):
        surgical_case.is_out_lab_consult = True
        surgical_case.consult_status = "processing"
        db.commit()

        r = pathologist_client.delete(f"/surgical-cases/{surgical_case.id}/outlab-consult")
        assert r.status_code == 409

        db.refresh(surgical_case)
        assert surgical_case.is_out_lab_consult is True

    def test_nonexistent_case_returns_404(self, pathologist_client):
        r = pathologist_client.delete("/surgical-cases/999999/outlab-consult")
        assert r.status_code == 404
