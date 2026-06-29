from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.schemas.diagnostic_template import (
    DiagnosticTemplateResponse,
    DiagnosticTemplateCreate,
    DiagnosticTemplateUpdate,
)
from app.crud import diagnostic_template as crud
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/diagnostic-templates",
    tags=["Diagnostic Templates"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "", response_model=DiagnosticTemplateResponse, status_code=status.HTTP_201_CREATED
)
def create_template(template: DiagnosticTemplateCreate, db: Session = Depends(get_db)):
    return crud.create_diagnostic_template(db=db, template=template)


@router.get("", response_model=List[DiagnosticTemplateResponse])
def read_templates(
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return crud.get_diagnostic_templates(db, skip=skip, limit=limit, category=category)


@router.get("/{template_id}", response_model=DiagnosticTemplateResponse)
def read_template(template_id: int, db: Session = Depends(get_db)):
    db_template = crud.get_diagnostic_template(db, template_id=template_id)
    if db_template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return db_template


@router.patch("/{template_id}", response_model=DiagnosticTemplateResponse)
def update_template(
    template_id: int, template: DiagnosticTemplateUpdate, db: Session = Depends(get_db)
):
    db_template = crud.update_diagnostic_template(
        db, template_id=template_id, template=template
    )
    if db_template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return db_template


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    success = crud.delete_diagnostic_template(db, template_id=template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Successfully deleted"}
