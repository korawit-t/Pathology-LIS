from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.gross_template import GrossTemplateResponse, GrossTemplateCreate, GrossTemplateUpdate
from app.crud import gross_template
from app.models.user import User
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/gross-templates",
    tags=["Gross Templates"],
    dependencies=[Depends(get_current_user)],
)

@router.get("", response_model=List[GrossTemplateResponse])
def read_templates(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None
):
    return gross_template.get_templates(db, skip=skip, limit=limit, category=category)

@router.post("", response_model=GrossTemplateResponse)
def create_new_template(
    obj_in: GrossTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return gross_template.create_template(db, obj_in=obj_in, user_id=current_user.id)

@router.put("/{template_id}", response_model=GrossTemplateResponse)
@router.patch("/{template_id}", response_model=GrossTemplateResponse)
def update_existing_template(
    template_id: int,
    obj_in: GrossTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """แก้ไข Template"""
    db_obj = gross_template.update_template(db, template_id=template_id, obj_in=obj_in)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Template not found")
    return db_obj

@router.delete("/{template_id}")
def deactivate_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ปิดการใช้งาน Template (Soft Delete)"""
    db_obj = gross_template.delete_template(db, template_id=template_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deactivated successfully"}