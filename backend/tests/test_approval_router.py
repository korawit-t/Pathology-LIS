"""Router-level tests for app/routers/approval.py. The crud layer
(app/crud/report_crud.py, gyne_report_crud.py, nongyne_cyto_report.py) has
thorough state-machine coverage in test_report_approval.py — this is RBAC +
wiring only.

Notable RBAC detail (not a bug, just easy to get wrong writing these
tests): CAN_APPROVE/CAN_APPROVE_GYNE_CYTO/CAN_APPROVE_NONGYNE_CYTO are
senior_pathologist/admin(/cytotechnologist for cyto) — a plain
"pathologist" role is NOT in any of them, even though pathologist CAN
write/finalize the underlying reports. Approve endpoints below use
admin_client for the happy path and pathologist_client to prove the
negative (pathologist cannot approve)."""

from app.crud.surgical_report import finalize_and_snapshot_orchestrator

from tests.factories import (
    make_signable_case,
    build_bulk_save_payload,
    make_system_setting,
    make_pending_gyne_report,
    make_pending_nongyne_report,
)


def _pending_surgical_report(db, registrar_id, pathologist_id):
    make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=True)
    case, specimen = make_signable_case(db, registrar_id=registrar_id)
    report = finalize_and_snapshot_orchestrator(
        db, case.id, build_bulk_save_payload(case.id, specimen.id, pathologist_id), pathologist_id
    )
    return case, report


class TestSurgicalApprovalRbac:
    def test_pathologist_cannot_approve(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = _pending_surgical_report(db, registrar.id, pathologist.id)

        r = pathologist_client.post(f"/approvals/surgical/{report.id}", json={"action": "APPROVE"})

        assert r.status_code == 403

    def test_admin_can_approve(self, db, admin_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = _pending_surgical_report(db, registrar.id, pathologist.id)

        r = admin_client.post(f"/approvals/surgical/{report.id}", json={"action": "APPROVE"})

        assert r.status_code == 200
        assert r.json()["status"] == "published"

    def test_missing_report_returns_404(self, admin_client):
        r = admin_client.post("/approvals/surgical/999999", json={"action": "APPROVE"})
        assert r.status_code == 404


class TestGyneAndNongyneApprovalRbac:
    def test_pathologist_cannot_approve_gyne(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.post(f"/approvals/gyne/{report.id}", json={"action": "APPROVE"})

        assert r.status_code == 403

    def test_admin_can_approve_gyne(self, db, admin_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = admin_client.post(f"/approvals/gyne/{report.id}", json={"action": "APPROVE"})

        assert r.status_code == 200

    def test_pathologist_cannot_approve_nongyne(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = pathologist_client.post(f"/approvals/nongyne/{report.id}", json={"action": "APPROVE"})

        assert r.status_code == 403

    def test_admin_can_approve_nongyne(self, db, admin_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = make_pending_nongyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)

        r = admin_client.post(f"/approvals/nongyne/{report.id}", json={"action": "APPROVE"})

        assert r.status_code == 200

    def test_pending_nongyne_worklist_reachable(self, admin_client):
        assert admin_client.get("/approvals/nongyne/pending").status_code == 200


class TestCosignAddSignerAndLogsAnyAuthenticatedUser:
    """These are any-authenticated-user at the router (get_current_user
    only) — the crud layer enforces the actual signer/consultant identity
    check, already covered thoroughly in test_report_approval.py."""

    def test_cosign_non_cosigner_gets_403(self, db, clinician_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        _, report = _pending_surgical_report(db, registrar.id, pathologist.id)

        r = clinician_client.post(f"/approvals/surgical/{report.id}/cosign", json={"action": "APPROVE"})

        assert r.status_code == 403

    def test_get_approval_history_requires_authentication(self, client):
        assert client.get("/approvals/1/logs").status_code == 401

    def test_get_approval_history_empty_for_untouched_report(self, pathologist_client):
        r = pathologist_client.get("/approvals/999999/logs")
        assert r.status_code == 200
        assert r.json() == []


def test_requires_authentication(client):
    assert client.post("/approvals/surgical/1", json={"action": "APPROVE"}).status_code == 401
