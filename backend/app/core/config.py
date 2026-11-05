import os
from pathlib import Path

from dotenv import load_dotenv

# Loaded here as well as in app/db/database.py so settings read on their own
# (scripts/check_upload_paths.py) see backend/.env too. Never overrides a
# variable already set in the environment.
load_dotenv()

# C4/H6: default to "production" so cookies are marked Secure and CORS
# is strict unless an operator explicitly opts into development. Local
# dev is opted in via docker-compose.override.yml (ENVIRONMENT=development)
# or by exporting the var in the shell. Fail-closed beats fail-open.
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production").lower()
IS_PRODUCTION: bool = ENVIRONMENT == "production"


# C5: whether Swagger UI, ReDoc and the raw OpenAPI schema are served.
#
# Deliberately NOT derived from IS_PRODUCTION, even though it used to be.
# The two answer different questions — IS_PRODUCTION is a cookie/TLS posture,
# this is an exposure decision — and tying them together quietly undid the
# fix. A hospital LAN serves plain HTTP, so it has to keep
# ENVIRONMENT=development (backend/.env.example says exactly that, and
# production fail-closes on http:// origins anyway); that in turn handed it
# /docs, /redoc and /openapi.json, readable by every host on the subnet.
# Split out, the schema can be closed without claiming an HTTPS posture the
# deployment doesn't have.
#
# Fail-closed like ENVIRONMENT above: off unless an operator opts in with the
# literal "true". Staging that wants a browsable schema sets EXPOSE_DOCS=true.
EXPOSE_DOCS: bool = os.getenv("EXPOSE_DOCS", "false").lower().strip() == "true"


# Optional: shares the auth cookie across subdomains of one custom domain
# (e.g. ".mylis.example.com" so app.mylis.example.com and
# api.mylis.example.com are same-site to the browser, which Safari
# requires to accept the cookie cross-origin). Leave unset for LAN-only
# / single-host deployments, where the cookie defaults to the exact host
# that issued it.
COOKIE_DOMAIN: str | None = os.getenv("COOKIE_DOMAIN") or None

if IS_PRODUCTION and COOKIE_DOMAIN and COOKIE_DOMAIN.startswith(("http://", "https://")):
    raise RuntimeError(
        f"COOKIE_DOMAIN='{COOKIE_DOMAIN}' looks like a URL, not a domain. "
        "Set it to a bare domain, e.g. '.mylis.example.com' (leading dot optional)."
    )


# SameSite policy for the auth cookies (access_token / refresh_token).
#
#   "lax"  (default) — cookie is NOT sent on cross-site sub-requests, which is
#                      the browser-level CSRF defense. Correct for single-origin
#                      deployments where the frontend and backend are the same
#                      site (on-prem: SPA and API served from the same host, or
#                      the Railway build that reverse-proxies the API through
#                      the frontend's nginx so it's same-origin).
#   "none"           — cookie IS sent cross-site. Required ONLY when the
#                      frontend and backend are genuinely different sites (e.g.
#                      two separate Railway services on distinct
#                      *.up.railway.app hostnames). Browsers only accept
#                      SameSite=None when the cookie is also Secure, so this
#                      demands ENVIRONMENT=production (HTTPS). Using "none"
#                      when you don't need it needlessly opens CSRF.
#   "strict"         — most restrictive; usually overkill and can break some
#                      top-level navigation flows.
COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax").lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError(
        f"COOKIE_SAMESITE='{COOKIE_SAMESITE}' is invalid. Must be one of: lax, strict, none."
    )
if COOKIE_SAMESITE == "none" and not IS_PRODUCTION:
    raise RuntimeError(
        "COOKIE_SAMESITE=none requires ENVIRONMENT=production, because browsers "
        "only accept SameSite=None cookies when they are also marked Secure "
        "(HTTPS). Use 'lax' for local/HTTP development."
    )

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_COMPATIBLE_API_KEY: str = os.getenv("OPENAI_COMPATIBLE_API_KEY", "")


# Where uploaded files live: images, logos, request documents, consult and
# out-lab PDFs. Rows keep paths relative to this root (see
# app/utils/storage_paths.py), so moving the uploads to another disk or a
# file share means moving the files, changing UPLOAD_ROOT and restarting, with
# no database change. On Windows use a UNC path (\\fileserver\lis-uploads),
# never a mapped drive letter: a scheduled task or service does not see the
# drives mapped in somebody's logon session.
#
# Unset, it is <backend>/uploads, anchored to this file rather than the working
# directory, which is where every install has kept them so far. A value that is
# set must already exist and be writable or the backend refuses to start
# (storage_paths.check_upload_root): a share that failed to mount must not
# quietly turn into an empty local folder.
BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_UPLOAD_ROOT = BACKEND_DIR / "uploads"


def parse_upload_root(raw: str | None) -> tuple[Path, bool]:
    """(root, set explicitly?) for a raw UPLOAD_ROOT value."""
    # start.ps1 copies .env values into the environment without removing quotes.
    value = (raw or "").strip().strip('"').strip("'")
    if not value:
        return DEFAULT_UPLOAD_ROOT, False
    path = Path(value)
    # A relative value is taken from the backend folder, like the default.
    return (path if path.is_absolute() else BACKEND_DIR / path), True


UPLOAD_ROOT, UPLOAD_ROOT_IS_EXPLICIT = parse_upload_root(os.getenv("UPLOAD_ROOT"))


class Settings:
    PROJECT_NAME: str = "Pathology LIS"
    VERSION: str = "3.0.0"
    ENVIRONMENT: str = ENVIRONMENT
    IS_PRODUCTION: bool = IS_PRODUCTION
    EXPOSE_DOCS: bool = EXPOSE_DOCS
    UPLOAD_ROOT: Path = UPLOAD_ROOT
    UPLOAD_ROOT_IS_EXPLICIT: bool = UPLOAD_ROOT_IS_EXPLICIT

settings = Settings()
