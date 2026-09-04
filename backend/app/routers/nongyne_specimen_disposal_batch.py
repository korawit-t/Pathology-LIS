from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.roles import (
    CAN_APPROVE_SPECIMEN_DISPOSAL,
    CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL,
)
from app.crud import nongyne_specimen_disposal_batch as crud
from app.crud.slide_block_release import _full_patient_name
from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.models.nongyne_specimen_disposal_batch import NongyneSpecimenDisposalBatch
from app.models.user import User
from app.schemas.nongyne_specimen_disposal_batch import (
    NongyneDisposalBatchCancel,
    NongyneDisposalBatchConfirm,
    NongyneDisposalBatchCreate,
    NongyneDisposalBatchPagination,
    NongyneDisposalBatchResponse,
)
from app.utils.time import local_now

router = APIRouter(
    prefix="/nongyne-specimen-disposal-batches",
    tags=["Nongyne Specimen Disposal"],
)


def _serialize(batch: NongyneSpecimenDisposalBatch) -> dict:
    """แผ่ข้อมูลเคสขึ้นมาที่ item เพื่อให้ frontend แสดงรายการในใบได้โดยไม่ต้องยิงซ้ำ"""
    today = local_now().date()
    items = []
    for item in batch.items:
        case = item.case
        report_at = case.report_at if case else None
        items.append(
            {
                "id": item.id,
                "case_id": item.case_id,
                "accession_no": case.accession_no if case else None,
                "hn": case.hn if case else None,
                "patient_name": _full_patient_name(case.patient) if case else None,
                "specimen_type": case.specimen_type if case else None,
                "collection_site": case.collection_site if case else None,
                "report_at": report_at,
                "days_since_report": (
                    (today - report_at.date()).days if report_at else None
                ),
            }
        )
    return {
        "id": batch.id,
        "batch_no": batch.batch_no,
        "status": batch.status,
        "retention_days": batch.retention_days,
        "disposal_method": batch.disposal_method,
        "remark": batch.remark,
        "printed_at": batch.printed_at,
        "printed_by": batch.printed_by,
        "disposer_id": batch.disposer_id,
        "verifier_id": batch.verifier_id,
        "approver_id": batch.approver_id,
        "disposer_name": batch.disposer_name,
        "verifier_name": batch.verifier_name,
        "approver_name": batch.approver_name,
        "disposed_at": batch.disposed_at,
        "disposed_by": batch.disposed_by,
        "cancelled_at": batch.cancelled_at,
        "cancelled_by": batch.cancelled_by,
        "cancel_reason": batch.cancel_reason,
        "item_count": len(items),
        "items": items,
    }


@router.post(
    "", response_model=NongyneDisposalBatchResponse, status_code=status.HTTP_201_CREATED
)
def create_disposal_batch(
    payload: NongyneDisposalBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL),
):
    batch = crud.create_batch(
        db,
        case_ids=payload.case_ids,
        disposer_id=payload.disposer_id,
        verifier_id=payload.verifier_id,
        approver_id=payload.approver_id,
        printed_by_id=current_user.id,
    )
    return _serialize(batch)


@router.get("", response_model=NongyneDisposalBatchPagination)
def list_disposal_batches(
    skip: int = 0,
    limit: int = 20,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL),
):
    data = crud.get_batches(db, skip=skip, limit=limit, status=status_filter)
    return {
        "items": [_serialize(b) for b in data["items"]],
        "total": data["total"],
    }


@router.get("/open-count")
def get_open_batch_count(
    db: Session = Depends(get_db),
    _: User = Depends(CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL),
):
    return {"count": crud.count_open_batches(db)}


@router.get("/{batch_id}", response_model=NongyneDisposalBatchResponse)
def get_disposal_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL),
):
    return _serialize(crud.get_batch(db, batch_id))


@router.get("/{batch_id}/checklist-pdf")
def download_disposal_checklist(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(CAN_MANAGE_NONGYNE_SPECIMEN_DISPOSAL),
):
    from app.services.pdf_service import generate_pdf_blob

    data = crud.build_disposal_checklist_data(db, batch_id)
    pdf_bytes = generate_pdf_blob(
        data, template_name="reports/nongyne_specimen_disposal_checklist.html"
    )
    filename = f"nongyne_disposal_checklist_{data['batch_no']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{batch_id}/confirm", response_model=NongyneDisposalBatchResponse)
def confirm_disposal_batch(
    batch_id: int,
    payload: NongyneDisposalBatchConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(CAN_APPROVE_SPECIMEN_DISPOSAL),
):
    batch = crud.confirm_batch_disposal(
        db,
        batch_id,
        confirmed_by_id=current_user.id,
        disposal_method=payload.disposal_method,
        remark=payload.remark,
    )
    return _serialize(batch)


@router.post("/{batch_id}/cancel", response_model=NongyneDisposalBatchResponse)
def cancel_disposal_batch(
    batch_id: int,
    payload: NongyneDisposalBatchCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(CAN_APPROVE_SPECIMEN_DISPOSAL),
):
    batch = crud.cancel_batch(
        db, batch_id, user_id=current_user.id, reason=payload.reason
    )
    return _serialize(batch)
