"""UPLOAD_ROOT: one configurable folder for every upload.

Covers the setting (app/core/config.py), the key resolver and its containment
check (app/utils/storage_paths.py), the startup check that refuses a root set
explicitly but missing, the /storage router and uploads working against a
custom root, reports finding their images and logo there, and the read-only
scripts/check_upload_paths.py.

Every test points settings.UPLOAD_ROOT at a tmp_path; nothing here touches the
real backend/uploads.
"""

import importlib.util
import io
import logging
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path, PurePosixPath, PureWindowsPath

import pytest
from PIL import Image

import app.core.config as config
from app.core.config import BACKEND_DIR, DEFAULT_UPLOAD_ROOT, parse_upload_root
from app.models.gyne_case_image import GyneCaseImage
from app.models.surgical_request_file import SurgicalRequestFile
from app.services import pdf_service
from app.utils import storage_paths
from app.utils.storage_paths import InvalidStorageKey
from tests.factories import (
    build_bulk_save_payload,
    make_bare_case,
    make_bare_gyne_case,
    make_hospital,
    make_signable_case,
    make_system_setting,
)


@pytest.fixture
def root(tmp_path, monkeypatch):
    """A custom upload root, as if UPLOAD_ROOT pointed at it."""
    upload_root = tmp_path / "lis-uploads"
    upload_root.mkdir()
    monkeypatch.setattr(config.settings, "UPLOAD_ROOT", upload_root)
    monkeypatch.setattr(config.settings, "UPLOAD_ROOT_IS_EXPLICIT", True)
    return upload_root.resolve()


def _png(color="blue") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _run_python(code: str, *, cwd: Path, **env_overrides) -> subprocess.CompletedProcess:
    env = {**os.environ, "PYTHONPATH": str(BACKEND_DIR), **env_overrides}
    return subprocess.run(
        [sys.executable, "-c", code], cwd=cwd, env=env, capture_output=True, text=True, timeout=180,
    )


class TestSetting:
    def test_unset_is_backend_uploads(self):
        assert parse_upload_root(None) == (DEFAULT_UPLOAD_ROOT, False)
        assert parse_upload_root("  ") == (DEFAULT_UPLOAD_ROOT, False)
        assert DEFAULT_UPLOAD_ROOT == BACKEND_DIR / "uploads"
        assert DEFAULT_UPLOAD_ROOT.is_absolute()
        assert (BACKEND_DIR / "main.py").is_file()

    def test_absolute_value_is_used_as_is(self, tmp_path):
        assert parse_upload_root(str(tmp_path)) == (tmp_path, True)

    def test_quotes_left_by_start_ps1_are_removed(self, tmp_path):
        assert parse_upload_root(f'"{tmp_path}"') == (tmp_path, True)
        assert parse_upload_root(f"'{tmp_path}'") == (tmp_path, True)

    def test_relative_value_is_taken_from_the_backend_folder(self):
        assert parse_upload_root("data/uploads") == (BACKEND_DIR / "data" / "uploads", True)

    def test_env_override_is_read_at_startup(self, tmp_path):
        r = _run_python(
            "from app.core.config import settings; "
            "print(settings.UPLOAD_ROOT, settings.UPLOAD_ROOT_IS_EXPLICIT)",
            cwd=tmp_path, UPLOAD_ROOT=str(tmp_path / "share"),
        )
        assert r.returncode == 0, r.stderr
        assert r.stdout.strip() == f"{tmp_path / 'share'} True"

    def test_default_does_not_depend_on_the_working_directory(self, tmp_path):
        # The old code mixed cwd-relative and file-relative roots; they only
        # agreed because start.ps1 cd's into backend/ first.
        r = _run_python(
            "from app.core.config import settings; print(settings.UPLOAD_ROOT)",
            cwd=tmp_path, UPLOAD_ROOT="",
        )
        assert r.returncode == 0, r.stderr
        assert r.stdout.strip() == str(DEFAULT_UPLOAD_ROOT)


class TestResolve:
    @pytest.mark.parametrize("key, relative", [
        ("/storage/gross_images/12/a.jpg", "gross_images/12/a.jpg"),
        ("gross_images/12/a.jpg", "gross_images/12/a.jpg"),
        ("/storage/gyne_images/3/b.png", "gyne_images/3/b.png"),
        ("microscopic_images/c.jpg", "microscopic_images/c.jpg"),
        ("system/logo_report_d.png", "system/logo_report_d.png"),
        ("hospitals/logo_7_e.png", "hospitals/logo_7_e.png"),
    ])
    def test_every_stored_key_shape_lands_under_the_root(self, root, key, relative):
        assert storage_paths.resolve(key) == root / relative

    @pytest.mark.parametrize("key", [
        "",
        "../outside.png",
        "/storage/../../etc/passwd",
        "gross_images/../../outside.png",
        "/etc/passwd",
    ])
    def test_keys_escaping_the_root_are_refused(self, root, key):
        with pytest.raises(InvalidStorageKey):
            storage_paths.resolve(key)
        assert storage_paths.exists(key) is False

    def test_absolute_path_outside_the_root_is_refused(self, root, tmp_path):
        outside = tmp_path / "secret.env"
        outside.write_text("SECRET_KEY=x")
        with pytest.raises(InvalidStorageKey):
            storage_paths.resolve(str(outside))

    def test_symlink_out_of_the_root_is_refused(self, root, tmp_path):
        target = tmp_path / "elsewhere"
        target.mkdir()
        (target / "x.png").write_bytes(b"x")
        (root / "gross_images").symlink_to(target, target_is_directory=True)
        with pytest.raises(InvalidStorageKey):
            storage_paths.resolve("/storage/gross_images/x.png")

    def test_save_exists_open_delete_round_trip(self, root):
        key = "/storage/nongyne_images/5/f.png"
        assert storage_paths.exists(key) is False

        path = storage_paths.save(key, b"data")

        assert path == root / "nongyne_images" / "5" / "f.png"
        assert storage_paths.exists(key) is True
        with storage_paths.open_file(key) as fh:
            assert fh.read() == b"data"
        assert storage_paths.delete(key) is True
        assert storage_paths.delete(key) is False
        assert not path.exists()

    def test_save_does_not_recreate_a_root_that_went_away(self, root):
        shutil.rmtree(root)
        with pytest.raises(FileNotFoundError):
            storage_paths.save("system/logo.png", b"x")
        assert not root.exists()


class TestResolveStoredFile:
    """Request documents and consult / out-lab / molecular PDFs keep an
    absolute path on the row; it has to survive the uploads moving."""

    def test_path_under_the_current_root(self, root):
        path = storage_paths.save("consults/a.pdf", b"%PDF")
        assert storage_paths.resolve_stored_file(str(path)) == path

    @pytest.mark.parametrize("stored", [
        "/old/server/backend/uploads/consults/{name}",
        r"C:\New LIS\Pathology_LIS\backend\uploads\consults\{name}",
    ])
    def test_path_written_under_an_earlier_root_is_found_under_this_one(self, root, stored):
        name = f"consult_surgical_1_{uuid.uuid4().hex}.pdf"
        path = storage_paths.save(f"consults/{name}", b"%PDF")
        assert storage_paths.resolve_stored_file(stored.format(name=name)) == path

    @pytest.mark.parametrize("folder", sorted(storage_paths.ABSOLUTE_PATH_DIRS))
    def test_each_absolute_path_folder_is_rebased(self, root, folder):
        path = storage_paths.save(f"{folder}/x.pdf", b"%PDF")
        assert storage_paths.resolve_stored_file(f"/old-root/{folder}/x.pdf") == path

    def test_file_outside_the_root_is_refused(self, root, tmp_path, caplog):
        outside = tmp_path / "secret.env"
        outside.write_text("SECRET_KEY=x")
        with caplog.at_level(logging.WARNING, logger=storage_paths.__name__):
            assert storage_paths.resolve_stored_file(str(outside)) is None
        assert "Refusing stored file path outside" in caplog.text

    @pytest.mark.parametrize("stored", ["/x/consults/..", "/x/consults/.", "/"])
    def test_dot_names_are_not_rebased(self, root, stored):
        assert storage_paths.resolve_stored_file(stored) is None

    def test_missing_file_is_none_with_a_warning(self, root, caplog):
        with caplog.at_level(logging.WARNING, logger=storage_paths.__name__):
            assert storage_paths.resolve_stored_file("/old-root/molecular/gone.pdf") is None
        assert "gone.pdf" in caplog.text

    def test_unset_is_none(self, root):
        assert storage_paths.resolve_stored_file(None) is None
        assert storage_paths.resolve_stored_file("") is None


class TestFindForReport:
    def test_existing_file(self, root):
        path = storage_paths.save("system/logo.png", b"x")
        assert storage_paths.find_for_report("system/logo.png", "logo") == path

    def test_missing_file_is_logged_by_key(self, root, caplog):
        with caplog.at_level(logging.WARNING, logger=storage_paths.__name__):
            assert storage_paths.find_for_report("/storage/gyne_images/1/gone.png", "gyne image") is None
        assert "/storage/gyne_images/1/gone.png" in caplog.text
        assert "gyne image" in caplog.text

    def test_no_key_is_silent(self, root, caplog):
        with caplog.at_level(logging.WARNING, logger=storage_paths.__name__):
            assert storage_paths.find_for_report(None, "logo") is None
        assert caplog.text == ""


class TestFileUri:
    def test_unc_path_gets_the_form_urllib_opens(self):
        uri = storage_paths.file_uri(PureWindowsPath(r"\\fileserver\lis-uploads\system\logo.png"))
        assert uri == "file:////fileserver/lis-uploads/system/logo.png"

    def test_drive_and_posix_paths_are_unchanged(self):
        assert storage_paths.file_uri(PureWindowsPath(r"C:\lis\logo.png")) == "file:///C:/lis/logo.png"
        assert storage_paths.file_uri(PurePosixPath("/srv/lis/logo.png")) == "file:///srv/lis/logo.png"


class TestCheckUploadRoot:
    def test_default_root_is_created(self, tmp_path, monkeypatch):
        default = tmp_path / "uploads"
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", default)
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT_IS_EXPLICIT", False)

        assert storage_paths.check_upload_root() == default.resolve()
        assert default.is_dir()

    def test_explicit_missing_root_is_refused_and_not_created(self, tmp_path, monkeypatch):
        missing = tmp_path / "share-not-mounted"
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", missing)
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT_IS_EXPLICIT", True)

        with pytest.raises(RuntimeError, match="UPLOAD_ROOT=.*does not exist"):
            storage_paths.check_upload_root()
        assert not missing.exists()

    def test_explicit_root_that_is_a_file_is_refused(self, tmp_path, monkeypatch):
        not_a_dir = tmp_path / "file"
        not_a_dir.write_text("x")
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", not_a_dir)
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT_IS_EXPLICIT", True)

        with pytest.raises(RuntimeError, match="not a folder"):
            storage_paths.check_upload_root()

    @pytest.mark.skipif(
        sys.platform == "win32" or os.geteuid() == 0, reason="root ignores directory permissions"
    )
    def test_explicit_read_only_root_is_refused(self, root):
        root.chmod(0o555)
        try:
            with pytest.raises(RuntimeError, match="cannot write"):
                storage_paths.check_upload_root()
        finally:
            root.chmod(0o755)

    def test_explicit_writable_root_passes_and_leaves_no_probe(self, root):
        assert storage_paths.check_upload_root() == root
        assert list(root.iterdir()) == []


class TestStartup:
    """main.py runs check_upload_root() while the app is imported, which is
    when uvicorn starts it."""

    def test_missing_explicit_root_stops_the_backend(self, tmp_path):
        missing = tmp_path / "share-not-mounted"
        r = _run_python("import main", cwd=BACKEND_DIR, UPLOAD_ROOT=str(missing))

        assert r.returncode != 0
        assert f"UPLOAD_ROOT={missing}" in r.stderr
        assert not missing.exists()

    def test_existing_explicit_root_is_logged(self, tmp_path):
        r = _run_python("import main", cwd=BACKEND_DIR, UPLOAD_ROOT=str(tmp_path))

        assert r.returncode == 0, r.stderr
        assert f"[uploads] Storing uploaded files under {tmp_path.resolve()}" in r.stdout


class TestStorageRouter:
    def test_serves_from_the_custom_root(self, root, admin_client):
        storage_paths.save("/storage/gross_images/1/a.png", b"gross bytes")

        r = admin_client.get("/storage/gross_images/1/a.png")

        assert r.status_code == 200
        assert r.content == b"gross bytes"
        assert r.headers["cache-control"] == "private, no-store"

    def test_follows_the_root_rather_than_backend_uploads(self, root, admin_client, monkeypatch, tmp_path):
        storage_paths.save("/storage/gross_images/1/only-here.png", b"x")
        other = tmp_path / "other-root"
        other.mkdir()
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", other)

        assert admin_client.get("/storage/gross_images/1/only-here.png").status_code == 404

    def test_public_assets_serve_system_from_the_custom_root_only(self, root, client):
        storage_paths.save("system/logo_login_x.png", b"logo")
        storage_paths.save("/storage/gross_images/1/a.png", b"phi")

        assert client.get("/public-assets/system/logo_login_x.png").content == b"logo"
        assert client.get("/public-assets/gross_images/1/a.png").status_code == 403


class TestUploadsToCustomRoot:
    def test_hospital_logo_upload_lands_under_the_root_and_is_served(self, root, admin_client, db):
        hospital = make_hospital(db)

        r = admin_client.post(
            f"/org/hospitals/{hospital.id}/upload-logo",
            files={"file": ("logo.png", _png(), "image/png")},
        )

        assert r.status_code == 200, r.text
        key = r.json()["logo_path"]
        assert key.startswith("hospitals/logo_")
        assert (root / key).is_file()
        assert admin_client.get(f"/storage/{key}").content == (root / key).read_bytes()

    def test_request_file_still_downloads_after_the_uploads_move(
        self, root, admin_client, admin_user, db, monkeypatch, tmp_path
    ):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        r = admin_client.post(
            f"/surgical-cases/{case.id}/request-files",
            files={"file": ("req.pdf", b"%PDF-1.4 request", "application/pdf")},
        )
        assert r.status_code == 200, r.text
        row = db.get(SurgicalRequestFile, r.json()["file_id"])
        assert Path(row.file_path).is_relative_to(root / "requests")

        # Move the files and repoint UPLOAD_ROOT; the row is left as it was.
        new_root = tmp_path / "nas-share"
        shutil.copytree(root, new_root)
        shutil.rmtree(root)
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", new_root)

        r = admin_client.get(f"/surgical-cases/request-files/{row.id}")
        assert r.status_code == 200
        assert r.content == b"%PDF-1.4 request"


class TestReportsFromCustomRoot:
    def test_surgical_logo_is_found_and_the_pdf_fetcher_may_load_it(self, root, db):
        from app.crud.surgical_report import resolve_report_logo

        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.logo_path = "hospitals/logo_header.png"
        db.commit()
        logo = storage_paths.save("hospitals/logo_header.png", _png())

        report_data = {"hospital_id": hospital.id}
        resolve_report_logo(report_data, db)

        assert report_data["report_logo_url_snapshot"] == storage_paths.file_uri(logo)
        pdf_service._ReportURLFetcher().fetch(report_data["report_logo_url_snapshot"])

    def test_pdf_fetcher_still_refuses_other_upload_folders(self, root):
        gross = storage_paths.save("/storage/gross_images/1/a.png", _png())
        with pytest.raises(ValueError):
            pdf_service._ReportURLFetcher().fetch(storage_paths.file_uri(gross))

    def test_missing_logo_renders_without_it_and_is_logged(self, root, db, caplog):
        from app.crud.surgical_report import resolve_report_logo

        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.logo_path = "hospitals/logo_gone.png"
        db.commit()

        report_data = {"hospital_id": hospital.id}
        with caplog.at_level(logging.WARNING, logger=storage_paths.__name__):
            resolve_report_logo(report_data, db)

        assert report_data["report_logo_url_snapshot"] is None
        assert "hospitals/logo_gone.png" in caplog.text

    def test_gyne_report_embeds_images_from_the_root_and_logs_a_missing_one(
        self, root, db, admin_user, caplog
    ):
        from app.crud.gyne_cyto_report import _embed_case_images

        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        present = f"/storage/gyne_images/{case.id}/present.png"
        missing = f"/storage/gyne_images/{case.id}/missing.png"
        storage_paths.save(present, _png())
        db.add_all([
            GyneCaseImage(case_id=case.id, image_url=present, show_in_report=True, order=1),
            GyneCaseImage(case_id=case.id, image_url=missing, show_in_report=True, order=2),
        ])
        db.commit()

        with caplog.at_level(logging.WARNING, logger=storage_paths.__name__):
            images = _embed_case_images(db, case.id)

        assert len(images) == 1
        assert images[0]["data_uri"].startswith("data:image/jpeg;base64,")
        assert missing in caplog.text

    def test_surgical_pdf_prints_logo_and_gross_image_from_the_root(
        self, root, db, pathologist_client, admin_user, pathologist_user, monkeypatch, tmp_path
    ):
        """End to end: the real report endpoint and WeasyPrint. The logo goes
        in as a file:// URI through _ReportURLFetcher, the gross image as an
        embedded data URI, both read from the custom root."""
        import fitz

        from app.models.gross_image import GrossImage

        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, report_logo_url="system/logo_report_e2e.png")
        storage_paths.save("system/logo_report_e2e.png", _png("red"))
        gross_key = f"/storage/gross_images/{specimen.id}/e2e.png"
        storage_paths.save(gross_key, _png("green"))
        db.add(GrossImage(specimen_id=specimen.id, image_url=gross_key, show_in_report=True))
        db.commit()
        payload = build_bulk_save_payload(case.id, specimen.id, pathologist.id)
        report_id = pathologist_client.post(
            f"/surgical-reports/{case.id}/finalize-snapshot", json=payload.model_dump(mode="json")
        ).json()["id"]

        def image_count():
            r = pathologist_client.get(f"/surgical-reports/{report_id}/pdf")
            assert r.status_code == 200
            return sum(len(page.get_images()) for page in fitz.open(stream=r.content, filetype="pdf"))

        with_files = image_count()
        # Same rows, pointed at an empty root: both pictures drop out.
        empty = tmp_path / "empty-root"
        empty.mkdir()
        monkeypatch.setattr(config.settings, "UPLOAD_ROOT", empty)
        without_files = image_count()

        assert with_files - without_files >= 2


def _load_check_script():
    spec = importlib.util.spec_from_file_location(
        "check_upload_paths", BACKEND_DIR / "scripts" / "check_upload_paths.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestCheckUploadPathsScript:
    def test_every_listed_column_exists(self):
        from app.db.database import Base

        script = _load_check_script()
        for table, column in script.KEY_COLUMNS + script.ABSOLUTE_PATH_COLUMNS:
            assert column in Base.metadata.tables[table].c, f"{table}.{column}"

    def test_reports_missing_files_per_column(self, root, db, admin_user):
        script = _load_check_script()
        registrar, _ = admin_user
        present_logo = make_hospital(db)
        present_logo.logo_path = f"hospitals/logo_{uuid.uuid4().hex}.png"
        missing_logo = make_hospital(db)
        missing_logo.logo_path = f"hospitals/logo_{uuid.uuid4().hex}.png"
        storage_paths.save(present_logo.logo_path, b"x")

        case = make_bare_case(db, registrar_id=registrar.id)
        moved_name, gone_name = f"{uuid.uuid4().hex}.pdf", f"{uuid.uuid4().hex}.pdf"
        storage_paths.save(f"requests/{moved_name}", b"%PDF")
        moved = SurgicalRequestFile(
            case_id=case.id, file_path=f"/old-root/requests/{moved_name}",
            file_name="a.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        gone = SurgicalRequestFile(
            case_id=case.id, file_path=f"/old-root/requests/{gone_name}",
            file_name="b.pdf", file_type="application/pdf", uploaded_by_id=registrar.id,
        )
        db.add_all([moved, gone])
        db.commit()

        results = {(r.table, r.column): r for r in script.check(db)}

        logo_missing = {row_id for row_id, _ in results[("hospitals", "logo_path")].missing}
        assert missing_logo.id in logo_missing
        assert present_logo.id not in logo_missing
        request_missing = {row_id for row_id, _ in results[("surgical_request_files", "file_path")].missing}
        assert gone.id in request_missing
        assert moved.id not in request_missing

    def test_main_prints_counts_and_refuses_a_missing_root(self, root, monkeypatch, capsys, tmp_path):
        script = _load_check_script()
        logger = logging.getLogger(storage_paths.__name__)
        monkeypatch.setattr(logger, "level", logger.level)

        assert script.main(["--root", str(tmp_path / "nowhere")]) == 2

        assert script.main(["--root", str(root), "--show", "0"]) in (0, 1)
        out = capsys.readouterr().out
        assert f"Checking uploads under {root}" in out
        assert "hospitals.logo_path" in out
        assert "molecular_cases.outlab_pdf_path" in out
