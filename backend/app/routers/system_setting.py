# app/api/endpoints/system_settings.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pathlib import Path
import uuid
import os
from app.utils.file_handler import validate_and_sanitize
from pydantic import BaseModel
from typing import Optional

from app.db.database import get_db
from app.schemas.system_setting import SystemSettingResponse, SystemSettingUpdate
from app.crud import system_setting as crud
from app.dependencies.auth import get_current_user, RoleChecker
from app.core.roles import CAN_MANAGE_SYSTEM_SETTINGS

router = APIRouter(prefix="/system-settings", tags=["System Settings"])

# 🚩 ปรับให้ไปอยู่ที่ data/storage/system เพื่อให้สอดคล้องกับ main.py ที่ mount /storage ไว้
STORAGE_DIR = Path("uploads")
UPLOAD_DIR = STORAGE_DIR / "system"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


from typing import List

@router.get("/all", response_model=List[SystemSettingResponse])
def get_all_settings(db: Session = Depends(get_db)):
    """ดึงข้อมูล Branding ทั้งหมดสำหรับตาราง Admin"""
    return crud.get_all_settings(db)


@router.get("/public", response_model=SystemSettingResponse)
def get_public_settings(slug: str = "master", db: Session = Depends(get_db)):
    """ดึงข้อมูล Branding สำหรับหน้า Login และหน้าทั่วไป (ไม่ต้อง Login)"""
    from app.models.system_setting import SystemSetting as SystemSettingModel
    from sqlalchemy.orm import joinedload
    settings = (
        db.query(SystemSettingModel)
        .filter(SystemSettingModel.hospital_slug == slug)
        .options(
            joinedload(SystemSettingModel.default_gyne_test),
            joinedload(SystemSettingModel.default_non_gyne_test),
        )
        .first()
    )
    if not settings:
        return crud.get_settings(db, hospital_slug="master")
    return settings


@router.patch("/update", response_model=SystemSettingResponse)
def update_settings(
    obj_in: SystemSettingUpdate,
    slug: str = "master",
    db: Session = Depends(get_db),
    current_user=Depends(CAN_MANAGE_SYSTEM_SETTINGS),
):
    """แก้ไขการตั้งค่าระบบ"""
    return crud.update_settings(db, obj_in, hospital_slug=slug)


# _validate_image replaced by validate_and_sanitize from file_handler (includes EXIF strip)


@router.post("/upload-logo", response_model=SystemSettingResponse)
async def upload_logo(
    logo_type: str,
    slug: str = "master",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(CAN_MANAGE_SYSTEM_SETTINGS),
):
    import logging
    logger = logging.getLogger(__name__)

    if logo_type not in ["report", "login"]:
        raise HTTPException(status_code=400, detail="Invalid logo type")

    # Validate magic bytes, strip EXIF, enforce size cap
    file_bytes, safe_ext = validate_and_sanitize(file, allowed="image")

    # Save validated file
    file_name = f"logo_{logo_type}_{uuid.uuid4()}.{safe_ext}"
    file_path = UPLOAD_DIR / file_name
    with file_path.open("wb") as buffer:
        buffer.write(file_bytes)

    url = f"system/{file_name}"
    update_data = SystemSettingUpdate(**{f"{logo_type}_logo_url": url})
    return crud.update_settings(db, update_data, hospital_slug=slug)


TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "reports"

REPORT_TYPE_DEFAULTS = {
    "surgical": "surgical_report_template.html",
    "gyne":     "gyne_cyto_report_template.html",
    "nongyne":  "nongyne_cyto_report_template.html",
}

# File stems that belong exclusively to each report type
REPORT_TYPE_PREFIXES = {
    "surgical": "surgical_report_template",
    "gyne":     "gyne_cyto_report_template",
    "nongyne":  "nongyne_cyto_report_template",
}

EXCLUDED_TEMPLATES = {
    "barcode_label_template.html",
    "hospital_billing_summary.html",
    "slide_block_release_form.html",
}


def _list_templates_for_type(report_type: str):
    prefix = REPORT_TYPE_PREFIXES[report_type]
    files = sorted(
        f.name for f in TEMPLATES_DIR.glob("*.html")
        if f.name.startswith(prefix) and f.name not in EXCLUDED_TEMPLATES
    )
    return files


class ReportTemplateSet(BaseModel):
    report_type: str  # "surgical" | "gyne" | "nongyne"
    template_name: str


@router.get("/report-templates", dependencies=[Depends(get_current_user)])
def list_report_templates(slug: str = "master", db: Session = Depends(get_db)):
    """Returns available template filenames and the currently active one for each report type."""
    settings = crud.get_settings(db, hospital_slug=slug)
    return {
        rt: {
            "available": _list_templates_for_type(rt),
            "active": getattr(settings, f"{rt}_report_template") or REPORT_TYPE_DEFAULTS[rt],
        }
        for rt in ("surgical", "gyne", "nongyne")
    }


@router.get("/report-templates/preview", dependencies=[Depends(get_current_user)])
def preview_report_template(report_type: str, template_name: str, db: Session = Depends(get_db)):
    """Render the template with dummy data and return a PDF preview."""
    import io
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from app.services.barcode_service import generate_code39_base64_img
    from app.services import pdf_service

    if report_type not in REPORT_TYPE_DEFAULTS:
        raise HTTPException(status_code=400, detail="Invalid report_type")
    template_path = (TEMPLATES_DIR / template_name).resolve()
    if not template_path.is_relative_to(TEMPLATES_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid template name")
    if not template_path.exists() or not template_name.startswith(REPORT_TYPE_PREFIXES[report_type]):
        raise HTTPException(status_code=404, detail="Template file not found")

    from app.crud.surgical_report_builder import _darken_hex
    settings = crud.get_settings(db)
    now = datetime.now()
    accession_no = "66-00001"
    barcode_svg, _, _ = generate_code39_base64_img(accession_no)
    primary_color = settings.report_primary_color if settings else None
    primary_color_dark = _darken_hex(primary_color) if primary_color else None

    base_data = {
        "accession_no": accession_no,
        "patient_title": "นาย",
        "patient_name": "สมชาย ใจดี",
        "patient_ln": None,
        "patient_hn": "HN-12345",
        "patient_cid": "1234567890123",
        "patient_birth_date": None,
        "patient_age": 45,
        "patient_age_display": "45 ปี",
        "patient_gender": "Male",
        "lab_name_th_snapshot": settings.lab_name_th if settings else "ห้องปฏิบัติการพยาธิวิทยา",
        "lab_name_en_snapshot": settings.lab_name_en if settings else "Pathology Laboratory",
        "lab_address_snapshot": settings.lab_address if settings else "123 Hospital Rd, Bangkok",
        "report_footer_snapshot": settings.report_footer_text if settings else "",
        "report_logo_url_snapshot": None,
        "hospital_name": "โรงพยาบาลตัวอย่าง",
        "department_name": "อายุรกรรม",
        "clinician_name": "นพ.ตัวอย่าง นามสกุล",
        "collect_at": now,
        "registered_at": now,
        "reported_at": now,
        "published_at": now,
        "has_malignancy": False,
        "has_critical": False,
        "is_pending": False,
        "pending_reason": None,
        "barcode_svg": barcode_svg,
        "barcode_value": accession_no,
        "pathologist_name": "พญ.ตัวอย่าง พยาธิแพทย์",
        "version_no": 1,
        "signers": [],
        "consult_pdf_path_snapshot": None,
        "primary_color": primary_color,
        "primary_color_dark": primary_color_dark,
    }

    if report_type == "surgical":
        data = {
            **base_data,
            "clinical_history_snapshot": "<p>ผู้ป่วยมีก้อนที่บริเวณ...</p>",
            "specimen_summary": "<p><b>A:</b> Appendix</p>",
            "gross_description_summary": "<p><b>A:</b> ชิ้นเนื้อขนาด 2x1x1 cm สีขาวขุ่น</p>",
            "submitted_sections_snapshot": "<p><b>A:</b> All in 1 cassette</p>",
            "microscopic_summary": "<p>พบการอักเสบเฉียบพลัน...</p>",
            "diagnosis_summary": "<p><b>A: Appendix</b><br/>— Acute appendicitis</p>",
            "comment_summary": "",
            "gross_images": [],
            "micro_images": [],
            "report_type": "FINAL",
            "status": "published",
        }
    elif report_type == "gyne":
        data = {
            **base_data,
            "specimen_type": "Cervical smear",
            "collection_site": "Cervix",
            "received_volume_ml": None,
            "clinical_history_snapshot": "ตรวจคัดกรองมะเร็งปากมดลูกประจำปี",
            "quality_text": "Satisfactory for evaluation",
            "endocervical_status_text": "Endocervical/transformation zone component present",
            "interpretation": "Negative for intraepithelial lesion or malignancy (NILM)",
            "note": "",
        }
    else:  # nongyne
        data = {
            **base_data,
            "specimen_type": "Pleural Fluid",
            "collection_site": "Left pleural cavity",
            "received_volume_ml": "50",
            "clinical_history_snapshot": "ผู้ป่วยมีน้ำในช่องเยื่อหุ้มปอดซ้าย",
            "comment_summary": "",
            "diagnosis_summary": "<p>Reactive mesothelial cells with inflammatory background</p>",
            "microscopic_summary": "<p>ตรวจพบเซลล์ mesothelial ที่มีการอักเสบ</p>",
        }

    pdf_blob = pdf_service.generate_pdf_blob(
        data,
        template_name=f"reports/{template_name}",
        is_preview=True,
    )
    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=preview_{template_name}.pdf"},
    )


@router.patch(
    "/report-templates",
    response_model=SystemSettingResponse,
    dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)],
)
def set_report_template(payload: ReportTemplateSet, slug: str = "master", db: Session = Depends(get_db)):
    """Set the active report template for one report type."""
    if payload.report_type not in REPORT_TYPE_DEFAULTS:
        raise HTTPException(status_code=400, detail="Invalid report_type")
    template_path = (TEMPLATES_DIR / payload.template_name).resolve()
    if not template_path.is_relative_to(TEMPLATES_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid template name")
    if not template_path.exists() or not payload.template_name.startswith(REPORT_TYPE_PREFIXES[payload.report_type]):
        raise HTTPException(status_code=404, detail="Template file not found")
    update_data = SystemSettingUpdate(**{f"{payload.report_type}_report_template": payload.template_name})
    return crud.update_settings(db, update_data, hospital_slug=slug)


@router.get("/font-check", dependencies=[Depends(get_current_user)])
def font_check():
    """Diagnostic: check whether Sarabun font files are accessible to the PDF renderer."""
    from app.services.pdf_service import check_fonts
    return check_fonts()


@router.get("/sticker-test-print", dependencies=[Depends(get_current_user)])
def sticker_test_print(db: Session = Depends(get_db)):
    from fastapi.responses import Response as FastAPIResponse
    from datetime import date
    from app.utils.slide_sticker_pdf_generator import generate_slide_sticker_pdf

    settings = crud.get_settings(db)
    dummy = [{
        "accession_no": "S26-00001",
        "block_code": "A1",
        "stain_display": "H&E",
        "hospital_code": (settings.lab_short_name_en or "LAB") if settings else "LAB",
        "reg_date": str(date.today()),
    }]
    pdf = generate_slide_sticker_pdf(
        dummy,
        sticker_width_cm=float(settings.sticker_width_cm or 2.0) if settings else 2.0,
        sticker_height_cm=float(settings.sticker_height_cm or 2.0) if settings else 2.0,
        sticker_orientation=(settings.sticker_orientation or "portrait") if settings else "portrait",
        font_accession=int(settings.sticker_font_accession or 7) if settings else 7,
        font_block=int(settings.sticker_font_block or 7) if settings else 7,
        font_stain=int(settings.sticker_font_stain or 6) if settings else 6,
        font_hospital=int(settings.sticker_font_hospital or 6) if settings else 6,
        font_date=int(settings.sticker_font_date or 6) if settings else 6,
        margin_top_cm=float(settings.sticker_margin_top_cm or 0.0) if settings else 0.0,
        qr_scale=float(settings.sticker_qr_scale or 1.0) if settings else 1.0,
        qr_offset_x_cm=float(settings.sticker_qr_offset_x_cm or 0.0) if settings else 0.0,
        qr_offset_y_cm=float(settings.sticker_qr_offset_y_cm or 0.0) if settings else 0.0,
    )
    return FastAPIResponse(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=test_sticker.pdf"},
    )


@router.get("/{setting_id}", response_model=SystemSettingResponse)
def get_settings_by_id(
    setting_id: int,
    slug: str = "master",
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),  # 🚩 เช็ค Login ก่อนดึงข้อมูลตัวเต็ม
):
    """ดึงข้อมูลการตั้งค่าตาม ID (สำหรับใช้ภายในระบบหลัง Login)"""
    settings = crud.get_settings(db, hospital_slug=slug)  # ปกติระบบเรามีชุดเดียวอยู่แล้ว
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return settings


@router.delete("/{setting_id}", response_model=dict)
def delete_settings(
    setting_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(CAN_MANAGE_SYSTEM_SETTINGS),
):
    """ลบการตั้งค่าหน้า Login (ห้ามลบ master)"""
    try:
        success = crud.delete_settings(db, setting_id=setting_id)
        if not success:
            raise HTTPException(status_code=404, detail="Settings not found")
        return {"message": "Deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
