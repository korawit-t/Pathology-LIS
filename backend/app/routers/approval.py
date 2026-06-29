from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db

from app.models.user import User
from app.models.surgical_report import ReportApprovalLog
from app.schemas.report_approval import ReportApproveRequest, ApprovalLogResponse
from app.schemas.surgical_report import SurgicalReportResponse

# นำเข้าเครื่องมือจัดการสิทธิ์
from app.models.gyne_cyto_report import GyneCytoReport
from app.schemas.gyne_cyto_report import GyneCytoReportResponse
from app.schemas.nongyne_cyto_report import NongyneCytoReportResponse, NongyneCytoReportPagination
from app.crud import report_crud, gyne_report_crud, nongyne_cyto_report as nongyne_report_crud
from app.dependencies.auth import get_current_user, check_password_status
from app.core.roles import CAN_APPROVE, CAN_APPROVE_GYNE_CYTO, CAN_APPROVE_NONGYNE_CYTO


router = APIRouter(
    prefix="/approvals",
    tags=["Report Approvals"],
    dependencies=[Depends(check_password_status)],  # 🔒 เพิ่มตรงนี้
)


@router.post(
    "/surgical/{report_id}",
    response_model=SurgicalReportResponse,
    status_code=status.HTTP_200_OK,
)
def process_surgical_report_decision(
    report_id: int,
    request: ReportApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_APPROVE),
):
    """
    Process approval or rejection for a surgical report.
    """
    updated_report = report_crud.process_report_approval(
        db=db, report_id=report_id, current_user=current_user, req=request
    )

    if not updated_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not in a state that can be updated.",
        )

    return updated_report


@router.post(
    "/gyne/{report_id}",
    response_model=GyneCytoReportResponse,
    status_code=status.HTTP_200_OK,
)
def process_gyne_report_decision(
    report_id: int,
    request: ReportApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_APPROVE_GYNE_CYTO),
):
    """
    Process approval or rejection for a Gyne report.
    """
    updated_report = gyne_report_crud.process_gyne_report_approval(
        db=db, report_id=report_id, current_user=current_user, req=request
    )

    if not updated_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not in a state that can be updated.",
        )

    return updated_report


@router.post(
    "/nongyne/{report_id}",
    response_model=NongyneCytoReportResponse,
    status_code=status.HTTP_200_OK,
)
def process_nongyne_report_decision(
    report_id: int,
    request: ReportApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_APPROVE_NONGYNE_CYTO),
):
    updated_report = nongyne_report_crud.process_nongyne_report_approval(
        db=db, report_id=report_id, current_user=current_user, req=request
    )

    if not updated_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not in a state that can be updated.",
        )

    return updated_report


@router.get("/nongyne/pending", response_model=NongyneCytoReportPagination)
def get_pending_nongyne_reports(
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_APPROVE_NONGYNE_CYTO),
):
    return nongyne_report_crud.get_pending_nongyne_reports(db=db, skip=skip, limit=limit, search=search)


# ─── Co-sign endpoints (Fix #5): record signature without publishing ──────────

@router.post("/surgical/{report_id}/cosign", response_model=SurgicalReportResponse)
def cosign_surgical_report(
    report_id: int,
    request: ReportApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return report_crud.process_cosign(db=db, report_id=report_id, current_user=current_user, req=request)


@router.post("/gyne/{report_id}/cosign", response_model=GyneCytoReportResponse)
def cosign_gyne_report(
    report_id: int,
    request: ReportApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return gyne_report_crud.process_gyne_cosign(db=db, report_id=report_id, current_user=current_user, req=request)


@router.post("/nongyne/{report_id}/cosign", response_model=NongyneCytoReportResponse)
def cosign_nongyne_report(
    report_id: int,
    request: ReportApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return nongyne_report_crud.process_nongyne_cosign(db=db, report_id=report_id, current_user=current_user, req=request)


# ─── Add-signer endpoints (Fix #4): add co-signer after publish ───────────────

class AddSignerRequest(BaseModel):
    user_id: int
    role: str = "co-signer"
    consult_note: Optional[str] = None


@router.post("/surgical/{report_id}/add-signer", response_model=SurgicalReportResponse)
def add_surgical_signer(
    report_id: int,
    body: AddSignerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return report_crud.add_signer_to_report(
        db=db, report_id=report_id,
        user_id=body.user_id, role=body.role, consult_note=body.consult_note,
        current_user=current_user,
    )


@router.post("/gyne/{report_id}/add-signer", response_model=GyneCytoReportResponse)
def add_gyne_signer(
    report_id: int,
    body: AddSignerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return gyne_report_crud.add_gyne_signer(
        db=db, report_id=report_id,
        user_id=body.user_id, role=body.role, consult_note=body.consult_note,
        current_user=current_user,
    )


@router.post("/nongyne/{report_id}/add-signer", response_model=NongyneCytoReportResponse)
def add_nongyne_signer(
    report_id: int,
    body: AddSignerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return nongyne_report_crud.add_nongyne_signer(
        db=db, report_id=report_id,
        user_id=body.user_id, role=body.role, consult_note=body.consult_note,
        current_user=current_user,
    )


@router.get("/{report_id}/logs", response_model=List[ApprovalLogResponse])
def get_approval_history(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all audit logs (Approved, Rejected, Request Changes) for this report.
    """
    logs = (
        db.query(ReportApprovalLog)
        .filter(ReportApprovalLog.report_id == report_id)
        .order_by(ReportApprovalLog.created_at.desc())
        .all()
    )

    if not logs:
        # หากไม่มี Log เลย อาจแปลว่า ID ผิด หรือยังไม่เคยมีการดำเนินการใดๆ
        # สามารถเลือกจะคืน [] หรือ 404 ก็ได้ (ในที่นี้เลือกคืนตามผล Query)
        return []

    return logs
