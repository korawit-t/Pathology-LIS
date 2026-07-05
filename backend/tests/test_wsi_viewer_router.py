"""Regression tests for two bugs in app/routers/wsi_viewer.py:

1. /wsi/info, /wsi/thumbnail, /wsi/dzi-info, /wsi/dzi-tile/... had no auth
   dependency at all (unlike every sibling route in the file, which requires
   CAN_VIEW_WSI) — any unauthenticated caller could hit them.
2. _open_slide() opened whatever `path` the caller supplied with no check
   that it stayed inside the configured WSI root — a path-traversal /
   arbitrary-file-read bug. The fix resolves the requested path and rejects
   anything outside `WsiSetting.wsi_root_path`, mirroring app/routers/storage.py.
"""

from app.models.wsi_setting import WsiSetting


def _configure_wsi_root(db, root_dir) -> None:
    db.query(WsiSetting).delete()
    db.add(WsiSetting(hospital_slug="master", wsi_root_path=str(root_dir)))
    db.commit()


class TestWsiViewerRequiresAuth:
    def test_info_rejects_anonymous(self, client, db, tmp_path):
        _configure_wsi_root(db, tmp_path)

        response = client.get("/wsi/info", params={"path": str(tmp_path / "slide.svs")})

        assert response.status_code in (401, 403)

    def test_thumbnail_rejects_anonymous(self, client, db, tmp_path):
        _configure_wsi_root(db, tmp_path)

        response = client.get("/wsi/thumbnail", params={"path": str(tmp_path / "slide.svs")})

        assert response.status_code in (401, 403)

    def test_dzi_info_rejects_anonymous(self, client, db, tmp_path):
        _configure_wsi_root(db, tmp_path)

        response = client.get("/wsi/dzi-info", params={"path": str(tmp_path / "slide.svs")})

        assert response.status_code in (401, 403)

    def test_dzi_tile_rejects_anonymous(self, client, db, tmp_path):
        _configure_wsi_root(db, tmp_path)

        response = client.get("/wsi/dzi-tile/0/0/0", params={"path": str(tmp_path / "slide.svs")})

        assert response.status_code in (401, 403)


class TestWsiViewerPathContainment:
    def test_path_outside_configured_root_is_rejected(self, pathologist_client, db, tmp_path):
        root_dir = tmp_path / "wsi_root"
        root_dir.mkdir()
        _configure_wsi_root(db, root_dir)

        outside_dir = tmp_path / "outside"
        outside_dir.mkdir()
        secret_file = outside_dir / "secret.svs"
        secret_file.write_bytes(b"not a real slide")

        response = pathologist_client.get("/wsi/info", params={"path": str(secret_file)})

        assert response.status_code == 403

    def test_traversal_attempt_is_rejected(self, pathologist_client, db, tmp_path):
        root_dir = tmp_path / "wsi_root"
        root_dir.mkdir()
        _configure_wsi_root(db, root_dir)

        traversal_path = str(root_dir / ".." / "outside" / "secret.svs")

        response = pathologist_client.get("/wsi/info", params={"path": traversal_path})

        assert response.status_code == 403

    def test_path_inside_root_passes_containment_check(self, pathologist_client, db, tmp_path):
        """A file that IS inside the configured root should clear the
        containment check — it only 404s because it isn't a real slide file,
        proving the 403 above is specifically about containment, not auth."""
        root_dir = tmp_path / "wsi_root"
        root_dir.mkdir()
        _configure_wsi_root(db, root_dir)

        missing_path = str(root_dir / "does_not_exist.svs")

        response = pathologist_client.get("/wsi/info", params={"path": missing_path})

        assert response.status_code == 404
