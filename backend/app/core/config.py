import os

# C4/H6: default to "production" so cookies are marked Secure and CORS
# is strict unless an operator explicitly opts into development. Local
# dev is opted in via docker-compose.override.yml (ENVIRONMENT=development)
# or by exporting the var in the shell. Fail-closed beats fail-open.
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production").lower()
IS_PRODUCTION: bool = ENVIRONMENT == "production"


OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_COMPATIBLE_API_KEY: str = os.getenv("OPENAI_COMPATIBLE_API_KEY", "")


class Settings:
    PROJECT_NAME: str = "Pathology LIS"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = ENVIRONMENT
    IS_PRODUCTION: bool = IS_PRODUCTION

settings = Settings()
