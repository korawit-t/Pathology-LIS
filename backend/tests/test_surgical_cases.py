"""
Integration tests for the Surgical Cases endpoints.

Focuses on access control and response shape rather than full CRUD lifecycle
(create requires patient + hospital chains; those are covered by separate data tests).
"""

import pytest


class TestCaseListAccess:
    def test_unauthenticated_list_returns_401(self, client):
        r = client.get("/surgical-cases/")
        assert r.status_code == 401

    def test_admin_can_list_cases(self, admin_client):
        r = admin_client.get("/surgical-cases/")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert isinstance(body["items"], list)

    def test_pathologist_can_list_cases(self, pathologist_client):
        r = pathologist_client.get("/surgical-cases/")
        assert r.status_code == 200

    def test_list_supports_pagination_params(self, admin_client):
        r = admin_client.get("/surgical-cases/", params={"skip": 0, "limit": 5})
        assert r.status_code == 200

    def test_list_supports_search_param(self, admin_client):
        r = admin_client.get("/surgical-cases/", params={"search": "S26-99999"})
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 0   # no such case in test DB


class TestCaseDetail:
    def test_nonexistent_case_returns_404(self, admin_client):
        r = admin_client.get("/surgical-cases/999999")
        assert r.status_code == 404

    def test_unauthenticated_case_detail_returns_401(self, client):
        r = client.get("/surgical-cases/1")
        assert r.status_code == 401


class TestPublicSearch:
    def test_public_search_requires_auth(self, client):
        r = client.get("/surgical-cases/search-public", params={"q": "HN123"})
        assert r.status_code == 401

    def test_public_search_authenticated(self, admin_client):
        r = admin_client.get("/surgical-cases/search-public", params={"q": "HN123456"})
        assert r.status_code == 200
