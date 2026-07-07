"""Router-level test for app/routers/version.py — intentionally public (no
auth anywhere), used by the frontend to check connectivity/version before
login. Not treated as an RBAC finding."""


def test_returns_version_and_environment(client):
    r = client.get("/version")
    assert r.status_code == 200
    body = r.json()
    assert "version" in body
    assert "environment" in body
