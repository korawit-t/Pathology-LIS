"""
Authenticated and (narrowly) public file delivery.

Replaces the previous `app.mount("/storage", StaticFiles(...))` in main.py,
which served every uploaded file — including PHI-bearing gross /
microscopic / slide images — without authentication. See SECURITY_AUDIT.md
finding M1 (effectively critical: direct PHI leak).

Two routers live here:

- `/storage/{file_path:path}` requires a valid session via
  `Depends(get_current_user)` and serves anything under the upload root
  (UPLOAD_ROOT, default backend/uploads — see app/utils/storage_paths.py).
- `/public-assets/{file_path:path}` is unauthenticated but constrained to
  `<upload root>/system/` (branding logos rendered on the login page, before
  the user authenticates). Every other subdirectory is rejected.

Both routes resolve the requested path through storage_paths.resolve, which
refuses anything outside the upload root (`../` traversal, absolute paths,
symlinks out), and then check the folder it actually landed in.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.dependencies.auth import get_current_user, EXTERNAL_ROLES
from app.models.user import User
from app.utils import storage_paths


# Raw diagnostic image directories — external roles must not access them directly.
# Internal lab staff (pathologist, cytotechnologist, gross, etc.) may access all dirs.
_PHI_IMAGE_DIRS = {"gross_images", "microscopic_images", "gyne_images", "nongyne_images", "consults"}
_EXTERNAL_ROLES = EXTERNAL_ROLES  # see app/dependencies/auth.py — shared across all hospital-scoping checks

router = APIRouter(prefix="/storage", tags=["Storage"])


@router.get("/{file_path:path}")
def serve_file(file_path: str, current_user: User = Depends(get_current_user)):
    """Serve any file under the upload root to an authenticated caller."""
    # 🔒 path-traversal protection
    try:
        requested = storage_paths.resolve(file_path)
    except storage_paths.InvalidStorageKey:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 🔒 External roles (clinician, hospital) may not access raw diagnostic images.
    # They receive reports via the report endpoints, not raw uploads.
    # The folder is read off the resolved path, not the URL: a URL's first
    # segment can be a decoy ("system/%2e%2e/gross_images/…" is gross_images).
    user_roles = set(current_user.roles or [])
    if user_roles & _EXTERNAL_ROLES:
        parts = requested.relative_to(storage_paths.get_upload_root()).parts
        top_subdir = parts[0].lower() if parts else ""
        if top_subdir in _PHI_IMAGE_DIRS:
            raise HTTPException(status_code=403, detail="Access denied.")

    if not requested.is_file():
        raise HTTPException(status_code=404)

    response = FileResponse(requested)
    response.headers["Cache-Control"] = "private, no-store"
    return response


public_router = APIRouter(prefix="/public-assets", tags=["Public Assets"])


@public_router.get("/{file_path:path}")
def serve_public_file(file_path: str):
    """
    Serve files from `<upload root>/system/` without authentication. Used for
    branding (login-page logo) which is fetched before login.
    """
    # 🔒 must resolve to something inside <upload root>/system/ — rejects both
    # traversal (`../etc/passwd`) and accidental escapes to other
    # subdirs like gross_images/.
    try:
        requested = storage_paths.resolve(file_path)
    except storage_paths.InvalidStorageKey:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not requested.is_relative_to(storage_paths.get_upload_root() / "system"):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not requested.is_file():
        raise HTTPException(status_code=404)

    return FileResponse(requested)
