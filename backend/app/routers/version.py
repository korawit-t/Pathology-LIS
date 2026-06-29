from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(prefix="/version", tags=["System"])


@router.get("")
def get_version():
    return {
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }
