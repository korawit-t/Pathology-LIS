from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.roles import CAN_MANAGE_SYSTEM_SETTINGS, INTERNAL_STAFF_ONLY
from app.crud import system_setting as system_setting_crud
from app.db.database import get_db
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
def get_update_status(db: Session = Depends(get_db)):
    master = system_setting_crud.get_settings(db, hospital_slug="master")
    return update_check.get_update_status(notify=master.notify_new_release)
