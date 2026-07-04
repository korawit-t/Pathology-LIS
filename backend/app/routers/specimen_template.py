from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.models.specimen_template import SpecimenTemplate
from app.dependencies.auth import get_current_user
from pydantic import ConfigDict, BaseModel, Field

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
    default_slide_count: int
    requires_slide_count: bool
    requires_volume: bool
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class SpecimenTemplateReorderRequest(BaseModel):
    category: str
    # Full list of template ids for this category, in the desired display order
    ids: List[int]


class SpecimenTemplateCreate(BaseModel):
    name: str
    category: str = "surgical"
    default_slide_count: int = Field(default=1, ge=1)
    requires_slide_count: bool = False
    requires_volume: bool = False


class SpecimenTemplateUpdate(BaseModel):
    name: str
    category: Optional[str] = None
    default_slide_count: Optional[int] = Field(default=None, ge=1)
    requires_slide_count: Optional[bool] = None
    requires_volume: Optional[bool] = None


# --- Routes ---


@router.get("", response_model=List[SpecimenTemplateSchema])
def get_all_templates(
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(SpecimenTemplate)
    if category:
        q = q.filter(SpecimenTemplate.category == category)
    return q.order_by(SpecimenTemplate.sort_order.asc(), SpecimenTemplate.name.asc()).all()


@router.post("", response_model=SpecimenTemplateSchema)
def add_template(payload: SpecimenTemplateCreate, db: Session = Depends(get_db)):
    exists = db.query(SpecimenTemplate).filter(
        SpecimenTemplate.name == payload.name,
        SpecimenTemplate.category == payload.category,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Name already exists in this category")

    # New items append to the end of their category's display order
    max_order = (
        db.query(SpecimenTemplate.sort_order)
        .filter(SpecimenTemplate.category == payload.category)
        .order_by(SpecimenTemplate.sort_order.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0

    new_item = SpecimenTemplate(
        name=payload.name,
        category=payload.category,
        default_slide_count=payload.default_slide_count,
        requires_slide_count=payload.requires_slide_count,
        requires_volume=payload.requires_volume,
        sort_order=next_order,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@router.patch("/reorder", response_model=List[SpecimenTemplateSchema])
def reorder_templates(payload: SpecimenTemplateReorderRequest, db: Session = Depends(get_db)):
    """Persist drag-and-drop order from the Cytology Specimen Type Manager."""
    items = (
        db.query(SpecimenTemplate)
        .filter(
            SpecimenTemplate.id.in_(payload.ids),
            SpecimenTemplate.category == payload.category,
        )
        .all()
    )
    item_map = {item.id: item for item in items}
    for index, item_id in enumerate(payload.ids):
        if item_id in item_map:
            item_map[item_id].sort_order = index
    db.commit()
    return (
        db.query(SpecimenTemplate)
        .filter(SpecimenTemplate.category == payload.category)
        .order_by(SpecimenTemplate.sort_order.asc(), SpecimenTemplate.name.asc())
        .all()
    )


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
    if payload.default_slide_count is not None:
        item.default_slide_count = payload.default_slide_count
    if payload.requires_slide_count is not None:
        item.requires_slide_count = payload.requires_slide_count
    if payload.requires_volume is not None:
        item.requires_volume = payload.requires_volume
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
