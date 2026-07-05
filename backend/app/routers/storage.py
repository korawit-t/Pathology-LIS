"""
Authenticated and (narrowly) public file delivery.

Replaces the previous `app.mount("/storage", StaticFiles(...))` in main.py,
which served every uploaded file — including PHI-bearing gross /
microscopic / slide images — without authentication. See SECURITY_AUDIT.md
finding M1 (effectively critical: direct PHI leak).

Two routers live here:

- `/storage/{file_path:path}` requires a valid session via
  `Depends(get_current_user)` and serves anything under `uploads/`.
- `/public-assets/{file_path:path}` is unauthenticated but constrained to
  `uploads/system/` (branding logos rendered on the login page, before
  the user authenticates). Every other subdirectory is rejected.

Both routes resolve the requested path and verify it stays inside the
expected base, defeating `../` traversal attempts.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.dependencies.auth import get_current_user, EXTERNAL_ROLES
from app.models.user import User


# Must match main.py's STORAGE_DIR constant.
STORAGE_DIR = Path("uploads").resolve()
PUBLIC_ASSETS_DIR = (STORAGE_DIR / "system").resolve()

# Raw diagnostic image directories — external roles must not access them directly.
# Internal lab staff (pathologist, cytotechnologist, gross, etc.) may access all dirs.
_PHI_IMAGE_DIRS = {"gross_images", "microscopic_images", "gyne_images", "nongyne_images", "consults"}
_EXTERNAL_ROLES = EXTERNAL_ROLES  # see app/dependencies/auth.py — shared across all hospital-scoping checks

router = APIRouter(prefix="/storage", tags=["Storage"])


@router.get("/{file_path:path}")
def serve_file(file_path: str, current_user: User = Depends(get_current_user)):
    """Serve any file under `uploads/` to an authenticated caller."""
    requested = (STORAGE_DIR / file_path).resolve()

    # 🔒 path-traversal protection
    try:
        requested.relative_to(STORAGE_DIR)
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 🔒 External roles (clinician, hospital) may not access raw diagnostic images.
    # They receive reports via the report endpoints, not raw uploads.
    user_roles = set(current_user.roles or [])
    if user_roles & _EXTERNAL_ROLES:
        top_subdir = file_path.split("/")[0]
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
    Serve files from `uploads/system/` without authentication. Used for
    branding (login-page logo) which is fetched before login.
    """
    requested = (STORAGE_DIR / file_path).resolve()

    # 🔒 must resolve to something inside uploads/system/ — rejects both
    # traversal (`../etc/passwd`) and accidental escapes to other
    # subdirs like uploads/gross_images/.
    try:
        requested.relative_to(PUBLIC_ASSETS_DIR)
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")

    if not requested.is_file():
        raise HTTPException(status_code=404)

    return FileResponse(requested)
