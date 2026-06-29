import os
import io
import logging
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
from typing import List, Optional

logger = logging.getLogger(__name__)

try:
    from pypdf import PdfWriter, PdfReader
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

# กำหนด Path พื้นฐาน
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")

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


def generate_pdf_blob(
    report_data: dict, 
    template_name: str = "reports/surgical_report_template.html", 
    is_preview: bool = False,
    prepend_pdfs: Optional[List[str]] = None
) -> bytes:
    """
    แปลงข้อมูล report_data เป็นไฟล์ PDF (Binary)
    """
    # 1. โหลด Template
    template = env.get_template(template_name)

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
    main_pdf_bytes = pdf_io.getvalue()

    # 5. รวมไฟล์ (Merge) ถ้ามีการแนบ prepend_pdfs
    if prepend_pdfs and PYPDF_AVAILABLE:
        # Check which files actually exist on disk
        valid_pdfs = [p for p in prepend_pdfs if os.path.exists(p)]
        
        if valid_pdfs:
            merged_io = io.BytesIO()
            writer = PdfWriter()
            
            for pdf_path in valid_pdfs:
                writer.append(pdf_path)
                    
            writer.append(io.BytesIO(main_pdf_bytes))
            writer.write(merged_io)
            return merged_io.getvalue()

    return main_pdf_bytes


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
