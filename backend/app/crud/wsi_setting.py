from sqlalchemy.orm import Session, joinedload

from app.models.wsi_setting import WsiScannerProfile, WsiSetting
from app.schemas.wsi_setting import (
    WsiScannerProfileCreate,
    WsiScannerProfileUpdate,
    WsiSettingUpdate,
)


def get_wsi_settings(db: Session, hospital_slug: str = "master") -> WsiSetting:
    settings = (
        db.query(WsiSetting)
        .filter(WsiSetting.hospital_slug == hospital_slug)
        .options(joinedload(WsiSetting.default_scanner_profile))
        .first()
    )
    if not settings:
        settings = WsiSetting(hospital_slug=hospital_slug)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return get_wsi_settings(db, hospital_slug)
    return settings


def update_wsi_settings(
    db: Session, obj_in: WsiSettingUpdate, hospital_slug: str = "master"
) -> WsiSetting:
    db_obj = (
        db.query(WsiSetting)
        .filter(WsiSetting.hospital_slug == hospital_slug)
        .first()
    )
    if not db_obj:
        db_obj = WsiSetting(hospital_slug=hospital_slug)
        db.add(db_obj)
        db.flush()

    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)

    db.commit()
    db.refresh(db_obj)
    return get_wsi_settings(db, hospital_slug)


def get_all_profiles(db: Session) -> list[WsiScannerProfile]:
    return db.query(WsiScannerProfile).order_by(WsiScannerProfile.id).all()


def get_profile_by_id(db: Session, profile_id: int) -> WsiScannerProfile | None:
    return db.query(WsiScannerProfile).filter(WsiScannerProfile.id == profile_id).first()


def create_profile(db: Session, data: WsiScannerProfileCreate) -> WsiScannerProfile:
    db_obj = WsiScannerProfile(**data.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def update_profile(
    db: Session, profile: WsiScannerProfile, data: WsiScannerProfileUpdate
) -> WsiScannerProfile:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


def delete_profile(db: Session, profile: WsiScannerProfile) -> None:
    db.delete(profile)
    db.commit()
