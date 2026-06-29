from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime

from app.db.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/audit-logs", tags=["Audit"])


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(AuditLog).options(joinedload(AuditLog.user))

    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if resource_id is not None:
        q = q.filter(AuditLog.resource_id == resource_id)
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)

    total = q.count()
    items = q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": items}
