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

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_COMPATIBLE_API_KEY: str = os.getenv("OPENAI_COMPATIBLE_API_KEY", "")


class Settings:
    PROJECT_NAME: str = "Pathology LIS"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = ENVIRONMENT
    IS_PRODUCTION: bool = IS_PRODUCTION

settings = Settings()
