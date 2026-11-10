"""Importing reports from an old system into the legacy report tables.

The page sends the file with every call (inspect, preview, commit) rather than
leaving it on the server between steps, so nothing with patient data waits
under UPLOAD_ROOT for a step that may never come.
"""

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.roles import CAN_IMPORT_LEGACY_REPORT
from app.crud import legacy_import as crud
from app.db.database import get_db
from app.schemas.legacy_import import (
    BatchList,
    BatchOut,
    ImportMapping,
    InspectResponse,
    PreviewResponse,
    ProfileIn,
    ProfileOut,
    ReportType,
    TargetFieldOut,
)
from app.services import legacy_import_service as svc

router = APIRouter(prefix="/legacy-imports", tags=["Legacy Import"])


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read(svc.MAX_FILE_BYTES + 1)
    if len(data) > svc.MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"ไฟล์ใหญ่เกิน {svc.MAX_FILE_BYTES // (1024 * 1024)} MB")
    return data


def _parse_mapping(raw: str) -> ImportMapping:
    try:
        return ImportMapping.model_validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json(include_url=False)))


def _file_error(exc: svc.ImportFileError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/fields", response_model=dict[str, List[TargetFieldOut]])
def list_fields(current_user=Depends(CAN_IMPORT_LEGACY_REPORT)):
    return {
        report_type: [
            {"key": f.key, "label": f.label, "kind": f.kind, "required": f.required, "group": f.group, "help": f.help}
            for f in fields
        ]
        for report_type, fields in svc.FIELDS.items()
    }


@router.post("/inspect", response_model=InspectResponse)
def inspect_file(
    file: UploadFile = File(...),
    report_type: ReportType = Form(...),
    sheet: Optional[str] = Form(None),
    header_row: int = Form(1, ge=1, le=50),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    data = _read_upload(file)
    try:
        return crud.inspect_file(data, file.filename, report_type, sheet or None, header_row)
    except svc.ImportFileError as exc:
        raise _file_error(exc)


@router.post("/preview", response_model=PreviewResponse)
def preview(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    parsed = _parse_mapping(mapping)
    data = _read_upload(file)
    try:
        return crud.preview(db, data, parsed)
    except svc.ImportFileError as exc:
        raise _file_error(exc)


@router.post("/commit", response_model=BatchOut, status_code=201)
def commit(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    skip_invalid: bool = Form(False),
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    parsed = _parse_mapping(mapping)
    data = _read_upload(file)
    try:
        batch = crud.commit(db, data, file.filename, parsed, skip_invalid, current_user)
    except svc.ImportFileError as exc:
        raise _file_error(exc)
    return crud.batch_out(batch)


@router.get("/batches", response_model=BatchList)
def list_batches(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    total, items = crud.list_batches(db, skip, limit)
    return {"total": total, "items": [crud.batch_out(b) for b in items]}


@router.post("/batches/{batch_id}/rollback", response_model=BatchOut)
def rollback_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    return crud.batch_out(crud.rollback_batch(db, batch_id, current_user))


@router.get("/profiles", response_model=List[ProfileOut])
def list_profiles(
    report_type: Optional[ReportType] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    return crud.list_profiles(db, report_type)


@router.post("/profiles", response_model=ProfileOut, status_code=201)
def create_profile(
    body: ProfileIn,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    return crud.create_profile(db, body, current_user)


@router.put("/profiles/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: int,
    body: ProfileIn,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    return crud.update_profile(db, profile_id, body)


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_IMPORT_LEGACY_REPORT),
):
    crud.delete_profile(db, profile_id)
    return Response(status_code=204)
