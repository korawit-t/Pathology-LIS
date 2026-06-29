"""
Tests for storage endpoint security.

Covers:
  1. Unauthenticated access → 401
  2. Clinician/hospital roles blocked from PHI image directories → 403
  3. Admin/pathologist can access (gets 404 if file missing, never 403)
  4. Path traversal guard (unit test of the resolve() logic)
"""

import pytest
from pathlib import Path


class TestStorageAuth:
    def test_unauthenticated_storage_returns_401(self, client):
        r = client.get("/storage/gross_images/test.jpg")
        assert r.status_code == 401

    def test_unauthenticated_public_assets_blocked(self, client):
        r = client.get("/storage/system/logo.png")
        assert r.status_code == 401


class TestPHIRestriction:
    PHI_DIRS = [
        "gross_images",
        "microscopic_images",
        "gyne_images",
        "nongyne_images",
        "consults",
    ]

    @pytest.mark.parametrize("phi_dir", PHI_DIRS)
    def test_clinician_blocked_from_phi_dir(self, clinician_client, phi_dir):
        """Clinician role must never reach PHI image directories."""
        r = clinician_client.get(f"/storage/{phi_dir}/nonexistent_test.jpg")
        assert r.status_code == 403, (
            f"Expected 403 for clinician accessing {phi_dir}, got {r.status_code}"
        )

    @pytest.mark.parametrize("phi_dir", PHI_DIRS)
    def test_hospital_role_blocked_from_phi_dir(self, client, db, phi_dir):
        """Hospital role mirrors clinician restriction."""
        import uuid
        from app.models.user import User
        from passlib.context import CryptContext
        _pwd = CryptContext(schemes=["argon2"], deprecated="auto")
        username = f"hosp_{uuid.uuid4().hex[:6]}"
        user = User(
            username=username,
            hashed_password=_pwd.hash("HospPass1!"),
            full_name="Test Hospital",
            roles=["hospital"],
            status=True,
            is_temporary_password=False,
        )
        db.add(user)
        db.commit()
        r = client.post("/auth/login", data={"username": username, "password": "HospPass1!"})
        assert r.status_code == 200
        r2 = client.get(f"/storage/{phi_dir}/nonexistent_test.jpg")
        assert r2.status_code == 403

    @pytest.mark.parametrize("phi_dir", PHI_DIRS)
    def test_admin_not_blocked_from_phi_dir(self, admin_client, phi_dir):
        """Admin role has no PHI restriction — missing file → 404, not 403."""
        r = admin_client.get(f"/storage/{phi_dir}/nonexistent_test.jpg")
        assert r.status_code == 404, (
            f"Expected 404 (file missing) for admin accessing {phi_dir}, got {r.status_code}"
        )

    def test_pathologist_not_blocked_from_phi(self, pathologist_client):
        r = pathologist_client.get("/storage/gross_images/nonexistent_test.jpg")
        assert r.status_code == 404


class TestPathTraversalGuard:
    def test_traversal_detected_by_resolve(self):
        """The resolve() + relative_to() guard catches path traversal attempts."""
        from app.routers.storage import STORAGE_DIR

        storage_root = STORAGE_DIR.resolve()
        malicious_paths = [
            "../../etc/passwd",
            "../../../etc/shadow",
            "gross_images/../../etc/passwd",
        ]
        for path in malicious_paths:
            requested = (storage_root / path).resolve()
            try:
                requested.relative_to(storage_root)
                escaped = False
            except ValueError:
                escaped = True
            assert escaped, f"Path traversal not caught for: {path!r}"

    def test_normal_path_passes_guard(self):
        """A normal path within STORAGE_DIR passes the resolve() check."""
        from app.routers.storage import STORAGE_DIR

        storage_root = STORAGE_DIR.resolve()
        normal = (storage_root / "gross_images" / "case_001.jpg").resolve()
        try:
            normal.relative_to(storage_root)
            safe = True
        except ValueError:
            safe = False
        assert safe
