"""Regression tests for a critical auth bug: GET/PATCH/DELETE /{case_id} on
both the Gyne and Non-gyne cytology case routers had no auth dependency at
all, so an anonymous (unauthenticated) request could read, edit, or hard-
delete any cytology case (PHI). Every other case-type router (surgical)
already required login for these operations; the fix adds the same
`Depends(get_current_user)` gate here."""

from tests.factories import make_bare_gyne_case, make_bare_nongyne_case


class TestGyneCaseRequiresAuth:
    def test_anonymous_read_is_rejected(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        response = client.get(f"/gyne-cytology/{case.id}")

        assert response.status_code in (401, 403)

    def test_anonymous_update_is_rejected(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        response = client.patch(f"/gyne-cytology/{case.id}", json={"notes": "tampered"})

        assert response.status_code in (401, 403)

    def test_anonymous_delete_is_rejected(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        response = client.delete(f"/gyne-cytology/{case.id}")

        assert response.status_code in (401, 403)

    def test_authenticated_read_still_works(self, admin_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        response = admin_client.get(f"/gyne-cytology/{case.id}")

        assert response.status_code == 200


class TestNongyneCaseRequiresAuth:
    def test_anonymous_read_is_rejected(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        response = client.get(f"/nongyne-cytology/{case.id}")

        assert response.status_code in (401, 403)

    def test_anonymous_update_is_rejected(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        response = client.patch(f"/nongyne-cytology/{case.id}", json={"notes": "tampered"})

        assert response.status_code in (401, 403)

    def test_anonymous_delete_is_rejected(self, client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        response = client.delete(f"/nongyne-cytology/{case.id}")

        assert response.status_code in (401, 403)

    def test_authenticated_read_still_works(self, admin_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        response = admin_client.get(f"/nongyne-cytology/{case.id}")

        assert response.status_code == 200
