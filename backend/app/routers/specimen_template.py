from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.models.specimen_template import SpecimenTemplate
from app.dependencies.auth import get_current_user
from pydantic import ConfigDict, BaseModel

router = APIRouter(
    prefix="/specimen-templates",
    tags=["Specimen Templates"],
    dependencies=[Depends(get_current_user)],
)

# --- Schemas ---


class SpecimenTemplateSchema(BaseModel):
    id: int
    name: str
    category: str

    model_config = ConfigDict(from_attributes=True)


class SpecimenTemplateCreate(BaseModel):
    name: str
    category: str = "surgical"


class SpecimenTemplateUpdate(BaseModel):
    name: str
    category: Optional[str] = None


# --- Routes ---


@router.get("", response_model=List[SpecimenTemplateSchema])
def get_all_templates(
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(SpecimenTemplate)
    if category:
        q = q.filter(SpecimenTemplate.category == category)
    return q.order_by(SpecimenTemplate.name.asc()).all()


@router.post("", response_model=SpecimenTemplateSchema)
def add_template(payload: SpecimenTemplateCreate, db: Session = Depends(get_db)):
    exists = db.query(SpecimenTemplate).filter(
        SpecimenTemplate.name == payload.name,
        SpecimenTemplate.category == payload.category,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Name already exists in this category")

    new_item = SpecimenTemplate(name=payload.name, category=payload.category)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


# 📝 เพิ่ม Route สำหรับแก้ไข (PATCH)
@router.patch("/{item_id}", response_model=SpecimenTemplateSchema)
def update_template(
    item_id: int, payload: SpecimenTemplateUpdate, db: Session = Depends(get_db)
):
    """แก้ไขชื่อ Template โดยเช็คชื่อซ้ำด้วย"""
    item = db.query(SpecimenTemplate).filter(SpecimenTemplate.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")

    # ตรวจสอบว่าชื่อใหม่ซ้ำกับที่มีอยู่ในระบบ (ยกเว้นชื่อตัวเอง) หรือไม่
    duplicate = (
        db.query(SpecimenTemplate)
        .filter(SpecimenTemplate.name == payload.name, SpecimenTemplate.id != item_id)
        .first()
    )

    if duplicate:
        raise HTTPException(
            status_code=400, detail="Another template with this name already exists"
        )

    item.name = payload.name
    if payload.category:
        item.category = payload.category
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}")
def delete_template(item_id: int, db: Session = Depends(get_db)):
    item = db.query(SpecimenTemplate).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(item)
    db.commit()
    return {"message": "Successfully deleted"}
