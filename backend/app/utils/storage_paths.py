"""Where uploaded files live, and how a path stored on a row maps to a file.

Every upload sits under one root, settings.UPLOAD_ROOT (UPLOAD_ROOT in
backend/.env, default <backend>/uploads — see app/core/config.py). Rows keep
keys relative to that root, so the root can move — another disk, a file
share — without touching the database.

Key shapes found in the database, all accepted by resolve():

    /storage/gross_images/12/<uuid>.jpg   gross, gyne and non-gyne images: the
                                          URL the frontend fetches from the
                                          /storage router
    gross_images/12/<uuid>.jpg            the same key without /storage/
    microscopic_images/<uuid>.jpg         microscopic images, served by their
                                          own endpoint
    system/logo_report_<uuid>.png         lab logos (system settings)
    hospitals/logo_<id>_<uuid>.png        hospital report-header logos

Request documents and the consult / out-lab / molecular PDFs are the
exception: their rows hold an absolute path (str() of what save() returned).
resolve_stored_file() reads those, including ones written under an earlier
root.

The surface is kept to resolve / exists / open / save / delete on purpose, so a
non-disk backend (S3-compatible) could later sit behind the same calls.
"""
import logging
import re
import uuid
from pathlib import Path, PurePath

from app.core.config import settings

logger = logging.getLogger(__name__)

STORAGE_URL_PREFIX = "/storage/"

# Upload folders whose rows record an absolute path rather than a key. Files sit
# flat in them (<root>/<dir>/<file>), which is what lets a path written under an
# earlier root be found again under the current one.
ABSOLUTE_PATH_DIRS = frozenset({"requests", "consults", "outlab", "molecular"})


class InvalidStorageKey(ValueError):
    """A key that is empty or would resolve outside the upload root."""


def get_upload_root() -> Path:
    """The upload root, resolved. Read on every call rather than captured at
    import, so it always follows settings."""
    return Path(settings.UPLOAD_ROOT).resolve()


def resolve(key: str) -> Path:
    """Absolute path of the file a stored key names.

    Raises InvalidStorageKey for an empty key or one that escapes the root
    (`..`, an absolute path elsewhere, a symlink pointing out)."""
    if not key:
        raise InvalidStorageKey("Empty storage key")
    root = get_upload_root()
    path = (root / key.removeprefix(STORAGE_URL_PREFIX)).resolve()
    if not path.is_relative_to(root):
        raise InvalidStorageKey(f"Storage key resolves outside the upload root: {key!r}")
    return path


def exists(key: str) -> bool:
    try:
        return resolve(key).is_file()
    except InvalidStorageKey:
        return False


def open_file(key: str, mode: str = "rb"):
    return resolve(key).open(mode)


def save(key: str, data: bytes) -> Path:
    """Write `data` at `key`, creating its folder on first use. Returns the path.

    Folders are created inside the root only: a root that has gone away (a
    share dropped after startup) is an error, not something to recreate."""
    path = resolve(key)
    if not get_upload_root().is_dir():
        raise FileNotFoundError(f"Upload root {settings.UPLOAD_ROOT} is not reachable")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def delete(key: str) -> bool:
    """Remove the file at `key`. False when there was nothing to remove."""
    path = resolve(key)
    if path.is_file():
        path.unlink()
        return True
    return False


def find_for_report(key: str | None, what: str) -> Path | None:
    """The file behind `key` for a report about to render, or None.

    A report renders without a missing image or logo, as it always has; what
    this adds is a warning naming the key. With the uploads on a file share, a
    file that cannot be found usually means the share is unreachable, and
    reports printing without their pictures should show up in the log rather
    than pass unnoticed."""
    if not key:
        return None
    try:
        path = resolve(key)
    except InvalidStorageKey:
        logger.warning("Report %s has a storage key outside the upload root: %r", what, key)
        return None
    if not path.is_file():
        logger.warning(
            "Report %s not found: %r (looked under %s); rendering without it",
            what, key, get_upload_root(),
        )
        return None
    return path


def file_uri(path: PurePath) -> str:
    """file: URI for a path WeasyPrint will load.

    Path.as_uri() turns a UNC path (\\\\fileserver\\share\\x.png) into
    file://fileserver/share/x.png, which urllib, and so WeasyPrint, refuses to
    open ("file:// scheme is supported only on localhost"). The four-slash
    form opens, and reads back as the same UNC path."""
    uri = path.as_uri()
    if uri.startswith("file://") and not uri.startswith("file:///"):
        uri = "file:////" + uri.removeprefix("file://")
    return uri


def resolve_stored_file(stored_path: str | None) -> Path | None:
    """Resolve an absolute file path kept on a row — a request document's
    file_path, a case's consult_pdf_path / out_lab_result_pdf_path, a molecular
    case's outlab_pdf_path — before it is served, read or deleted.

    Returns None when the path is unset, the file is missing, or the path
    points outside the upload root. The download / replace / clear endpoints
    act on whatever the column holds, so a value pointing anywhere else (such
    as one written through a case PATCH before those fields were taken out of
    the Update schemas) must not get the backend's .env served or an arbitrary
    file deleted.

    A path written under an earlier root (before the uploads moved) is looked
    up again under the current one: these files sit flat in one of
    ABSOLUTE_PATH_DIRS, so <old root>/consults/x.pdf is <root>/consults/x.pdf.
    """
    if not stored_path:
        return None
    root = get_upload_root()
    try:
        resolved = Path(stored_path).resolve()
    except (OSError, RuntimeError, ValueError):
        return None

    if not resolved.is_relative_to(root):
        # Split on both separators, so a row written on Windows still parses
        # when read on Linux (a restored copy of the database) and vice versa.
        parts = [p for p in re.split(r"[\\/]", stored_path) if p]
        folder, name = (parts[-2], parts[-1]) if len(parts) >= 2 else ("", "")
        if folder not in ABSOLUTE_PATH_DIRS or name in (".", ".."):
            logger.warning("Refusing stored file path outside %s: %r", root, stored_path)
            return None
        resolved = (root / folder / name).resolve()
        if not resolved.is_relative_to(root):
            logger.warning("Refusing stored file path outside %s: %r", root, stored_path)
            return None

    if not resolved.is_file():
        logger.warning("Stored file not found: %r (looked for %s)", stored_path, resolved)
        return None
    return resolved


def check_upload_root() -> Path:
    """Startup check (main.py): make sure the upload root is usable, and say where it is.

    The default local root is created when missing, as before. One set through
    UPLOAD_ROOT is not: it must already exist and be writable, or this raises
    and the backend refuses to start. A file share that failed to mount would
    otherwise turn into an empty local folder, new uploads would land there,
    and every existing image would quietly go missing from reports."""
    root = Path(settings.UPLOAD_ROOT)
    if not settings.UPLOAD_ROOT_IS_EXPLICIT:
        root.mkdir(parents=True, exist_ok=True)
        return root.resolve()

    if not root.is_dir():
        raise RuntimeError(
            f"UPLOAD_ROOT={root} does not exist or is not a folder. Uploaded "
            "files are expected there, so the backend will not start without "
            "it. If it is a file share, check that the server is reachable and "
            "the account running the backend can open it. On Windows use a UNC "
            r"path (\\server\share), not a mapped drive letter. The folder is "
            "not created automatically, so a share that failed to mount cannot "
            "turn into an empty local folder."
        )
    probe = root / f".upload-root-probe-{uuid.uuid4().hex}"
    try:
        probe.write_bytes(b"")
        probe.unlink()
    except OSError as exc:
        raise RuntimeError(
            f"UPLOAD_ROOT={root} exists but this process cannot write to it "
            f"({exc}). Give the account running the backend read/write access "
            "to that folder or share."
        ) from exc
    return root.resolve()
