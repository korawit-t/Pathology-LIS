from fastapi import APIRouter, Depends
from app.core.config import settings
from app.core.roles import CAN_MANAGE_SYSTEM_SETTINGS, INTERNAL_STAFF_ONLY
from app.schemas.version import UpdateStatus
from app.services import update_check

router = APIRouter(prefix="/version", tags=["System"])


@router.get("")
def get_version():
    return {
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }


# Admin only, unlike GET /version above: knowing that an install is behind a
# public release tells a reader which published fixes it is still missing.
@router.get(
    "/update-status",
    response_model=UpdateStatus,
    dependencies=[Depends(INTERNAL_STAFF_ONLY), Depends(CAN_MANAGE_SYSTEM_SETTINGS)],
)
def get_update_status():
    return update_check.get_update_status()
