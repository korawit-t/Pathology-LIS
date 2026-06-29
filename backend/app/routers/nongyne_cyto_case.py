import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from app.utils.file_handler import validate_and_sanitize
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from datetime import datetime, date, time

from app.db.database import get_db
from app.schemas.nongyne_cyto_case import (
    NongyneCytologyCaseCreate,
    NongyneCytologyCaseUpdate,
    NongyneCytologyCaseResponse,
    NongyneCytologyListResponse,
)
from app.crud import nongyne_cyto_case as crud
from app.dependencies.auth import get_current_user
from app.models.nongyne_request_file import NongyneRequestFile
from app.models.nongyne_cyto_case import NongyneCytologyCase

NONGYNE_UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "requests")
os.makedirs(NONGYNE_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/nongyne-cytology", tags=["Nongyne Cytology"])


@router.post(
    "",
    response_model=NongyneCytologyCaseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_case(
    case_in: NongyneCytologyCaseCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """
    สร้างเคส Non-Gyne Cytology ใหม่ (ระบบจะรัน Accession No. และบันทึกผู้ลงทะเบียนอัตโนมัติ)
    """
    return crud.create_nongyne_case(db=db, obj_in=case_in, registrar_id=current_user.id)


@router.get("", response_model=NongyneCytologyListResponse)
def read_cases(
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    status: str = None,
    assigned_to_me: bool = False,
    hospital_id: Optional[int] = Query(None),
    medical_scheme_id: Optional[int] = Query(None),
    is_out_lab_consult: bool = None,
    consult_status: str = None,
    is_cell_block: bool = None,
    cell_block_status: str = None,
    is_reported: bool = None,
    patient_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    stain_status: Optional[str] = Query(None),
    is_screened: Optional[bool] = Query(None),
    is_pending: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    assigned_user_id = current_user.id if assigned_to_me else None

    return crud.get_nongyne_cases(
        db=db,
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        assigned_user_id=assigned_user_id,
        hospital_id=hospital_id,
        medical_scheme_id=medical_scheme_id,
        is_out_lab_consult=is_out_lab_consult,
        consult_status=consult_status,
        is_cell_block=is_cell_block,
        cell_block_status=cell_block_status,
        is_reported=is_reported,
        is_screened=is_screened,
        is_pending=is_pending,
        patient_id=patient_id,
        date_from=datetime.combine(date_from, time.min) if date_from else None,
        date_to=datetime.combine(date_to, time.max) if date_to else None,
        stain_status=stain_status,
    )


@router.get("/statistics")
def read_nongyne_statistics(
    start_date: str,
    end_date: str,
    pathologist_id: int = None,
    cytotechnologist_id: int = None,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_nongyne_statistics(db, start, end, pathologist_id, cytotechnologist_id)


@router.get("/slide-quality-stats")
def read_nongyne_slide_quality_stats(
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_nongyne_slide_quality_stats(db, start, end)


@router.get("/{case_id}", response_model=NongyneCytologyCaseResponse)
def read_case(case_id: int, db: Session = Depends(get_db)):
    db_case = crud.get_nongyne_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อมูลเคส")
    return db_case


@router.patch("/{case_id}", response_model=NongyneCytologyCaseResponse)
def update_case_info(
    case_id: int, case_in: NongyneCytologyCaseUpdate, db: Session = Depends(get_db)
):
    db_case = crud.get_nongyne_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    return crud.update_nongyne_case(db=db, db_obj=db_case, obj_in=case_in)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(case_id: int, db: Session = Depends(get_db)):
    success = crud.delete_nongyne_case(db=db, case_id=case_id)
    if not success:
        raise HTTPException(
            status_code=404, detail="Case not found or cannot be deleted"
        )
    return None


@router.post("/{case_id}/request-files", response_model=None)
async def upload_request_file(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate magic bytes, enforce 30 MB cap, strip EXIF for images
    data, ext = validate_and_sanitize(file, allowed="mixed")

    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(NONGYNE_UPLOAD_DIR, unique_filename)
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    record = NongyneRequestFile(
        case_id=case_id,
        file_path=file_path,
        file_name=file.filename,
        file_type=file.content_type,
        uploaded_by_id=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"message": "File uploaded successfully", "file_id": record.id}


@router.get("/request-files/{file_id}")
def download_request_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    req_file = db.query(NongyneRequestFile).filter(NongyneRequestFile.id == file_id).first()
    if not req_file:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.exists(req_file.file_path):
        raise HTTPException(status_code=404, detail="Physical file not found on server")
    return FileResponse(path=req_file.file_path, filename=req_file.file_name, media_type=req_file.file_type)


@router.delete("/request-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    req_file = db.query(NongyneRequestFile).filter(NongyneRequestFile.id == file_id).first()
    if not req_file:
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.exists(req_file.file_path):
        os.remove(req_file.file_path)
    db.delete(req_file)
    db.commit()
    return None
