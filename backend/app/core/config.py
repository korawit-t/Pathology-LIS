import os

# C4/H6: default to "production" so cookies are marked Secure and CORS
# is strict unless an operator explicitly opts into development. Local
# dev is opted in via docker-compose.override.yml (ENVIRONMENT=development)
# or by exporting the var in the shell. Fail-closed beats fail-open.
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production").lower()
IS_PRODUCTION: bool = ENVIRONMENT == "production"


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


class Settings:
    PROJECT_NAME: str = "Pathology LIS"
    VERSION: str = "2.0.0"
    ENVIRONMENT: str = ENVIRONMENT
    IS_PRODUCTION: bool = IS_PRODUCTION

settings = Settings()
