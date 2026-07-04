from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.models.surgical_diagnosis import (
    SurgicalDiagnosis,
    DiagnosisLevel,
)
from app.schemas.surgical_diagnosis import (
    SurgicalDiagnosisCreate,
    SurgicalDiagnosisUpdate,
)
from app.schemas.surgical_bulk import BulkSaveDraft
from app.models import SurgicalDiagnosis, SurgicalSpecimen, SurgicalCase
from app.models.surgical_report import SurgicalReport, ReportSigner, ReportStatus
from app.models.user import User

from datetime import datetime
from app.utils.time import local_now
from app.utils.consult_lock import assert_consult_not_locked
from fastapi import HTTPException


def get_global_max_diagnosis(db: Session, case_id: int):
    """หาบันทึกที่มี Order สูงสุดของเคสนี้ โดยไม่สนใจ Level"""
    return (
        db.query(SurgicalDiagnosis)
        .filter(SurgicalDiagnosis.case_id == case_id)
        .order_by(SurgicalDiagnosis.diagnosis_order.desc())
        .first()
    )


def get_diagnosis(db: Session, diagnosis_id: int):
    return (
        db.query(SurgicalDiagnosis)
        .options(joinedload(SurgicalDiagnosis.specimen))
        .filter(SurgicalDiagnosis.id == diagnosis_id)
        .first()
    )


def get_diagnoses_by_patient(db: Session, patient_id: int):
    return (
        db.query(SurgicalDiagnosis)
        .join(SurgicalSpecimen)
        .join(SurgicalCase)
        .filter(SurgicalCase.patient_id == patient_id)
        .options(joinedload(SurgicalDiagnosis.specimen))
        .order_by(SurgicalDiagnosis.created_at.desc())
        .all()
    )


def get_latest_diagnosis(
    db: Session,
    case_id: int,
    specimen_id: int = None,
    level: DiagnosisLevel = DiagnosisLevel.SPECIMEN,
):
    """
    ค้นหาบันทึกการวินิจฉัยล่าสุด (ล่าสุดตามลำดับ Order) โดยแยกตามระดับความสำคัญ
    - SPECIMEN: ค้นหาอันล่าสุดของชิ้นเนื้อเจาะจงรายชิ้น
    - CASE: ค้นหาอันล่าสุดที่เป็นภาพรวมของทั้งเคส
    """
    query = db.query(SurgicalDiagnosis).filter(SurgicalDiagnosis.case_id == case_id)

    # ตรวจสอบ level รองรับทั้ง Enum และ String เพื่อความยืดหยุ่นในการเปรียบเทียบ
    current_level = level.value if hasattr(level, "value") else level

    if current_level == "SPECIMEN":
        query = query.filter(
            SurgicalDiagnosis.diagnosis_level == DiagnosisLevel.SPECIMEN,
            SurgicalDiagnosis.surgical_specimen_id == specimen_id,
        )
    else:
        query = query.filter(SurgicalDiagnosis.diagnosis_level == DiagnosisLevel.CASE)

    # ดึงข้อมูลตัวที่ Order สูงที่สุดตัวแรก
    return query.order_by(SurgicalDiagnosis.diagnosis_order.desc()).first()


def list_diagnoses_by_specimen(db: Session, specimen_id: int):
    return (
        db.query(SurgicalDiagnosis)
        .options(joinedload(SurgicalDiagnosis.specimen))
        .filter(SurgicalDiagnosis.surgical_specimen_id == specimen_id)
        .order_by(SurgicalDiagnosis.diagnosis_order.asc())
        .all()
    )


def list_diagnoses_by_case(db: Session, case_id: int):
    return (
        db.query(SurgicalDiagnosis)
        .options(joinedload(SurgicalDiagnosis.specimen))
        .filter(SurgicalDiagnosis.case_id == case_id)
        .order_by(
            SurgicalDiagnosis.diagnosis_level.asc(),
            SurgicalDiagnosis.diagnosis_order.asc(),
        )
        .all()
    )


def create_diagnosis(db: Session, diag_in: SurgicalDiagnosisCreate):
    # 1. หาข้อมูลล่าสุดเพื่อใช้ตัดสินใจ
    global_latest = get_global_max_diagnosis(db, diag_in.case_id)
    latest_same_level = get_latest_diagnosis(
        db,
        case_id=diag_in.case_id,
        specimen_id=diag_in.surgical_specimen_id,
        level=diag_in.diagnosis_level,
    )

    # 2. กำหนด Target Order (จัดลำดับความสำคัญ: จาก Input > จาก Draft เดิม > เริ่มใหม่)
    if diag_in.diagnosis_order:
        target_order = diag_in.diagnosis_order
    elif global_latest and global_latest.status == "draft":
        target_order = global_latest.diagnosis_order
    else:
        target_order = (global_latest.diagnosis_order + 1) if global_latest else 1

    # 3. [UPSERT LOGIC] ถ้ามี Draft ใน Order เดียวกัน ให้ Update
    if (
        latest_same_level
        and latest_same_level.status == "draft"
        and latest_same_level.diagnosis_order == target_order
    ):
        update_data = diag_in.model_dump(exclude_unset=True)
        return update_diagnosis(
            db, latest_same_level.id, SurgicalDiagnosisUpdate(**update_data)
        )

    # 4. [INSERT LOGIC] ถ้าไม่มี ให้สร้างใหม่
    # เตรียมข้อมูล (ลบฟิลด์ที่ไม่เกี่ยวกับ Model ออก)
    diag_data = diag_in.model_dump(
        exclude={
            "pathologists",
            "previous_version_id",
            "diagnosis_order",
            "entry_type",
            "diagnosis_mode",
        }
    )

    # จัดการความสะอาดของข้อมูลตาม Level
    if diag_in.diagnosis_level == DiagnosisLevel.CASE:
        diag_data["surgical_specimen_id"] = None
    else:
        diag_data["linked_specimen_ids"] = None

    # กำหนด metadata
    prev_id = latest_same_level.id if latest_same_level else None
    calculated_type = diag_in.entry_type or (
        "Original" if target_order == 1 else "Addendum"
    )

    db_diag = SurgicalDiagnosis(
        **diag_data,
        diagnosis_order=target_order,  # ใช้ค่าที่คำนวณไว้ข้างบน
        previous_version_id=prev_id,
        entry_type=calculated_type,
    )

    if db_diag.status == "signed":
        db_diag.diagnosis_at = local_now()

    db.add(db_diag)
    db.flush()
    db.refresh(db_diag)
    return db_diag


def update_diagnosis(
    db: Session, diagnosis_id: int, diag_update: SurgicalDiagnosisUpdate
):
    db_diag = (
        db.query(SurgicalDiagnosis).filter(SurgicalDiagnosis.id == diagnosis_id).first()
    )
    if not db_diag:
        return None

    if db_diag.status == "signed":
        raise HTTPException(
            status_code=400, detail="Signed diagnosis cannot be edited."
        )

    update_data = diag_update.model_dump(
        exclude={
            "diagnosis_order",
            "previous_version_id",
            "pathologists",
        },  # 🚩 ตัด pathologists ออก
        exclude_unset=True,
    )

    # จัดการ Level Cleanup
    current_level = update_data.get("diagnosis_level") or db_diag.diagnosis_level
    if current_level == DiagnosisLevel.CASE:
        update_data["surgical_specimen_id"] = None
    elif current_level == DiagnosisLevel.SPECIMEN:
        update_data["linked_specimen_ids"] = None

    validate_sign_off(db_diag, update_data)

    if update_data.get("status") == "signed":
        update_data["diagnosis_at"] = local_now()

    for field, value in update_data.items():
        setattr(db_diag, field, value)

    db.commit()
    db.refresh(db_diag)
    return db_diag


def validate_sign_off(diagnosis: SurgicalDiagnosis, update_data: dict):
    is_signing = update_data.get("status") == "signed"

    # 🚩 ตรวจสอบว่าเป็นฉบับแก้ไข (Revised) หรือไม่
    # เช็คจาก entry_type ในข้อมูลที่ส่งมาใหม่ หรือข้อมูลเดิมใน DB
    entry_type = update_data.get("entry_type") or diagnosis.entry_type
    is_revised = entry_type == "Revised"

    # 🚩 บังคับใส่เหตุผล "เฉพาะกรณีที่เป็นฉบับแก้ไข (Revised)" เท่านั้น
    if is_signing and is_revised:
        reason = update_data.get("revision_reason") or diagnosis.revision_reason
        if not reason:
            raise HTTPException(
                status_code=400,
                detail="กรุณาระบุเหตุผลการแก้ไข (Revision Reason) ก่อนลงนามฉบับแก้ไข",
            )


def bulk_save_draft_orchestrator(db: Session, data: BulkSaveDraft):
    try:
        # --- 1. Update Case Info & Specimen Gross ---
        surgical_case = (
            db.query(SurgicalCase).filter(SurgicalCase.id == data.case_id).first()
        )
        if not surgical_case:
            raise HTTPException(status_code=404, detail="Case not found")

        # Out-lab consult guard: once slides are dispatched, block new diagnosis creation.
        # - No PDF yet → hard block (423), nothing saved.
        # - PDF uploaded → allow case-metadata save only, skip diagnosis bump & creation.
        if surgical_case.is_out_lab_consult and surgical_case.consult_status == "processing":
            assert_consult_not_locked(surgical_case)
            # PDF uploaded: save case metadata then return — no new addendum created.
            surgical_case.diagnosis_mode = data.diagnosis_mode
            surgical_case.clinical_diagnosis = data.clinical_diagnosis
            surgical_case.has_malignancy = data.has_malignancy
            surgical_case.has_critical = data.has_critical
            surgical_case.is_pending = data.is_pending
            surgical_case.pending_reason = data.pending_reason if data.is_pending else None
            db.flush()
            max_order = (
                db.query(func.max(SurgicalDiagnosis.diagnosis_order))
                .filter(SurgicalDiagnosis.case_id == data.case_id)
                .scalar()
            )
            db.commit()
            return {"order": max_order or 1}

        surgical_case.diagnosis_mode = data.diagnosis_mode
        surgical_case.clinical_diagnosis = data.clinical_diagnosis
        surgical_case.has_malignancy = data.has_malignancy
        surgical_case.has_critical = data.has_critical
        surgical_case.is_pending = data.is_pending
        surgical_case.pending_reason = data.pending_reason if data.is_pending else None
        if data.is_out_lab_consult is not None:
            surgical_case.is_out_lab_consult = data.is_out_lab_consult
            if data.is_out_lab_consult and surgical_case.consult_status is None:
                surgical_case.consult_status = "pending"
        if data.consult_reason is not None:
            surgical_case.consult_reason = data.consult_reason
        elif data.is_out_lab_consult is False:
            surgical_case.consult_reason = None
        if data.consult_report_out_at is not None:
            surgical_case.consult_report_out_at = data.consult_report_out_at

        if data.gross_descriptions:
            for spec_id, gross_text in data.gross_descriptions.items():
                db.query(SurgicalSpecimen).filter(
                    SurgicalSpecimen.id == int(spec_id)
                ).update({"gross_description": gross_text})

        db.flush()

        # --- 2. Auto-detect & Increment Order Logic ---
        max_diag = (
            db.query(
                func.max(SurgicalDiagnosis.diagnosis_order),
                func.max(SurgicalDiagnosis.status),
            )
            .filter(SurgicalDiagnosis.case_id == data.case_id)
            .first()
        )

        max_order = max_diag[0] or 1
        last_signed_diag = (
            db.query(SurgicalDiagnosis)
            .filter(
                SurgicalDiagnosis.case_id == data.case_id,
                SurgicalDiagnosis.diagnosis_order == max_order,
                SurgicalDiagnosis.status == "signed",
            )
            .first()
        )

        current_order = max_order + 1 if last_signed_diag else max_order

        # --- 3. Cleanup Drafts ของ Order นี้ (ทำเล่มใหม่ต้องล้างไส้ในเก่า) ---
        db.query(SurgicalDiagnosis).filter(
            SurgicalDiagnosis.case_id == data.case_id,
            SurgicalDiagnosis.status == "draft",
            SurgicalDiagnosis.diagnosis_order == current_order,
        ).delete(synchronize_session=False)

        # พิเศษ: ถ้าสลับมา Individual ให้ล้าง Case level ของทุก Order ที่ยังเป็น Draft
        if data.diagnosis_mode == "individual":
            db.query(SurgicalDiagnosis).filter(
                SurgicalDiagnosis.case_id == data.case_id,
                SurgicalDiagnosis.status == "draft",
                SurgicalDiagnosis.diagnosis_level == "CASE",
            ).delete(synchronize_session=False)

        # --- 4. บันทึก Diagnosis (Logic ตามโค้ดเก่าที่คุณคุ้นเคย แต่ใส่ Order เพิ่ม) ---
        if data.diagnosis_mode in ["integrated", "clean"]:
            # สร้าง CASE level
            create_diagnosis(
                db,
                SurgicalDiagnosisCreate(
                    case_id=data.case_id,
                    diagnosis_level="CASE",
                    linked_specimen_ids=[s.id for s in surgical_case.specimens],
                    diagnosis=data.case_diagnosis_text or None,
                    status="draft",
                    diagnosis_order=current_order,
                ),
            )
            # เก็บ Micro รายชิ้น
            for spec_id, diag_data in data.diagnoses.items():
                create_diagnosis(
                    db,
                    SurgicalDiagnosisCreate(
                        case_id=data.case_id,
                        diagnosis_level="SPECIMEN",
                        surgical_specimen_id=int(spec_id),
                        microscopic_description=diag_data.microscopic_description
                        or None,
                        status="draft",
                        diagnosis_order=current_order,
                    ),
                )
        else:
            # Individual Mode
            for spec_id, diag_data in data.diagnoses.items():
                create_diagnosis(
                    db,
                    SurgicalDiagnosisCreate(
                        case_id=data.case_id,
                        surgical_specimen_id=int(spec_id),
                        diagnosis_level="SPECIMEN",
                        diagnosis=diag_data.diagnosis or None,
                        microscopic_description=diag_data.microscopic_description
                        or None,
                        status="draft",
                        diagnosis_order=current_order,
                    ),
                )

        db.flush()

        # --- 5. สร้าง Report Snapshot (ก้อนเดิมที่ทำงานได้ดี) ---
        from app.crud.surgical_report_builder import prepare_report_data

        full_report_data = prepare_report_data(db, data.case_id)

        report = (
            db.query(SurgicalReport)
            .filter(
                SurgicalReport.case_id == data.case_id,
                SurgicalReport.status == ReportStatus.DRAFT,
            )
            .first()
        )

        allowed_keys = {c.name for c in SurgicalReport.__table__.columns}
        safe_data = {k: v for k, v in full_report_data.items() if k in allowed_keys}

        if not report:
            report = SurgicalReport(**safe_data)
            report.status = ReportStatus.DRAFT
            db.add(report)
        else:
            for key, value in safe_data.items():
                if key not in ["id", "status", "created_at"]:
                    setattr(report, key, value)

        db.flush()

        # --- 6. จัดการ Signatories ---
        current_signers = (
            db.query(ReportSigner)
            .filter(
                ReportSigner.report_id == report.id,
                ReportSigner.diagnosis_order == current_order,
            )
            .all()
        )

        signer_map = {s.user_id: s for s in current_signers}
        common_pathologists = data.pathologists or []
        incoming_signers_list = []

        for p in common_pathologists:
            u_id = p["user_id"] if isinstance(p, dict) else p.user_id
            u_role = p["role"] if isinstance(p, dict) else p.role
            incoming_signers_list.append({"user_id": u_id, "role": u_role})

        incoming_user_ids = {s["user_id"] for s in incoming_signers_list}

        for u_id, s_obj in signer_map.items():
            if u_id not in incoming_user_ids and s_obj.signed_at is None:
                db.delete(s_obj)

        pathologist_names = []
        for p_data in incoming_signers_list:
            u_id = p_data["user_id"]
            u_role = p_data["role"]

            if u_id in signer_map:
                existing_signer = signer_map[u_id]
                if existing_signer.signed_at is None:
                    existing_signer.role = u_role
            else:
                new_signer = ReportSigner(
                    report_id=report.id,
                    user_id=u_id,
                    diagnosis_order=current_order,
                    role=u_role,
                    assigned_at=local_now(),
                )
                db.add(new_signer)

            signer_user = db.query(User).filter(User.id == u_id).first()
            if signer_user:
                pathologist_names.append(signer_user.full_name)

        if pathologist_names:
            report.pathologist_name = ", ".join(list(dict.fromkeys(pathologist_names)))

        db.commit()
        return {
            "status": "success",
            "message": f"Draft saved for order {current_order}",
            "report_id": report.id,
        }

    except Exception as e:
        db.rollback()
        raise e


def delete_diagnosis(db: Session, diagnosis_id: int):
    db_diag = (
        db.query(SurgicalDiagnosis).filter(SurgicalDiagnosis.id == diagnosis_id).first()
    )
    if not db_diag:
        raise HTTPException(status_code=404, detail="Diagnosis not found.")
    if db_diag.status == "signed":
        raise HTTPException(status_code=400, detail="Cannot delete a signed diagnosis.")
    db.delete(db_diag)
    db.commit()
