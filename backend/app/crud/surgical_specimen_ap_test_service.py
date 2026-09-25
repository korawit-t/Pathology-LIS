from sqlalchemy.orm import Session, selectinload
from app.models.surgical_specimen_ap_test import SurgicalSpecimenAPTest
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.surgical_specimen_ap_test import SpecimenAPTestCreate
from app.enums.case_states import (
    SURGICAL_STAIN_HOLDS,
    SURGICAL_TERMINAL,
    surgical_at_or_past,
)


def create_specimen_test(db: Session, data: SpecimenAPTestCreate):
    new_item = SurgicalSpecimenAPTest(
        surgical_specimen_id=data.surgical_specimen_id,
        ap_test_id=data.ap_test_id
    )
    db.add(new_item)
    db.flush()

    # Auto-update case status based on AP test category
    ap_test = db.get(AnatomicalPathologyTest, data.ap_test_id)
    specimen = db.get(SurgicalSpecimen, data.surgical_specimen_id)
    if ap_test and specimen:
        case = db.get(SurgicalCase, specimen.case_id)
        # ธง "รอผลย้อม" มีความหมายเฉพาะเคสที่สไลด์ออกมาแล้วเท่านั้น
        #
        # สถานะเคสมีคอลัมน์เดียว ธงจึงทับขั้นจริงของเคสทิ้ง — สั่งย้อมล่วงหน้า
        # ตั้งแต่ตอนกรอส์แล้วติดธง เคสจะหลุดจาก tab In Progress ของหน้า Gross
        # Examination ทั้งที่ยังกรอส์ไม่เสร็จ และไม่มีทางรู้ว่าต้องคืนไปขั้นไหน
        # ถ้ายกเลิกรายการนั้นทีหลัง
        #
        # ก่อนถึงขั้น "stained" ธงนี้ยังไม่มีประโยชน์อยู่แล้ว: รายการที่สั่ง
        # ล่วงหน้าจะถูกย้อมไปพร้อมรอบ H&E ปกติ แล้ว
        # stain_run._sync_case_status_from_he_stains ก็เขียนทับเป็น "stained"
        # ให้อยู่ดี
        if (
            case
            and case.status not in SURGICAL_TERMINAL
            and surgical_at_or_past(case.status, "stained")
        ):
            if ap_test.category == "IHC":
                case.status = "pending immuno"
            elif ap_test.category == "Histochem":
                case.status = "pending special stains"

    db.commit()
    db.refresh(new_item)
    return new_item


def get_specimen_tests(db: Session, specimen_id: int):
    return (
        db.query(SurgicalSpecimenAPTest)
        .options(selectinload(SurgicalSpecimenAPTest.ap_test))   # ← โหลด AP Test
        .filter(SurgicalSpecimenAPTest.surgical_specimen_id == specimen_id)
        .all()
    )


def delete_specimen_test(db: Session, item_id: int):
    item = db.query(SurgicalSpecimenAPTest).filter(SurgicalSpecimenAPTest.id == item_id).first()
    if not item:
        return None

    specimen_id = item.surgical_specimen_id
    db.delete(item)
    db.flush()

    # Recalculate case status after removal
    specimen = db.get(SurgicalSpecimen, specimen_id)
    if specimen:
        case = db.get(SurgicalCase, specimen.case_id)
        if case and case.status not in SURGICAL_TERMINAL:
            # Re-check all remaining AP tests across all specimens in the case
            remaining = (
                db.query(AnatomicalPathologyTest.category)
                .join(SurgicalSpecimenAPTest, SurgicalSpecimenAPTest.ap_test_id == AnatomicalPathologyTest.id)
                .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalSpecimenAPTest.surgical_specimen_id)
                .filter(SurgicalSpecimen.case_id == case.id)
                .all()
            )
            categories = {r.category for r in remaining}
            can_flag = surgical_at_or_past(case.status, "stained")
            if can_flag and "IHC" in categories:
                case.status = "pending immuno"
            elif can_flag and "Histochem" in categories:
                case.status = "pending special stains"
            elif case.status in SURGICAL_STAIN_HOLDS:
                # ไม่เหลือรายการ IHC/Histochem แล้ว — เคลียร์ธงรอผลย้อมทิ้ง
                #
                # เคลียร์ได้เฉพาะเคสที่ "ติดธงอยู่จริง" เท่านั้น ของเดิมเป็น else
                # เปล่า ๆ จึงเหวี่ยงเคสที่ยังอยู่ขั้น gross ไปเป็น "pending
                # diagnosis" ด้วย แค่ลบ tag ค่าตรวจหมวด Surgical Pathology ออก
                # จากตารางชิ้นเนื้อ (SpecimenTestInline) เคสก็หลุดจาก tab
                # In Progress ของหน้า Gross Examination ทั้งที่ยังกรอส์ไม่เสร็จ
                # — สังเกตได้จากความไม่สมมาตร: การ "เพิ่ม" ค่าตรวจหมวดนั้น
                # ไม่แตะสถานะเลย แต่การ "ลบ" กลับเปลี่ยน
                case.status = "pending diagnosis"

    db.commit()
    return True
