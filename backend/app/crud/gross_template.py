from sqlalchemy.orm import Session
from datetime import datetime
from app.utils.time import local_now
from typing import Optional

from app.models.gross_template import GrossTemplate
from app.schemas.gross_template import GrossTemplateCreate, GrossTemplateUpdate

# 1. ดึง Template ทีละอันตาม ID
def get_template(db: Session, template_id: int):
    return db.query(GrossTemplate).filter(GrossTemplate.id == template_id).first()

# 2. ดึงรายการ Template ทั้งหมด (รองรับการกรองตาม Category และสถานะ Active)
def get_templates(db: Session, skip: int = 0, limit: int = 100, category: Optional[str] = None):
    query = db.query(GrossTemplate).filter(GrossTemplate.is_active == True)
    
    if category:
        query = query.filter(GrossTemplate.category == category)
        
    return query.offset(skip).limit(limit).all()

# 3. สร้าง Template ใหม่
def create_template(db: Session, obj_in: GrossTemplateCreate, user_id: int):
    # แปลง Pydantic เป็น Dict
    template_data = obj_in.dict()
    
    new_template = GrossTemplate(
        **template_data,
        created_by_id=user_id # ผูกกับ ID ของ User ที่ส่งมาจาก Router
    )
    
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return new_template

# 4. อัปเดตข้อมูล Template
def update_template(db: Session, template_id: int, obj_in: GrossTemplateUpdate):
    db_obj = get_template(db, template_id)
    if not db_obj:
        return None

    # ดึงเฉพาะข้อมูลที่มีการส่งมาแก้ไข
    update_data = obj_in.dict(exclude_unset=True)

    for key, value in update_data.items():
        setattr(db_obj, key, value)

    db_obj.updated_at = local_now()
    db.commit()
    db.refresh(db_obj)
    return db_obj

# 5. ลบ Template (Soft Delete)
def delete_template(db: Session, template_id: int):
    db_obj = get_template(db, template_id)
    if not db_obj:
        return None

    # ใช้ Soft Delete โดยการเปลี่ยนสถานะ is_active เป็น False
    db_obj.is_active = False
    db_obj.updated_at = local_now()
    
    db.commit()
    return db_obj