from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from app.models.surgical_block_stain import (
    SurgicalBlockStain,
    SurgicalStainRun,
    SurgicalStainRunDetail,
    SurgicalBlockStain,
)
from app.schemas.surgical_block_stain import StainCreate, StainUpdate
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase
from app.models.patient import Patient
from app.models.anatomical_pathology_test import AnatomicalPathologyTest

from app.models.surgical_block_stain import (
    SurgicalOutlabRun,
    SurgicalOutlabRunDetail,
)
from app.utils.time import local_now
from app.schemas.surgical_block_stain import OutlabRunCreate

_TERMINAL_STATUSES = {"signed out", "cancelled", "addendum signed"}


def _update_case_status_from_block_stains(db: Session, case_id: int) -> None:
    """Re-derive case status from remaining pending non-HE block stains."""
    case = db.get(SurgicalCase, case_id)
    if not case or case.status in _TERMINAL_STATUSES:
        return

    rows = (
        db.query(AnatomicalPathologyTest.category)
        .join(SurgicalBlockStain, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
        .join(SurgicalBlock, SurgicalBlock.id == SurgicalBlockStain.block_id)
        .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalBlock.specimen_id)
        .filter(
            SurgicalSpecimen.case_id == case_id,
            SurgicalBlockStain.status == "pending",
        )
        .all()
    )
    categories = {r.category for r in rows}
    if "IHC" in categories:
        case.status = "pending immuno"
    elif "Histochem" in categories:
        case.status = "pending special stains"
    elif case.status in ("pending immuno", "pending special stains"):
        # No pending IHC/Histochem stains remain — clear the flag. Without
        # this, deleting the last one left the case stuck showing a pending
        # state forever (this function otherwise only ever sets the flag,
        # never clears it).
        case.status = "stained"


def create_stain(db: Session, obj_in: StainCreate, registrar_id: int | None = None):
    """
    สร้างรายการย้อมใหม่ (สามารถระบุเลข slide_no เองหรือให้ระบบรันต่อก็ได้)
    """
    db_obj = SurgicalBlockStain(**obj_in.model_dump(exclude={"assist_pathologist_id"}))
    db.add(db_obj)
    db.flush()

    # Update case status when a pending IHC or special stain is ordered at block level
    if obj_in.test_id and not obj_in.is_recut:
        ap_test = db.get(AnatomicalPathologyTest, obj_in.test_id)
        if ap_test and ap_test.category in ("IHC", "Histochem"):
            block = db.get(SurgicalBlock, obj_in.block_id)
            if block and block.specimen_id:
                specimen = db.get(SurgicalSpecimen, block.specimen_id)
                if specimen:
                    case = db.get(SurgicalCase, specimen.case_id)
                    if case and case.status not in _TERMINAL_STATUSES:
                        if ap_test.category == "IHC":
                            case.status = "pending immuno"
                        elif ap_test.category == "Histochem" and case.status != "pending immuno":
                            case.status = "pending special stains"

        # Ordering a Molecular-category test spawns its own M26- case, with this
        # Surgical case as parent — see app/his_export/README.md-style feature docs
        # in the plan; registrar_id is required since the case needs a creator.
        if ap_test and ap_test.category == "Molecular" and registrar_id is not None:
            from app.crud.molecular_case import create_molecular_case_from_stain

            create_molecular_case_from_stain(
                db,
                stain=db_obj,
                ap_test=ap_test,
                registrar_id=registrar_id,
                assist_pathologist_id=obj_in.assist_pathologist_id,
            )

    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_stains_by_block(db: Session, block_id: int):
    """
    ดึงรายการย้อมทั้งหมดของตลับนั้นๆ
    """
    return (
        db.query(SurgicalBlockStain)
        .filter(SurgicalBlockStain.block_id == block_id)
        .all()
    )


def update_stain_status(db: Session, stain_id: int, status: str):
    """
    อัปเดตสถานะ เช่น จาก 'pending' เป็น 'stained'
    """
    db_obj = db.query(SurgicalBlockStain).get(stain_id)
    if db_obj:
        db_obj.status = status
        db.commit()
        db.refresh(db_obj)
    return db_obj


def update_stain(db: Session, stain_id: int, obj_in: StainUpdate, user_id: int | None = None):
    db_obj = db.query(SurgicalBlockStain).filter(SurgicalBlockStain.id == stain_id).first()
    if not db_obj:
        return None
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    if update_data.get("status") == "stained" and user_id:
        db_obj.stained_by_id = user_id
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_unprinted_stains(db: Session):
    """
    ดึงรายการแผ่นสไลด์ทั้งหมดที่ยังไม่ได้พิมพ์ (สำหรับหน้า Label Manager)
    """
    return (
        db.query(SurgicalBlockStain)
        .filter(SurgicalBlockStain.is_printed == False)
        .all()
    )


def delete_stain(db: Session, stain_id: int, actor_id: int | None = None) -> bool:
    """
    ลบรายการย้อมสไลด์ (Stain) ตาม ID
    """
    db_obj = (
        db.query(SurgicalBlockStain).filter(SurgicalBlockStain.id == stain_id).first()
    )
    if not db_obj:
        return False

    # If this stain had auto-spawned a Molecular case that's already been
    # reported (a signed-off clinical result), block the delete outright —
    # cancelling that side-effect-of-a-different-action is too destructive.
    # The user must explicitly cancel the Molecular case itself first.
    from app.crud.molecular_case import (
        cancel_or_delete_molecular_case_for_stain,
        get_reported_molecular_case_for_stain,
    )
    blocking_case = get_reported_molecular_case_for_stain(db, stain_id)
    if blocking_case:
        raise ValueError(
            f"Cannot delete: linked Molecular case {blocking_case.accession_no} has "
            "already been reported. Cancel that case explicitly first."
        )

    try:
        block = db.get(SurgicalBlock, db_obj.block_id)
        case_id = None
        if block and block.specimen_id:
            specimen = db.get(SurgicalSpecimen, block.specimen_id)
            if specimen:
                case_id = specimen.case_id

        # If this stain had auto-spawned a Molecular case (category=Molecular
        # order — see create_stain above), resolve it before the stain itself
        # is gone: hard-delete if untouched, otherwise soft-cancel to keep
        # the accession/audit trail. Must run before db.delete(db_obj) since
        # MolecularCase.stain_id is ON DELETE SET NULL — the lookup below
        # would no longer find it once the stain row is actually removed.
        cancel_or_delete_molecular_case_for_stain(db, stain_id=stain_id, actor_id=actor_id)

        db.delete(db_obj)
        db.flush()

        if case_id:
            _update_case_status_from_block_stains(db, case_id)

        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e


def get_stains(db: Session, skip: int = 0, limit: int = 100, status: str = None, is_external: bool = None, category: str = None):
    query = (
        db.query(SurgicalBlockStain)
        .options(
            joinedload(SurgicalBlockStain.test),
            joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case),
        )
    )
    if status:
        query = query.filter(SurgicalBlockStain.status == status)
    if is_external is not None or category is not None:
        query = query.join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
        if is_external is not None:
            query = query.filter(AnatomicalPathologyTest.is_external == is_external)
        if category is not None:
            query = query.filter(AnatomicalPathologyTest.category == category)
    return query.offset(skip).limit(limit).all()


# แถม: ฟังก์ชันสำหรับ Filter เฉพาะตัวที่ยังไม่ได้ย้อม (เพื่อเอาไปแสดงในหน้า Create Run)
def get_pending_stains(db: Session, test_id: int = None):
    query = db.query(SurgicalBlockStain).filter(SurgicalBlockStain.status == "pending")
    if test_id:
        # กรองด้วย ID ของการทดสอบแทน String
        query = query.filter(SurgicalBlockStain.test_id == test_id)
    return query.all()


def get_stains_tree(
    db: Session, status: str = "pending", test_id: int = None
):  # 🚩 1. เปลี่ยนชื่อ param
    query = (
        db.query(SurgicalBlockStain)
        .join(SurgicalBlock)
        .join(SurgicalSpecimen)
        .join(SurgicalCase)
        # 🚩 2. โหลดความสัมพันธ์ของ 'test' (Master Data) เพิ่มเข้ามาด้วย
        .options(
            joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case),
            joinedload(
                SurgicalBlockStain.test
            ),  # ดึงข้อมูลจากตาราง AnatomicalPathologyTest
        )
        .filter(SurgicalBlockStain.status == status)
    )

    if test_id:
        query = query.filter(SurgicalBlockStain.test_id == test_id)

    items = query.order_by(
        SurgicalCase.accession_no.desc(),
        SurgicalSpecimen.specimen_label.asc(),
        SurgicalBlock.block_no.asc(),
    ).all()

    case_map = {}

    for stain in items:
        block = stain.block
        if not block or not block.specimen or not block.specimen.case:
            continue

        spec = block.specimen
        case = spec.case
        case_id = case.id

        if case_id not in case_map:
            case_map[case_id] = {
                "key": f"case-{case_id}",
                "title": case.accession_no,
                "isCase": True,
                "children": [],
            }

        # 🚩 4. ปรับการดึงชื่อสีย้อมมาแสดงผล
        # ใช้ชื่อจาก Master Data (stain.test.name)
        stain_display_name = (
            stain.test.name if stain.test else (stain.stain_name or "Unknown")
        )

        case_map[case_id]["children"].append(
            {
                "key": f"stain-{stain.id}",  # แนะนำให้ใส่ prefix เพื่อกัน key ซ้ำใน UI
                "id": stain.id,
                "block_id": block.id,
                "block_code": block.block_code,  # สำหรับใช้ใน logic สแกนบาร์โค้ดที่ Frontend
                "title": f"{block.block_code} - {stain_display_name}",
                "test_id": stain.test_id,
                "isCase": False,
            }
        )

    return list(case_map.values())


def get_additional_stains_by_case(db: Session, pathologist_id: int = None):
    """
    Returns all non-HE stain orders (IHC / Special stain) grouped by surgical case,
    with every status so pathologist can track: pending → sent (outlab) → stained → completed.
    """
    from app.models.anatomical_pathology_test import AnatomicalPathologyTest
    from app.models.ihc_result import IHCResult

    q = (
        db.query(SurgicalBlockStain)
        .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
        .join(SurgicalBlock, SurgicalBlockStain.block_id == SurgicalBlock.id)
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .join(SurgicalCase, SurgicalSpecimen.case_id == SurgicalCase.id)
        .options(
            joinedload(SurgicalBlockStain.test),
            joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case)
            .joinedload(SurgicalCase.patient),
        )
        .filter(
            or_(
                AnatomicalPathologyTest.system_code != "HE_ROUTINE",
                AnatomicalPathologyTest.system_code.is_(None),
            )
        )
    )
    if pathologist_id is not None:
        q = q.filter(SurgicalCase.pathologist_id == pathologist_id)
    items = q.order_by(SurgicalCase.accession_no.desc(), SurgicalBlock.id.asc()).all()

    specimen_ids = {
        stain.block.specimen.id
        for stain in items
        if stain.block and stain.block.specimen
    }
    interpreted_pairs: set = set()
    if specimen_ids:
        interpreted_pairs = {
            (r.surgical_specimen_id, r.ap_test_id)
            for r in db.query(IHCResult.surgical_specimen_id, IHCResult.ap_test_id)
            .filter(
                IHCResult.surgical_specimen_id.in_(specimen_ids),
                IHCResult.selected_option.isnot(None),
            )
            .all()
        }

    case_map: dict = {}
    for stain in items:
        block = stain.block
        if not block or not block.specimen or not block.specimen.case:
            continue
        case = block.specimen.case
        cid = case.id
        if cid not in case_map:
            case_map[cid] = {
                "case_id": cid,
                "accession_no": case.accession_no or "",
                "patient_name": case.patient.name if case.patient else "Unknown",
                "patient_ln": case.patient.ln if case.patient else None,
                "case_status": case.status,
                "stains": [],
                "_ihc_total": 0,
                "_ihc_done": 0,
            }
        case_map[cid]["stains"].append({
            "stain_id": stain.id,
            "block_code": block.block_code if hasattr(block, "block_code") else str(block.id),
            "test_name": stain.test.name if stain.test else "Unknown",
            "category": stain.test.category if stain.test else "-",
            "status": stain.status,
            "is_external": stain.test.is_external if stain.test else False,
        })
        if stain.test and stain.test.category == "IHC":
            case_map[cid]["_ihc_total"] += 1
            if (block.specimen.id, stain.test_id) in interpreted_pairs:
                case_map[cid]["_ihc_done"] += 1

    result = []
    for c in case_map.values():
        total = c.pop("_ihc_total")
        done = c.pop("_ihc_done")
        c["ihc_interpreted"] = None if total == 0 else (done == total)
        result.append(c)
    return result


def get_staining_runs(db: Session, skip: int = 0, limit: int = 100):
    """
    ดึงข้อมูลรอบการย้อม (Runs) และข้อมูลที่เกี่ยวข้องทั้งหมด
    เพื่อให้ @property ในระดับ Block และ Case ทำงานได้
    """
    return (
        db.query(SurgicalStainRun)
        .options(
            joinedload(SurgicalStainRun.details)
            .joinedload(SurgicalStainRunDetail.stain_order)
            .joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case),  # 🌟 หัวใจสำคัญ: โหลดให้ถึง Case
            joinedload(SurgicalStainRun.operator),
        )
        .order_by(SurgicalStainRun.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def delete_staining_run(db: Session, run_id: int) -> bool:
    # 1. ดึงข้อมูล Run พร้อมรายละเอียดสไลด์ข้างใน
    db_run = db.query(SurgicalStainRun).filter(SurgicalStainRun.id == run_id).first()

    if not db_run:
        return False

    try:
        # 2. Rollback สถานะของ Stain Orders แต่ละอันใน Run
        for detail in db_run.details:
            if detail.stain_order:
                # เปลี่ยนสถานะกลับเป็น pending เพื่อให้นำไปเข้า Run ใหม่ได้
                detail.stain_order.status = "pending"
                detail.stain_order.is_printed = False

        # 3. ลบตัว Run (Relationship details จะถูกลบตามถ้าตั้ง cascade ไว้)
        db.delete(db_run)

        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e

# --- Outlab Runs CRUD ---

def create_outlab_run(db: Session, obj_in: OutlabRunCreate, user_id: int):
    import uuid
    # สร้างรหัส run_no 
    run_no = f"OUTLAB-{uuid.uuid4().hex[:8].upper()}"

    db_run = SurgicalOutlabRun(
        run_no=run_no,
        destination_lab=obj_in.destination_lab,
        operator_id=user_id,
        status="sent",
        tracking_number=obj_in.tracking_number,
    )
    db.add(db_run)
    db.flush()  # เพื่อให้ได้ db_run.id

    for stain_id in obj_in.stain_ids:
        # อัปเดตสถานะของสไลด์ว่าส่ง outlab แล้ว
        stain_order = db.query(SurgicalBlockStain).get(stain_id)
        if stain_order:
            stain_order.status = "sent"

        detail = SurgicalOutlabRunDetail(
            outlab_run_id=db_run.id,
            stain_id=stain_id,
            is_success=True
        )
        db.add(detail)

    db.commit()
    db.refresh(db_run)
    return db_run

def get_outlab_runs(db: Session, skip: int = 0, limit: int = 100):
    runs = (
        db.query(SurgicalOutlabRun)
        .options(
            joinedload(SurgicalOutlabRun.details)
            .joinedload(SurgicalOutlabRunDetail.stain_order)
            .joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case)
            .joinedload(SurgicalCase.patient),
            joinedload(SurgicalOutlabRun.operator),
            joinedload(SurgicalOutlabRun.received_by),
        )
        .order_by(SurgicalOutlabRun.sent_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for run in runs:
        op = run.operator
        details = []
        for detail in run.details:
            stain = detail.stain_order
            accession_no = None
            block_code = None
            stain_dict = None
            hn = None
            patient_name = None
            if stain:
                block = stain.block
                if block:
                    if block.specimen:
                        block_code = f"{block.specimen.specimen_label}{block.block_no}"
                        case = block.specimen.case
                        if case:
                            accession_no = case.accession_no
                            hn = case.hn
                            if case.patient:
                                parts = [case.patient.name or "", case.patient.ln or ""]
                                patient_name = " ".join(p for p in parts if p) or None
                    else:
                        block_code = str(block.block_no)
                stain_dict = {
                    "id": stain.id,
                    "block_id": stain.block_id,
                    "test_id": stain.test_id,
                    "slide_no": stain.slide_no,
                    "status": stain.status,
                    "is_printed": stain.is_printed,
                    "printed_at": stain.printed_at,
                    "created_at": stain.created_at,
                    "accession_no": accession_no,
                    "block_code": block_code,
                    "block": None,
                    "test": {
                        "id": stain.test.id,
                        "name": stain.test.name,
                        "category": stain.test.category,
                        "price_tier_1": stain.test.price_tier_1,
                        "is_external": stain.test.is_external,
                    } if stain.test else None,
                }
            details.append({
                "id": detail.id,
                "stain_id": detail.stain_id,
                "outlab_run_id": detail.outlab_run_id,
                "is_success": detail.is_success,
                "remark": detail.remark,
                "is_hosxp_keyed": bool(detail.is_hosxp_keyed),
                "hosxp_keyed_at": detail.hosxp_keyed_at,
                "received_at": detail.received_at,
                "received_by_id": detail.received_by_id,
                "accession_no": accession_no,
                "block_code": block_code,
                "hn": hn,
                "patient_name": patient_name,
                "stain_order": stain_dict,
            })
        result.append({
            "id": run.id,
            "run_no": run.run_no,
            "destination_lab": run.destination_lab,
            "operator_id": run.operator_id,
            "sent_at": run.sent_at,
            "received_at": run.received_at,
            "received_by_id": run.received_by_id,
            "status": run.status,
            "tracking_number": run.tracking_number,
            "received_by_name": (run.received_by.full_name or run.received_by.username) if run.received_by else None,
            "details": details,
        })
    return result

def _recompute_outlab_run_status(db_run) -> None:
    """Derive run.status from each detail's received_at. Does not commit."""
    details = db_run.details
    if not details:
        return
    received_count = sum(1 for d in details if d.received_at is not None)
    if received_count == 0:
        db_run.status = "sent"
    elif received_count == len(details):
        if db_run.status != "received":
            db_run.status = "received"
            if db_run.received_at is None:
                db_run.received_at = local_now()
    else:
        db_run.status = "partial"


def _receive_outlab_run_details(db: Session, run_id: int, user_id: int, detail_ids=None):
    """
    Core logic: mark the given detail_ids (or ALL not-yet-received details
    when detail_ids is None) as received, flip their stain_order status
    sent -> stained, then recompute run.status. Idempotent: already-received
    detail_ids are skipped silently.
    """
    db_run = db.query(SurgicalOutlabRun).options(
        joinedload(SurgicalOutlabRun.details).joinedload(SurgicalOutlabRunDetail.stain_order)
    ).filter(SurgicalOutlabRun.id == run_id).first()
    if not db_run:
        return None

    try:
        target_ids = set(detail_ids) if detail_ids is not None else None
        now = local_now()
        for detail in db_run.details:
            if target_ids is not None and detail.id not in target_ids:
                continue
            if detail.received_at is not None:
                continue
            detail.received_at = now
            detail.received_by_id = user_id
            if detail.stain_order and detail.stain_order.status == "sent":
                detail.stain_order.status = "stained"

        _recompute_outlab_run_status(db_run)
        if db_run.status in ("partial", "received"):
            db_run.received_by_id = user_id

        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e


def receive_outlab_run(db: Session, run_id: int, user_id: int):
    """Receive everything not yet received in this run."""
    return _receive_outlab_run_details(db, run_id, user_id, detail_ids=None)


def receive_outlab_run_details(db: Session, run_id: int, user_id: int, detail_ids: list[int]):
    """Receive a specific subset of details in this run."""
    if not detail_ids:
        return db.query(SurgicalOutlabRun).filter(SurgicalOutlabRun.id == run_id).first()
    return _receive_outlab_run_details(db, run_id, user_id, detail_ids=detail_ids)


def update_outlab_run(db: Session, run_id: int, obj_in):
    db_run = db.query(SurgicalOutlabRun).filter(SurgicalOutlabRun.id == run_id).first()
    if not db_run:
        return None
    if obj_in.tracking_number is not None:
        db_run.tracking_number = obj_in.tracking_number
    db.commit()
    db.refresh(db_run)
    return db_run


def toggle_hosxp_keyed(db: Session, detail_id: int, keyed: bool) -> dict | None:
    from datetime import datetime
    detail = db.query(SurgicalOutlabRunDetail).filter(SurgicalOutlabRunDetail.id == detail_id).first()
    if not detail:
        return None
    detail.is_hosxp_keyed = keyed
    detail.hosxp_keyed_at = local_now() if keyed else None
    db.commit()
    db.refresh(detail)
    return {"id": detail.id, "is_hosxp_keyed": detail.is_hosxp_keyed, "hosxp_keyed_at": detail.hosxp_keyed_at}


def delete_outlab_run(db: Session, run_id: int) -> bool:
    db_run = db.query(SurgicalOutlabRun).filter(SurgicalOutlabRun.id == run_id).first()
    if not db_run:
        return False

    try:
        # เปลี่ยนสถานะกลับเป็น pending สำหรับ stain orders เดิม
        for detail in db_run.details:
            if detail.stain_order:
                detail.stain_order.status = "pending"

        db.delete(db_run)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e
