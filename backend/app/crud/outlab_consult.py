from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status
from datetime import datetime
from app.utils.time import local_now

from app.models.outlab_consult import OutlabConsultRun, OutlabConsultRunDetail
from app.schemas.outlab_consult import OutlabConsultRunCreate

def _get_next_consult_run_no(db: Session) -> str:
    current_year_short = local_now().strftime("%y")
    prefix = f"CONS{current_year_short}-"

    last_run = (
        db.query(OutlabConsultRun.run_no)
        .filter(OutlabConsultRun.run_no.like(f"{prefix}%"))
        .order_by(OutlabConsultRun.run_no.desc())
        .with_for_update()
        .first()
    )

    if last_run:
        last_no = last_run[0]
        try:
            new_run_number = int(last_no.split("-")[1]) + 1
        except (IndexError, ValueError):
            new_run_number = 1
    else:
        new_run_number = 1

    return f"{prefix}{new_run_number:05d}"
    
def create_consult_run(db: Session, obj_in: OutlabConsultRunCreate, operator_id: int):
    try:
        run_no = _get_next_consult_run_no(db)
        
        db_run = OutlabConsultRun(
            run_no=run_no,
            destination_lab=obj_in.destination_lab,
            operator_id=operator_id,
            status="sent"
        )
        db.add(db_run)
        db.flush()
        
        for item in obj_in.cases:
            report_out_at = None
            if item.case_type == "surgical":
                from app.models.surgical_case import SurgicalCase
                sc = db.query(SurgicalCase.consult_report_out_at).filter(SurgicalCase.id == item.case_id).first()
                report_out_at = sc.consult_report_out_at if sc else None
            elif item.case_type == "nongyne":
                from app.models.nongyne_cyto_case import NongyneCytologyCase
                nc = db.query(NongyneCytologyCase.consult_report_out_at).filter(NongyneCytologyCase.id == item.case_id).first()
                report_out_at = nc.consult_report_out_at if nc else None
            elif item.case_type == "gyne":
                from app.models.gyne_cyto_case import GyneCytologyCase
                gc = db.query(GyneCytologyCase.consult_report_out_at).filter(GyneCytologyCase.id == item.case_id).first()
                report_out_at = gc.consult_report_out_at if gc else None

            detail = OutlabConsultRunDetail(
                run_id=db_run.id,
                case_type=item.case_type,
                case_id=item.case_id,
                accession_no=item.accession_no,
                patient_name=item.patient_name,
                block_code=item.block_code,
                report_out_at=report_out_at,
            )
            db.add(detail)

            # Update the original case
            if item.case_type == "surgical":
                from app.models.surgical_case import SurgicalCase
                db.query(SurgicalCase).filter(SurgicalCase.id == item.case_id).update({"consult_status": "processing"})
                from app.models.surgical_specimen import SurgicalSpecimen
                from app.models.surgical_block import SurgicalBlock
                spec_ids = db.query(SurgicalSpecimen.id).filter(
                    SurgicalSpecimen.case_id == item.case_id
                ).subquery()
                db.query(SurgicalBlock).filter(
                    SurgicalBlock.specimen_id.in_(spec_ids)
                ).update({"status": "consult"}, synchronize_session=False)
            elif item.case_type == "gyne":
                from app.models.gyne_cyto_case import GyneCytologyCase
                db.query(GyneCytologyCase).filter(GyneCytologyCase.id == item.case_id).update({"consult_status": "processing"})
            elif item.case_type == "nongyne":
                from app.models.nongyne_cyto_case import NongyneCytologyCase
                db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == item.case_id).update({"consult_status": "processing"})
            
        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e

def get_consult_runs(db: Session, skip: int = 0, limit: int = 50):
    runs = (
        db.query(OutlabConsultRun)
        .options(selectinload(OutlabConsultRun.details))
        .order_by(OutlabConsultRun.id.desc())
        .offset(skip).limit(limit).all()
    )
    _attach_live_case_consult_status(db, runs)
    return runs


def _attach_live_case_consult_status(db: Session, runs: list["OutlabConsultRun"]):
    """Attach each detail's underlying case's live consult_status (not a stored
    column) so the UI can show this specific case's own progress instead of
    the shipment run's overall status — a run can bundle multiple cases, and
    one case finishing doesn't mean the whole shipment came back."""
    ids_by_type: dict[str, set[int]] = {"surgical": set(), "gyne": set(), "nongyne": set()}
    for run in runs:
        for detail in run.details:
            if detail.case_type in ids_by_type:
                ids_by_type[detail.case_type].add(detail.case_id)

    status_by_type: dict[str, dict[int, str]] = {}
    if ids_by_type["surgical"]:
        from app.models.surgical_case import SurgicalCase
        rows = db.query(SurgicalCase.id, SurgicalCase.consult_status).filter(
            SurgicalCase.id.in_(ids_by_type["surgical"])
        ).all()
        status_by_type["surgical"] = {r.id: r.consult_status for r in rows}
    if ids_by_type["gyne"]:
        from app.models.gyne_cyto_case import GyneCytologyCase
        rows = db.query(GyneCytologyCase.id, GyneCytologyCase.consult_status).filter(
            GyneCytologyCase.id.in_(ids_by_type["gyne"])
        ).all()
        status_by_type["gyne"] = {r.id: r.consult_status for r in rows}
    if ids_by_type["nongyne"]:
        from app.models.nongyne_cyto_case import NongyneCytologyCase
        rows = db.query(NongyneCytologyCase.id, NongyneCytologyCase.consult_status).filter(
            NongyneCytologyCase.id.in_(ids_by_type["nongyne"])
        ).all()
        status_by_type["nongyne"] = {r.id: r.consult_status for r in rows}

    for run in runs:
        for detail in run.details:
            detail.case_consult_status = status_by_type.get(detail.case_type, {}).get(detail.case_id)

def receive_consult_run(db: Session, run_id: int, user_id: int):
    db_run = db.query(OutlabConsultRun).filter(OutlabConsultRun.id == run_id).first()
    if not db_run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    try:
        db_run.status = "received"
        db_run.received_at = local_now()
        db_run.received_by_id = user_id
        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e


def return_consult_block(db: Session, detail_id: int, user_id: int):
    detail = db.query(OutlabConsultRunDetail).filter(OutlabConsultRunDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detail not found")
    try:
        detail.block_returned = True
        detail.block_returned_at = local_now()
        detail.block_returned_by_id = user_id
        db.commit()
        db.refresh(detail)
        return detail
    except Exception as e:
        db.rollback()
        raise e


def update_consult_run_tracking(db: Session, run_id: int, tracking_number):
    db_run = db.query(OutlabConsultRun).options(selectinload(OutlabConsultRun.details)).filter(OutlabConsultRun.id == run_id).first()
    if not db_run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    try:
        db_run.tracking_number = tracking_number
        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e


def delete_consult_run(db: Session, run_id: int):
    db_run = db.query(OutlabConsultRun).options(selectinload(OutlabConsultRun.details)).filter(OutlabConsultRun.id == run_id).first()
    if not db_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
        )
    
    try:
        # Revert cases before deleting
        for detail in db_run.details:
            if detail.case_type == "surgical":
                from app.models.surgical_case import SurgicalCase
                db.query(SurgicalCase).filter(SurgicalCase.id == detail.case_id).update({"consult_status": "pending"})
            elif detail.case_type == "gyne":
                from app.models.gyne_cyto_case import GyneCytologyCase
                db.query(GyneCytologyCase).filter(GyneCytologyCase.id == detail.case_id).update({"consult_status": "pending"})
            elif detail.case_type == "nongyne":
                from app.models.nongyne_cyto_case import NongyneCytologyCase
                db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == detail.case_id).update({"consult_status": "pending"})

        db.delete(db_run)
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
