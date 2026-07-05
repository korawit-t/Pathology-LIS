"""HTTP-level regression tests for POST /surgical-diagnoses/{case_id}/finalize.

Two bugs fixed together here:
1. This was the only route in surgical_diagnosis.py missing the
   `CAN_WRITE_REPORT` role gate every other write route in the file has —
   any authenticated user of any role could finalize/sign out a case.
2. The handler trusted a client-supplied `signed_by_id` in the request body
   (falling back to the authenticated user only if the field was omitted),
   so a caller could forge signing a report as a *different* pathologist by
   setting that field explicitly. The fix always derives the signer's
   identity from the authenticated JWT and ignores the body field entirely.
"""

from app.models.surgical_report import ReportSigner, ReportStatus
from tests.factories import make_signable_case, build_bulk_save_payload, clear_system_settings


def _login_as(client, username, password):
    r = client.post("/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return client


class TestFinalizeRequiresWriteReportRole:
    def test_clinician_cannot_finalize(self, clinician_client, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        payload = build_bulk_save_payload(case.id, specimen.id, registrar.id)

        response = clinician_client.post(
            f"/surgical-diagnoses/{case.id}/finalize",
            json=payload.model_dump(mode="json"),
        )

        assert response.status_code == 403


class TestFinalizeCannotForgeSignerIdentity:
    def test_signed_by_id_in_body_is_ignored_for_a_different_caller(
        self, client, db, admin_user, two_pathologists
    ):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        # path2 is logged in, but the body claims path1 is signing.
        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}],
            signed_by_id=path1.id,
        )
        _login_as(client, path2.username, "PathPass1!")

        response = client.post(
            f"/surgical-diagnoses/{case.id}/finalize",
            json=payload.model_dump(mode="json"),
        )
        assert response.status_code == 200

        # path1 must NOT show as signed — the forged signed_by_id was ignored,
        # and path2 (the real caller) isn't a listed signer for this round,
        # so nobody gets marked as having signed.
        signer = (
            db.query(ReportSigner)
            .filter(ReportSigner.user_id == path1.id)
            .order_by(ReportSigner.id.desc())
            .first()
        )
        assert signer is not None
        assert signer.signed_at is None

    def test_legitimate_signer_still_signs_successfully(
        self, client, db, admin_user, two_pathologists
    ):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}],
            signed_by_id=path1.id,
        )
        _login_as(client, path1.username, "PathPass1!")

        response = client.post(
            f"/surgical-diagnoses/{case.id}/finalize",
            json=payload.model_dump(mode="json"),
        )
        assert response.status_code == 200, response.text

        signer = (
            db.query(ReportSigner)
            .filter(ReportSigner.user_id == path1.id)
            .order_by(ReportSigner.id.desc())
            .first()
        )
        assert signer is not None
        assert signer.signed_at is not None
