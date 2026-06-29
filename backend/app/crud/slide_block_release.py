from sqlalchemy.orm import Session, joinedload, selectinload
from fastapi import HTTPException
from datetime import datetime
from app.utils.time import local_now
from typing import Optional

from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.surgical_report import SurgicalReport
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.gyne_cyto_stain import GyneCytologyStain
from app.models.gyne_cyto_report import GyneCytoReport
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.models.patient import Patient
from app.models.organization import Title
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.slide_block_release import SlideBlockRelease
from app.models.system_setting import SystemSetting
from app.schemas.slide_block_release import SlideBlockReleaseCreate

def _full_patient_name(patient) -> str:
    if not patient:
        return "Unknown"
    title = patient.title.title if patient.title else ""
    ln = f" {patient.ln}" if patient.ln else ""
    return f"{title}{patient.name}{ln}"


CASE_MODEL_MAP = {
    "SURGICAL": SurgicalCase,
    "GYNE_CYTO": GyneCytologyCase,
    "NONGYNE_CYTO": NongyneCytologyCase,
}


def generate_release_no(db: Session) -> str:
    year = local_now().strftime("%Y")
    prefix = f"REL-{year}-"
    last = (
        db.query(SlideBlockRelease)
        .filter(SlideBlockRelease.release_no.like(f"{prefix}%"))
        .order_by(SlideBlockRelease.release_no.desc())
        .first()
    )
    if last:
        seq = int(last.release_no.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def verify_accession_for_release(db: Session, accession_no: str) -> dict:
    """
    ตรวจสอบ Accession No. ก่อนบันทึกการจำหน่าย
    Case ต้องรายงานผลแล้ว (is_reported=True)
    """
    surgical = (
        db.query(SurgicalCase)
        .filter(SurgicalCase.accession_no == accession_no)
        .options(
            joinedload(SurgicalCase.patient).joinedload(Patient.title),
            selectinload(SurgicalCase.specimens).selectinload(
                SurgicalSpecimen.blocks
            ).selectinload(SurgicalBlock.stains).joinedload(SurgicalBlockStain.test),
        )
        .first()
    )
    if surgical:
        if not surgical.is_reported:
            raise HTTPException(
                status_code=400,
                detail=f"Case {accession_no} has not been reported yet",
            )
        specimens = [
            {
                "specimen_label": spec.specimen_label,
                "specimen_name": spec.specimen_name,
                "blocks": [
                    {
                        "block_code": block.block_code,
                        "stains": [
                            {
                                "name": stain.test.name if stain.test else "Unknown",
                                "status": stain.status,
                            }
                            for stain in block.stains
                        ],
                    }
                    for block in sorted(spec.blocks, key=lambda b: b.block_no)
                ],
            }
            for spec in sorted(surgical.specimens, key=lambda s: s.specimen_label)
        ]
        return {
            "id": surgical.id,
            "accession_no": surgical.accession_no,
            "patient_name": _full_patient_name(surgical.patient),
            "patient_cid": surgical.patient.cid if surgical.patient else None,
            "case_type": "SURGICAL",
            "is_slide_released": bool(surgical.is_slide_released),
            "is_block_released": bool(surgical.is_block_released),
            "specimens": specimens,
            "stains": [],
        }

    gyne = (
        db.query(GyneCytologyCase)
        .filter(GyneCytologyCase.accession_no == accession_no)
        .options(
            joinedload(GyneCytologyCase.patient).joinedload(Patient.title),
            selectinload(GyneCytologyCase.stains).joinedload(GyneCytologyStain.test),
        )
        .first()
    )
    if gyne:
        if not gyne.is_reported:
            raise HTTPException(
                status_code=400,
                detail=f"Case {accession_no} has not been reported yet",
            )
        return {
            "id": gyne.id,
            "accession_no": gyne.accession_no,
            "patient_name": _full_patient_name(gyne.patient),
            "patient_cid": gyne.patient.cid if gyne.patient else None,
            "case_type": "GYNE_CYTO",
            "is_slide_released": bool(gyne.is_slide_released),
            "is_block_released": False,
            "specimens": [],
            "stains": [
                {"name": s.test.name if s.test else "Unknown", "status": s.status}
                for s in gyne.stains
            ],
        }

    nongyne = (
        db.query(NongyneCytologyCase)
        .filter(NongyneCytologyCase.accession_no == accession_no)
        .options(
            joinedload(NongyneCytologyCase.patient).joinedload(Patient.title),
            selectinload(NongyneCytologyCase.stains).joinedload(NongyneCytologyStain.test),
        )
        .first()
    )
    if nongyne:
        if not nongyne.is_reported:
            raise HTTPException(
                status_code=400,
                detail=f"Case {accession_no} has not been reported yet",
            )
        return {
            "id": nongyne.id,
            "accession_no": nongyne.accession_no,
            "patient_name": _full_patient_name(nongyne.patient),
            "patient_cid": nongyne.patient.cid if nongyne.patient else None,
            "case_type": "NONGYNE_CYTO",
            "is_slide_released": bool(nongyne.is_slide_released),
            "is_block_released": False,
            "specimens": [],
            "stains": [
                {"name": s.test.name if s.test else "Unknown", "status": s.status}
                for s in nongyne.stains
            ],
        }

    raise HTTPException(status_code=404, detail=f"Case {accession_no} not found")


def create_release(
    db: Session, obj_in: SlideBlockReleaseCreate, released_by_id: int
) -> SlideBlockRelease:
    try:
        db_release = SlideBlockRelease(
            release_no=generate_release_no(db),
            case_id=obj_in.case_id,
            case_type=obj_in.case_type,
            release_type=obj_in.release_type,
            recipient_name=obj_in.recipient_name,
            reference_doc_no=obj_in.reference_doc_no,
            remark=obj_in.remark,
            pathologist_id=obj_in.pathologist_id,
            pathologist_name=obj_in.pathologist_name,
            released_by_id=released_by_id,
        )
        db.add(db_release)
        db.flush()

        # อัปเดต flag บน case
        case_model = CASE_MODEL_MAP[obj_in.case_type]
        target = db.query(case_model).get(obj_in.case_id)
        if target:
            if obj_in.release_type in ("SLIDE", "BOTH"):
                target.is_slide_released = True
            if obj_in.release_type in ("BLOCK", "BOTH") and obj_in.case_type == "SURGICAL":
                target.is_block_released = True

        db.commit()
        db.refresh(db_release)
        return db_release

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create release: {str(e)}")


def get_releases(
    db: Session,
    skip: int = 0,
    limit: int = 15,
    case_type: Optional[str] = None,
    release_type: Optional[str] = None,
) -> dict:
    query = db.query(SlideBlockRelease)
    if case_type:
        query = query.filter(SlideBlockRelease.case_type == case_type)
    if release_type:
        query = query.filter(SlideBlockRelease.release_type == release_type)

    total = query.count()
    items = (
        query.options(joinedload(SlideBlockRelease.released_by))
        .order_by(SlideBlockRelease.released_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"total": total, "items": items, "skip": skip, "limit": limit}


def delete_release(db: Session, release_id: int) -> bool:
    db_release = db.query(SlideBlockRelease).filter(SlideBlockRelease.id == release_id).first()
    if not db_release:
        return False

    try:
        case_id = db_release.case_id
        case_type = db_release.case_type

        db.delete(db_release)
        db.flush()

        # ตรวจสอบ record ที่เหลือสำหรับ case นี้
        remaining = (
            db.query(SlideBlockRelease)
            .filter(
                SlideBlockRelease.case_id == case_id,
                SlideBlockRelease.case_type == case_type,
            )
            .all()
        )
        has_slide = any(r.release_type in ("SLIDE", "BOTH") for r in remaining)
        has_block = any(r.release_type in ("BLOCK", "BOTH") for r in remaining)

        case_model = CASE_MODEL_MAP[case_type]
        target = db.query(case_model).get(case_id)
        if target:
            if not has_slide:
                target.is_slide_released = False
            if not has_block and case_type == "SURGICAL":
                target.is_block_released = False

        db.commit()
        return True

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


def build_release_form_data(db: Session, release_id: int) -> dict:
    """Build template data dict for the slide/block release consent form PDF."""
    release = (
        db.query(SlideBlockRelease)
        .options(joinedload(SlideBlockRelease.released_by))
        .filter(SlideBlockRelease.id == release_id)
        .first()
    )
    if not release:
        raise HTTPException(status_code=404, detail="Release record not found")

    settings = db.query(SystemSetting).first()
    lab_name_th = settings.lab_name_th if settings else "ห้องปฏิบัติการพยาธิวิทยา"
    lab_address = settings.lab_address if settings else ""

    # ── Fetch case with patient ─────────────────────────────────────
    patient_name = ""
    patient_cid = ""
    accession_no = ""
    block_codes: list[str] = []
    he_block_codes: list[str] = []
    special_block_codes: list[str] = []
    special_stain_names: list[str] = []
    cyto_slide_nos: list[str] = []

    if release.case_type == "SURGICAL":
        case = (
            db.query(SurgicalCase)
            .options(
                joinedload(SurgicalCase.patient),
                selectinload(SurgicalCase.specimens)
                .selectinload(SurgicalSpecimen.blocks)
                .selectinload(SurgicalBlock.stains)
                .joinedload(SurgicalBlockStain.test),
            )
            .filter(SurgicalCase.id == release.case_id)
            .first()
        )
        if case:
            patient_name = _full_patient_name(case.patient)
            patient_cid = case.patient.cid if case.patient else ""
            accession_no = case.accession_no
            for spec in case.specimens:
                for block in sorted(spec.blocks, key=lambda b: b.block_no):
                    block_codes.append(block.block_code)
                    for stain in block.stains:
                        name = stain.test.name if stain.test else ""
                        if "H&E" in name.upper() or name.upper() in ("HE", "H E"):
                            if block.block_code not in he_block_codes:
                                he_block_codes.append(block.block_code)
                        elif name:
                            if block.block_code not in special_block_codes:
                                special_block_codes.append(block.block_code)
                            if name not in special_stain_names:
                                special_stain_names.append(name)

    else:  # GYNE_CYTO / NONGYNE_CYTO
        CaseModel = CASE_MODEL_MAP[release.case_type]
        case = (
            db.query(CaseModel)
            .options(
                joinedload(CaseModel.patient),
                selectinload(CaseModel.stains).joinedload("test"),
            )
            .filter(CaseModel.id == release.case_id)
            .first()
        )
        if case:
            patient_name = _full_patient_name(case.patient)
            patient_cid = case.patient.cid if case.patient else ""
            accession_no = case.accession_no
            cyto_slide_nos = [accession_no] if accession_no else []

    # Determine what to show based on release_type
    show_blocks = release.release_type in ("BLOCK", "BOTH") and release.case_type == "SURGICAL"
    show_slides = release.release_type in ("SLIDE", "BOTH")

    released_by = release.released_by
    released_by_name = (released_by.full_name or released_by.username) if released_by else ""

    pathologist_name = release.pathologist_name or ""
    if not pathologist_name and release.pathologist:
        pathologist_name = release.pathologist.full_name or release.pathologist.username or ""

    at = release.released_at
    released_date = at.strftime("%-d/%m/%Y") if at else ""
    released_time = at.strftime("%H:%M") if at else ""

    return {
        "release_no": release.release_no,
        "released_date": released_date,
        "released_time": released_time,
        "lab_name_th": lab_name_th,
        "lab_address": lab_address,
        "patient_name": patient_name,
        "patient_cid": patient_cid,
        "accession_no": accession_no,
        "remark": release.remark or "",
        "recipient_name": release.recipient_name,
        "reference_doc_no": release.reference_doc_no or "",
        "released_by_name": released_by_name,
        "pathologist_name": pathologist_name,
        # Blocks
        "block_nos": ", ".join(block_codes) if show_blocks else "",
        "block_count": len(block_codes) if show_blocks and block_codes else "",
        # H&E slides
        "he_slide_nos": ", ".join(he_block_codes) if show_slides and he_block_codes else "",
        "he_count": len(he_block_codes) if show_slides and he_block_codes else "",
        # Special stain slides
        "special_slide_nos": ", ".join(special_block_codes) if show_slides and special_block_codes else "",
        "special_count": len(special_block_codes) if show_slides and special_block_codes else "",
        "special_stain_names": ", ".join(special_stain_names) if special_stain_names else "",
        # Cytology slides
        "cyto_slide_nos": ", ".join(cyto_slide_nos) if show_slides and cyto_slide_nos else "",
        "cyto_count": len(cyto_slide_nos) if show_slides and cyto_slide_nos else "",
    }
