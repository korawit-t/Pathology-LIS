from sqlalchemy.orm import Session
from app.utils.time import local_now
from fastapi import HTTPException
from app.models.surgical_specimen import SurgicalSpecimen
from app.schemas.surgical_specimen import SurgicalSpecimenUpdate, SurgicalSpecimenCreate
from app.enums.case_states import surgical_past
from app.models.surgical_block import SurgicalBlock
from app.utils.surgical_labels import (
    DELETE_RENUMBER,
    SCHEME_NUMBER_LETTER,
    case_label_scheme,
    case_labels_fixed,
    configured_delete_mode,
    configured_scheme,
    lock_case,
    next_specimen_label,
    resequence_case_blocks,
    scheme_of_labels,
    specimen_label_at,
)


def get_specimen(db: Session, specimen_id: int):
    return db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen_id).first()


def update_specimen_gross(
    db: Session, specimen_id: int, obj_in: SurgicalSpecimenUpdate, current_user_id: int
):
    # 1. ดึง Object มาจาก DB
    db_obj = (
        db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen_id).first()
    )
    if not db_obj:
        return None

    # 2. แกะข้อมูลจาก Schema และอัปเดต Audit Field
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    # 🚩 บันทึกว่าใครเป็นคนแก้ไขล่าสุด
    db_obj.updated_by_id = current_user_id

    try:
        db.add(db_obj)
        db.flush()
        db.refresh(db_obj)

        # 3. จัดการสถานะ SurgicalCase (Logic เดิมของคุณ)
        parent_case = db_obj.case
        if parent_case:
            all_specs = parent_case.specimens

            def is_complete(desc):
                if not desc:
                    return False
                content = (
                    desc.replace("<p>", "")
                    .replace("</p>", "")
                    .replace("<br>", "")
                    .strip()
                )
                return len(content) > 0

            is_all_filled = all(is_complete(s.gross_description) for s in all_specs)

            # เคยไล่รายชื่อสถานะไว้ตรงนี้ด้วยมือ แล้วลืม "sectioned" — เคสที่ตัดสไลด์
            # ไปแล้วจึงถูกดึงสถานะกลับได้ ตอนนี้คำนวณจาก SURGICAL_SPINE ที่เดียว
            # (แทนที่ point fix ใน 2437abe ที่เติม "sectioned" เข้าเซ็ตตรง ๆ — วิธีนี้
            # ปิด "cancelled" ที่ commit นั้นระบุว่าเว้นไว้ให้ด้วยในตัว)
            already_past_gross = surgical_past(parent_case.status, "grossed")

            if is_all_filled:
                parent_case.is_grossed = True
                if not parent_case.gross_at:
                    parent_case.gross_at = local_now()
                # Only set to grossed if not already further along in workflow
                if not already_past_gross:
                    parent_case.status = "grossed"
            else:
                # Don't revert status if case is already past grossed stage
                if not already_past_gross:
                    parent_case.status = "in progress"
                    parent_case.is_grossed = False

            db.add(parent_case)

        db.commit()
        db.refresh(db_obj)
        return db_obj

    except Exception as e:
        db.rollback()
        raise e


def update_specimen_gross_draft(
    db: Session, specimen_id: int, obj_in: SurgicalSpecimenUpdate, current_user_id: int
):
    """Save gross description as draft - does NOT change parent case status."""
    db_obj = (
        db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen_id).first()
    )
    if not db_obj:
        return None

    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    db_obj.updated_by_id = current_user_id

    try:
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        raise e


def create_specimen(db: Session, obj_in: SurgicalSpecimenCreate, current_user_id: int):
    # 1. หา Label ถัดไป — แบบ (A, B, C หรือ 1, 2, 3) ตามชิ้นเนื้อที่เคสมีอยู่แล้ว
    # setting ใช้เฉพาะชิ้นแรกของเคส จึงสลับ setting แล้วเคสเดิมไม่เปลี่ยน
    existing_labels = [
        row[0]
        for row in db.query(SurgicalSpecimen.specimen_label)
        .filter(SurgicalSpecimen.case_id == obj_in.surgical_case_id)
        .all()
    ]
    scheme = scheme_of_labels(existing_labels) or configured_scheme(db)
    next_label = next_specimen_label(existing_labels, scheme)

    # 2. สร้าง Object พร้อม Audit Field
    db_obj = SurgicalSpecimen(
        case_id=obj_in.surgical_case_id,
        specimen_label=next_label,
        specimen_name=obj_in.specimen_name,
        updated_by_id=current_user_id,  # 🚩 ใครเป็นคนสร้าง
    )

    try:
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        raise e


def delete_specimen(db: Session, specimen_id: int, current_user_id: int):
    db_obj = db.query(SurgicalSpecimen).get(specimen_id)
    if not db_obj:
        return None

    case_id = db_obj.case_id
    scheme = case_label_scheme(db, case_id)
    # ตัวอักษร block รันทั้งเคส: ยังอยู่ในห้อง gross ไหม — ต้องเช็กก่อนลบ
    # (block ของชิ้นนี้อาจเป็นตัวเดียวที่พิมพ์สติกเกอร์ไปแล้ว)
    in_gross_room = False
    if scheme == SCHEME_NUMBER_LETTER:
        lock_case(db, case_id)
        in_gross_room = not case_labels_fixed(db, case_id)

    # 🛡️ บล็อกถ้าชิ้นเนื้อถูกส่งเข้า Lab แล้ว
    for block in db_obj.blocks:
        if block.processing_record is not None:
            raise HTTPException(
                status_code=400,
                detail=f"ชิ้นเนื้อ {db_obj.specimen_label} ถูกส่งเข้าแล็บแล้ว ไม่สามารถลบได้",
            )

    try:
        db.delete(db_obj)
        db.flush()

        # 🚩 หลังลบ ต้อง Re-label และบันทึกว่าใครเป็นคน Re-label ล่าสุด
        remaining_specs = (
            db.query(SurgicalSpecimen)
            .filter(SurgicalSpecimen.case_id == case_id)
            .order_by(SurgicalSpecimen.id.asc())
            .all()
        )

        for index, spec in enumerate(remaining_specs):
            spec.specimen_label = specimen_label_at(index, scheme)
            spec.updated_by_id = current_user_id  # บันทึกว่าใครเป็นคนรันเลขใหม่
            db.add(spec)

        # เคส block ตัวอักษรรันทั้งเคส: block ของชิ้นที่ลบหายไปด้วย
        # ยังอยู่ในห้อง gross → เรียงตัวอักษรใหม่ทั้งเคสตามลำดับชิ้นเนื้อ
        # ออกจากห้อง gross แล้ว → ตาม setting: เลื่อนปิดช่องตามลำดับเดิม หรือเว้นไว้
        if in_gross_room:
            resequence_case_blocks(db, case_id)
        elif scheme == SCHEME_NUMBER_LETTER and configured_delete_mode(db) == DELETE_RENUMBER:
            remaining_blocks = (
                db.query(SurgicalBlock)
                .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
                .filter(
                    SurgicalSpecimen.case_id == case_id,
                    SurgicalBlock.case_block_seq.isnot(None),
                )
                .order_by(SurgicalBlock.case_block_seq.asc())
                .all()
            )
            for seq, block in enumerate(remaining_blocks, start=1):
                block.case_block_seq = seq

        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e


def update_specimen(
    db: Session, specimen_id: int, obj_in: SurgicalSpecimenUpdate, current_user_id: int
):
    db_obj = (
        db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen_id).first()
    )
    if not db_obj:
        return None

    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    # 🚩 บันทึก Audit Field
    db_obj.updated_by_id = current_user_id

    try:
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        raise e
