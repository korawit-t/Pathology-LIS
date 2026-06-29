from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.anatomical_pathology_test import (
    AnatomicalPathologyTestCreate,
    AnatomicalPathologyTestUpdate,
)


def create_test(db: Session, data: AnatomicalPathologyTestCreate):
    # ใช้ model_dump() แทน dict() หากใช้ Pydantic V2
    new_item = AnatomicalPathologyTest(**data.model_dump())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


def get_test_by_id(db: Session, test_id: int):
    return (
        db.query(AnatomicalPathologyTest)
        .filter(AnatomicalPathologyTest.id == test_id)
        .first()
    )


def list_tests(db: Session, category: str = None):
    """
    List all tests with optional category filtering and alphabetical sorting
    """
    query = db.query(AnatomicalPathologyTest)
    if category:
        query = query.filter(AnatomicalPathologyTest.category == category)

    return query.order_by(AnatomicalPathologyTest.name.asc()).all()


def update_test(db: Session, item_id: int, data: AnatomicalPathologyTestUpdate):
    item = get_test_by_id(db, item_id)
    if not item:
        return None

    # 🚩 ใช้ model_dump(exclude_unset=True) เพื่ออัปเดตเฉพาะฟิลด์ที่ส่งมา
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item


def delete_test(db: Session, item_id: int):
    item = get_test_by_id(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Test not found")

    db.delete(item)
    db.commit()
    return {"message": "Deleted successfully"}


# 🚩 ฟังก์ชัน Alias เพื่อให้เรียกใช้งานได้หลากหลายชื่อตามความถนัด
get_all_tests = list_tests


def get_all_ap_tests(db: Session):
    return (
        db.query(AnatomicalPathologyTest)
        .options(joinedload(AnatomicalPathologyTest.outlab))
        .all()
    )


def get_test_by_system_code(db: Session, system_code: str):
    return (
        db.query(AnatomicalPathologyTest)
        .filter(AnatomicalPathologyTest.system_code == system_code)
        .first()
    )
