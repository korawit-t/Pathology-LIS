"""Router-level tests for app/routers/slide_block_release.py. The crud
layer (app/crud/slide_block_release.py) already has thorough coverage in
test_slide_block_release.py (release-no sequencing, verify-accession guard,
delete's recompute-remaining-flags logic) — this is auth/wiring/the
form-pdf endpoint only.

NOTABLE FINDING (documented, not fixed — see the consolidated RBAC
report): every route here is any-authenticated-user (get_current_user
only, no role check)."""

from tests.factories import make_signable_case, make_system_setting


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/slide-block-releases").status_code == 401

    def test_any_authenticated_role_can_create_and_list(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        created = clinician_client.post(
            "/slide-block-releases",
            json={
                "case_id": case.id,
                "case_type": "SURGICAL",
                "release_type": "SLIDE",
                "recipient_name": "Dr. Somchai",
            },
        )
        assert created.status_code == 201

        r = clinician_client.get("/slide-block-releases")
        assert r.status_code == 200
        assert any(item["id"] == created.json()["id"] for item in r.json()["items"])


class TestVerifyAccession:
    def test_not_yet_reported_raises_400(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        r = pathologist_client.get(f"/slide-block-releases/verify/{case.accession_no}")

        assert r.status_code == 400

    def test_missing_accession_returns_404(self, pathologist_client):
        r = pathologist_client.get("/slide-block-releases/verify/NONEXISTENT-123")
        assert r.status_code == 404


class TestDeleteAndPdf:
    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/slide-block-releases/999999").status_code == 404

    def test_delete_existing(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/slide-block-releases",
            json={
                "case_id": case.id,
                "case_type": "SURGICAL",
                "release_type": "SLIDE",
                "recipient_name": "Dr. Somchai",
            },
        ).json()

        r = pathologist_client.delete(f"/slide-block-releases/{created['id']}")

        assert r.status_code == 204

    def test_form_pdf_generates_real_pdf_bytes(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db)
        created = pathologist_client.post(
            "/slide-block-releases",
            json={
                "case_id": case.id,
                "case_type": "SURGICAL",
                "release_type": "SLIDE",
                "recipient_name": "Dr. Somchai",
            },
        ).json()

        r = pathologist_client.get(f"/slide-block-releases/{created['id']}/form-pdf")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"
