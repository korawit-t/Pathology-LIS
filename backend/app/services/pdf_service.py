import os
import io
import json
import logging
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

try:
    from pypdf import PdfWriter
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

logger = logging.getLogger(__name__)

# กำหนด Path พื้นฐาน
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
LOCAL_TEMPLATE_DIR = os.path.join(BASE_DIR, "templates", "reports", "local")

# autoescape=True: all {{ var }} are HTML-escaped by default.
# Rich-text fields (diagnosis, gross, microscopic, clinical history) that
# intentionally contain HTML must use {{ var | safe }} in the templates.
# Plain patient data (name, HN, gender) is automatically escaped — the main
# security gain: injected HTML in patient records cannot affect PDF output.
env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
    finalize=lambda x: "" if x is None else x,
)


def _resolve_template(template_name: str) -> str:
    """Return reports/local/<name> if a hospital override exists, else the canonical name."""
    filename = os.path.basename(template_name)
    if os.path.isfile(os.path.join(LOCAL_TEMPLATE_DIR, filename)):
        return f"reports/local/{filename}"
    return template_name


def generate_pdf_blob(
    report_data: dict,
    template_name: str = "reports/surgical_report_template.html",
    is_preview: bool = False,
) -> bytes:
    """
    แปลงข้อมูล report_data เป็นไฟล์ PDF (Binary)
    """
    # 1. โหลด Template (local/ override takes precedence over canonical)
    template = env.get_template(_resolve_template(template_name))

    # 2. ใส่ข้อมูล Metadata เพิ่มเติม
    project_root = os.path.dirname(BASE_DIR)
    font_path = os.path.join(project_root, "assets", "fonts")
    
    report_data["is_preview"] = is_preview
    # Path.as_uri() สร้าง file:// URL ที่ถูกต้องทั้ง Linux และ Windows
    # Linux: file:///app/assets/fonts
    # Windows: file:///C:/inetpub/wwwroot/backend/assets/fonts
    report_data["font_path"] = Path(font_path).as_uri()

    if not os.path.isdir(font_path):
        logger.warning("FONT PATH NOT FOUND: %s — Thai text will render with system fallback font", font_path)
    else:
        missing = [f for f in ("Sarabun-Regular.ttf", "Sarabun-Bold.ttf", "Sarabun-SemiBold.ttf")
                   if not os.path.exists(os.path.join(font_path, f))]
        if missing:
            logger.warning("FONT FILES MISSING in %s: %s", font_path, missing)

    # 3. Render HTML จาก Template
    html_content = template.render(**report_data)

    # 4. แปลง HTML เป็น PDF ด้วย WeasyPrint
    # FontConfiguration ต้องใช้เพื่อให้ @font-face ใน HTML ถูก register กับ Pango ถูกต้อง (WeasyPrint 60+)
    pdf_io = io.BytesIO()
    font_config = FontConfiguration()
    HTML(string=html_content, base_url=TEMPLATE_DIR).write_pdf(pdf_io, font_config=font_config)
    return pdf_io.getvalue()


def generate_consult_cover_pdf(report_data: dict) -> bytes:
    """Render the external-consult cover sheet (hospital header + patient
    info + one full-page image per consult PDF page + approver/date) — call
    after generate_pdf_blob() so report_data["font_path"] is already
    populated."""
    raw = report_data.get("consult_pdf_thumbnail_snapshot")
    try:
        thumbnails = json.loads(raw) if raw else []
    except (TypeError, ValueError):
        # Backward-compat: reports finalized before multi-page support stored
        # a single data-URI string here, not a JSON array.
        thumbnails = [raw] if raw else []

    cover_data = {**report_data, "consult_pdf_thumbnails": thumbnails}

    template = env.get_template(_resolve_template("reports/consult_cover_template.html"))
    html_content = template.render(**cover_data)

    pdf_io = io.BytesIO()
    font_config = FontConfiguration()
    HTML(string=html_content, base_url=TEMPLATE_DIR).write_pdf(pdf_io, font_config=font_config)
    return pdf_io.getvalue()


def prepend_consult_cover(main_pdf_bytes: bytes, report_data: dict) -> bytes:
    """If this report has an approved external consult PDF thumbnail, render
    the cover sheet and merge it in front of the main report."""
    if not report_data.get("consult_pdf_thumbnail_snapshot") or not PYPDF_AVAILABLE:
        return main_pdf_bytes

    cover_bytes = generate_consult_cover_pdf(report_data)

    writer = PdfWriter()
    writer.append(io.BytesIO(cover_bytes))
    writer.append(io.BytesIO(main_pdf_bytes))
    merged_io = io.BytesIO()
    writer.write(merged_io)
    return merged_io.getvalue()


def check_fonts() -> dict:
    """Return diagnostic info about font availability for the PDF renderer."""
    project_root = os.path.dirname(BASE_DIR)
    font_path = os.path.join(project_root, "assets", "fonts")
    expected = [
        "Sarabun-Regular.ttf",
        "Sarabun-SemiBold.ttf",
        "Sarabun-Bold.ttf",
        "Sarabun-ExtraBold.ttf",
    ]
    found = []
    missing = []
    for name in expected:
        full = os.path.join(font_path, name)
        (found if os.path.exists(full) else missing).append(name)

    return {
        "font_dir": font_path,
        "font_dir_exists": os.path.isdir(font_path),
        "found": found,
        "missing": missing,
        "status": "ok" if not missing else "partial" if found else "missing",
    }
