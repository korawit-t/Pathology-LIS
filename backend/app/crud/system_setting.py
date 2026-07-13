# app/crud/system_setting.py
from sqlalchemy.orm import Session, joinedload
from app.models.system_setting import SystemSetting
from app.schemas.system_setting import SystemSettingUpdate


def get_all_settings(db: Session):
    return (
        db.query(SystemSetting)
        .options(
            joinedload(SystemSetting.default_gyne_test),
            joinedload(SystemSetting.default_non_gyne_test),
        )
        .order_by(SystemSetting.id)
        .all()
    )


def get_settings(db: Session, hospital_slug: str = "master"):
    # 🚩 1. ใช้ joinedload เพื่อดึงข้อมูลชื่อ Test มาจากตารางอื่นใน Query เดียว
    settings = (
        db.query(SystemSetting)
        .filter(SystemSetting.hospital_slug == hospital_slug)
        .options(
            joinedload(SystemSetting.default_gyne_test),
            joinedload(SystemSetting.default_non_gyne_test),
        )
        .first()
    )

    if not settings:
        # 🚩 2. ถ้ายังไม่มี Record ให้สร้างอันใหม่
        settings = SystemSetting(hospital_slug=hospital_slug)
        db.add(settings)
        db.commit()

        # 🚩 3. หลังจากสร้างใหม่ ต้องโหลดซ้ำพร้อม joinedload อีกรอบ
        # เพื่อให้ relationship ทำงานและไม่ส่ง Object เปล่าที่มีแต่ ID ออกไป
        db.refresh(settings)
        return get_settings(db, hospital_slug)

    return settings


def update_settings(db: Session, obj_in: SystemSettingUpdate, hospital_slug: str = "master"):
    # ดึงค่าที่มีอยู่ปัจจุบัน
    db_obj = db.query(SystemSetting).filter(SystemSetting.hospital_slug == hospital_slug).first()

    # กรณีไม่มีข้อมูลเลย (Fail-safe)
    if not db_obj:
        db_obj = SystemSetting(hospital_slug=hospital_slug)
        db.add(db_obj)
        db.flush()

    # 🚩 ดึงข้อมูลเฉพาะที่มีการส่งค่ามาจริงๆ จาก Schema
    # ฟิลด์ใหม่ๆ (surgical_express_tat_days, etc.) จะถูก update โดยอัตโนมัติถ้ามีใน Schema
    update_data = obj_in.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field == "hospital_slug":
            continue # Don't update the slug this way, it's used for lookup
        if hasattr(db_obj, field):  # กันเหนียว: ตรวจสอบว่า Model มีฟิลด์นี้จริง
            setattr(db_obj, field, value)

    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def delete_settings(db: Session, setting_id: int):
    # ป้องกันการลบ master
    db_obj = db.query(SystemSetting).filter(SystemSetting.id == setting_id).first()
    if not db_obj:
        return False
    if db_obj.hospital_slug == "master":
        raise ValueError("Cannot delete the master login page.")
    
    db.delete(db_obj)
    db.commit()
    return True
