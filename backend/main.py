import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
from app.routers import (
    users,
    auth,
    audit_log,
    organization,
    patients,
    surgical_case,
    surgical_specimen,
    surgical_block,
    gross_images,
    anatomical_pathology_test,
    surgical_specimen_ap_test,
    tissue_processing,
    gross_templates,
    embedding,
    system_setting,
    sectioning,
    surgical_block_stain,
    stain_run,
    surgical_diagnosis,
    surgical_report,
    microscopic_images,
    diagnostic_templates,
    stain_panel,
    slide_dispatch,
    approval,
    specimen_template,
    gyne_cyto_case,
    gyne_diagnosis,
    gyne_cyto_stain,
    gyne_cyto_report,
    nongyne_cyto_case,
    nongyne_cyto_stain,
    external_lab,
    notification_channel,
    notification_rule,
    block_storage,
    slide_storage,
    cyto_workload,
    nongyne_diagnosis,
    nongyne_cyto_report,
    nongyne_case_image,
    gyne_case_image,
    his,
    outlab_consult,
    slide_block_release,
    internal_consult,
    surgical_block_event,
    ihc,
    molecular_case,
    cyto_histo_correlation,
    surgical_case_correlation,
    tumor_registry,
    llm_profile,
    report_generation,
    grossing_assist,
    unified_case,
)
from app.middleware.audit_middleware import AuditContextMiddleware
from app.services.audit_service import register_audit_listeners
from app.core.config import IS_PRODUCTION
from app.his_export.worker import export_worker_lifespan

# C5: disable Swagger / ReDoc / OpenAPI schema in production so the full
# endpoint map is not publicly reachable (SECURITY_AUDIT.md §C5).
app = FastAPI(
    title="Pathology LIS API",
    version="1.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    redirect_slashes=True,
    lifespan=export_worker_lifespan,
)

register_audit_listeners()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

# --- ส่วนจัดการ CORS แบบอ่านจาก .env ---
# อ่านค่ามาเป็น String
origins_str = os.getenv("ALLOWED_ORIGINS", "")

# แปลง String ให้เป็น List โดยการตัดคำด้วยเครื่องหมายลูกน้ำ ","
origins = [origin.strip() for origin in origins_str.split(",") if origin]

# ถ้า .env ว่าง ให้เพิ่ม local dev server อัตโนมัติ
if not origins:
    origins = ["http://localhost:5173"]

# C4: in production, refuse to start if ALLOWED_ORIGINS contains anything
# that would let cookies (allow_credentials=True) leak to plaintext or
# local-attacker origins. Fail-closed: better to refuse boot than to
# silently serve PHI over HTTP.
if IS_PRODUCTION:
    for origin in origins:
        if "*" in origin:
            raise RuntimeError(
                f"ALLOWED_ORIGINS contains wildcard '{origin}' but ENVIRONMENT=production. "
                "Wildcards are incompatible with allow_credentials=True. "
                "Set an explicit HTTPS allow-list."
            )
        if origin.startswith("http://"):
            raise RuntimeError(
                f"ALLOWED_ORIGINS contains plaintext origin '{origin}' but ENVIRONMENT=production. "
                "All production origins must use https://."
            )
        if "localhost" in origin or "127.0.0.1" in origin:
            raise RuntimeError(
                f"ALLOWED_ORIGINS contains local origin '{origin}' but ENVIRONMENT=production. "
                "Set ENVIRONMENT=development for local work."
            )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
)

# AuditContextMiddleware is added here so it runs after ProxyHeadersMiddleware
# (middleware stack is LIFO: ProxyHeaders resolves the real IP first, then
# AuditContext reads request.client.host to stamp audit log rows).
app.add_middleware(AuditContextMiddleware)

# TRUSTED_PROXY_IPS: comma-separated list of reverse-proxy IPs/CIDRs that are
# allowed to set X-Forwarded-For.  Defaults to "127.0.0.1" (localhost only).
# Set to the actual proxy IP in production to prevent IP spoofing in audit logs.
_trusted_proxies = os.getenv("TRUSTED_PROXY_IPS", "127.0.0.1").split(",")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=_trusted_proxies)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    # AntD v5 uses CSS-in-JS and requires 'unsafe-inline' for style-src.
    # script-src is kept to 'self' only (no inline scripts in the SPA bundle).
    _CSP = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "object-src 'none'; "
        "base-uri 'self'"
    )

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = self._CSP
        return response


app.add_middleware(SecurityHeadersMiddleware)

STORAGE_DIR = (
    "uploads"  # 👈 Path ใน Local Disk ที่เก็บไฟล์จริง (ต้องตรงกับ file_handler.py)
)

# 1. 🔑 ตรวจสอบและสร้าง Directory ถ้าไม่มี
if not os.path.isdir(STORAGE_DIR):
    print(f"Creating storage directory: {STORAGE_DIR}")
    os.makedirs(STORAGE_DIR, exist_ok=True)

# 2. Bootstrap report templates: copy *.html.example → *.html if not already present.
#    Each lab customizes the .html files locally; .html.example are the git-tracked defaults.
from pathlib import Path as _Path
_TEMPLATES_DIR = _Path(__file__).parent / "app" / "templates" / "reports"
for _example in _TEMPLATES_DIR.glob("*.html.example"):
    _target = _example.with_suffix("")  # strips the trailing .example
    if not _target.exists():
        import shutil as _shutil
        _shutil.copy2(_example, _target)
        print(f"[templates] Initialized {_target.name} from {_example.name}")

# 2. File delivery is now handled by `app.routers.storage`:
#   - /storage/{path}        — requires authentication (PHI images, etc.)
#   - /public-assets/{path}  — open, restricted to uploads/system/
# The previous `app.mount("/storage", StaticFiles(...))` served every
# uploaded file unauthenticated and is intentionally not used anymore
# (SECURITY_AUDIT.md M1).
from app.routers import storage as storage_router_module
from app.routers import version as version_router_module
from app.routers import critical_notification_log as critical_notification_log_router
from app.routers import his_export_log as his_export_log_router
from app.routers import legacy_reports as legacy_reports_router
from app.routers import wsi_viewer
from app.routers import wsi_settings as wsi_settings_router
from app.routers import wsi_links as wsi_links_router

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(organization.router)
app.include_router(patients.router)
app.include_router(surgical_case.router)
app.include_router(surgical_specimen.router)
app.include_router(surgical_block.router)
app.include_router(gross_images.router)
app.include_router(anatomical_pathology_test.router)
app.include_router(surgical_specimen_ap_test.router)
app.include_router(surgical_diagnosis.router)
app.include_router(surgical_report.router)
app.include_router(tissue_processing.router)
app.include_router(gross_templates.router)
app.include_router(embedding.router)
app.include_router(system_setting.router)
app.include_router(sectioning.router)
app.include_router(surgical_block_stain.router)
app.include_router(stain_run.router)
app.include_router(microscopic_images.router)
app.include_router(diagnostic_templates.router)
app.include_router(stain_panel.router)
app.include_router(slide_dispatch.router)
app.include_router(approval.router)
app.include_router(specimen_template.router)
app.include_router(gyne_cyto_case.router)
app.include_router(gyne_diagnosis.router)
app.include_router(gyne_cyto_stain.router)
app.include_router(gyne_cyto_report.router)
app.include_router(nongyne_cyto_case.router)
app.include_router(nongyne_cyto_stain.router)
app.include_router(external_lab.router)
app.include_router(notification_channel.router)
app.include_router(notification_rule.router)
app.include_router(block_storage.router)
app.include_router(slide_storage.router)
app.include_router(cyto_workload.router)
app.include_router(nongyne_diagnosis.router)
app.include_router(nongyne_cyto_report.router)
app.include_router(nongyne_case_image.router)
app.include_router(gyne_case_image.router)
app.include_router(his.router)
app.include_router(outlab_consult.router)
app.include_router(internal_consult.router)
app.include_router(slide_block_release.router)
app.include_router(surgical_block_event.router)
app.include_router(ihc.router)
app.include_router(molecular_case.router)
app.include_router(cyto_histo_correlation.router)
app.include_router(surgical_case_correlation.router)
app.include_router(tumor_registry.router)
app.include_router(llm_profile.router)
app.include_router(report_generation.router)
app.include_router(grossing_assist.router)
app.include_router(unified_case.router)
app.include_router(audit_log.router)
app.include_router(storage_router_module.router)
app.include_router(storage_router_module.public_router)
app.include_router(version_router_module.router)
app.include_router(critical_notification_log_router.router)
app.include_router(his_export_log_router.router)
app.include_router(legacy_reports_router.router)
app.include_router(wsi_viewer.router)
app.include_router(wsi_settings_router.router)
app.include_router(wsi_links_router.router)


#
@app.get("/")
def home():
    return {"message": "Pathology LIS API is running"}
