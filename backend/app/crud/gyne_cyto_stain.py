import logging
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from app.models.gyne_cyto_stain import GyneCytologyStain
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.gyne_cyto_stain import GyneStainCreate, GyneStainUpdate
from app.models.system_setting import SystemSetting

logger = logging.getLogger(__name__)
from app.models.gyne_cyto_stain import GyneStainRun, GyneStainRunDetail
from app.models.gyne_cyto_case import GyneCytologyCase
from fastapi import HTTPException


def create_stain(db: Session, obj_in: GyneStainCreate):
    db_obj = GyneCytologyStain(**obj_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_stains_by_case(db: Session, case_id: int):
    return (
        db.query(GyneCytologyStain).filter(GyneCytologyStain.case_id == case_id).all()
    )


def update_stain(db: Session, stain_id: int, obj_in: GyneStainUpdate):
    db_obj = (
        db.query(GyneCytologyStain).filter(GyneCytologyStain.id == stain_id).first()
    )
    if not db_obj:
        return None

    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    db.commit()
    db.refresh(db_obj)
    return db_obj


# 💡 Helper: สร้าง Pap Stain อัตโนมัติ (เรียกใช้ใน Gyne Case CRUD)
def auto_create_default_stain(db: Session, case_id: int):
    """
    สร้างสไลด์ใบแรกโดยอ้างอิงจาก System Settings (Source of Truth)
    """
    setting = db.query(SystemSetting).first()

    # ดึง ID จาก Setting ถ้าไม่มีจริงๆ ค่อยหา Fallback จาก Category
    test_id = None
    if setting and setting.default_gyne_test_id:
        test_id = setting.default_gyne_test_id
    else:
        fallback = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.category == "Cytology")
            .first()
        )
        test_id = fallback.id if fallback else None

    db_obj = GyneCytologyStain(
        case_id=case_id, test_id=test_id, slide_no=1, status="pending"
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_pending_print_stains(db: Session):
    """
    ดึงรายการสไลด์ที่ยังไม่ได้พิมพ์ (is_printed = False)
    พร้อมโหลดข้อมูล Case (Accession No) มาให้ Frontend ใช้งาน
    """
    return (
        db.query(GyneCytologyStain)
        # 🌟 ใช้ joinedload เพื่อดึงข้อมูลจากตาราง GyneCytologyCase มาใน Query เดียว
        .options(joinedload(GyneCytologyStain.case))
        .filter(GyneCytologyStain.is_printed == False)
        .order_by(GyneCytologyStain.created_at.desc())
        .all()
    )


def get_registered_queue_stains(db: Session):
    """
    ดึงรายการสไลด์ลงทะเบียนใหม่ พร้อมข้อมูลชื่อการตรวจจาก Master Data
    """
    return (
        db.query(GyneCytologyStain)
        .join(GyneCytologyStain.case)
        .options(
            joinedload(GyneCytologyStain.case),
            joinedload(GyneCytologyStain.test),
        )
        .filter(
            GyneCytologyStain.status == "pending",
            GyneCytologyCase.is_out_lab == False,
        )
        .order_by(GyneCytologyStain.created_at.asc())
        .all()
    )


def auto_create_default_stain(db: Session, case_id: int):
    """
    สร้างสไลด์ใบแรกโดยดึง PAP Stain จาก Master Data อัตโนมัติ (ใช้ System Code)
    """
    # 🚩 ค้นหาด้วย System Code แทนชื่อ สะอาดและแม่นยำกว่ามาก
    pap_test = (
        db.query(AnatomicalPathologyTest)
        .filter(AnatomicalPathologyTest.system_code == "PAP_ROUTINE")
        .first()
    )

    # ป้องกันกรณีหาไม่เจอ (เผื่อลืม Seed ข้อมูล) ให้ทำ Error Handling เล็กน้อย
    if not pap_test:
        # อาจจะ fallback ไปค้นหาด้วยชื่อ หรือ raise error ตามความเหมาะสม
        # ในที่นี้ถ้าไม่เจอ จะยังไม่สร้างเพื่อป้องกัน Foreign Key Error
        return None

    db_obj = GyneCytologyStain(
        case_id=case_id,
        test_id=pap_test.id,
        slide_no=1,
        status="pending",
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def create_stain_run(
    db: Session, stainer_id: str, stain_ids: list[int], run_no: str, user_id: int
):
    try:
        # 1. สร้างหัว Run
        db_run = GyneStainRun(
            run_no=run_no,
            stainer_id=stainer_id,
            operator_id=user_id,
            status="completed",
        )
        db.add(db_run)
        db.flush()

        # 2. สร้าง Details และ Update สถานะสไลด์
        for s_id in stain_ids:
            detail = GyneStainRunDetail(stain_run_id=db_run.id, stain_id=s_id)
            db.add(detail)

            db.query(GyneCytologyStain).filter(GyneCytologyStain.id == s_id).update(
                {"status": "stained"}
            )

        # Update parent case status so they appear in slide dispatch manual select
        stained_case_ids = (
            db.query(GyneCytologyStain.case_id)
            .filter(GyneCytologyStain.id.in_(stain_ids))
            .distinct()
            .all()
        )
        for (cid,) in stained_case_ids:
            db.query(GyneCytologyCase).filter(GyneCytologyCase.id == cid).update(
                {"status": "stained"}, synchronize_session=False
            )

        db.commit()
        db.refresh(db_run)
        return db_run

    except Exception as e:
        db.rollback()  # 🚩 ถ้าพังตรงไหนให้ยกเลิกทั้งหมด ป้องกันข้อมูลขยะ
        logger.error("Error creating gyne stain run: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Cannot create stain run. Check if run_no is duplicate.",
        )


def get_all_stain_runs(db: Session, skip: int = 0, limit: int = 20):
    return (
        db.query(GyneStainRun)
        .options(
            joinedload(GyneStainRun.operator),
            joinedload(GyneStainRun.details)
            .joinedload(GyneStainRunDetail.stain_order)
            .joinedload(GyneCytologyStain.case),
            joinedload(GyneStainRun.details)
            .joinedload(GyneStainRunDetail.stain_order)
            .joinedload(GyneCytologyStain.test),
        )
        .order_by(GyneStainRun.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
