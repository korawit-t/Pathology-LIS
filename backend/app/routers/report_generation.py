from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Literal
from html.parser import HTMLParser
import json
import re

from pydantic import BaseModel

from app.db.database import get_db
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.core.roles import CAN_WRITE_REPORT
from app.core.prompts import get_report_gen_prompt
from app.crud import llm_profile as crud_llm
from app.crud.system_setting import get_settings
from app.services.llm_service import call_llm
from app.utils.submitted_sections import build_submitted_sections_text, fetch_blocks_by_specimen

router = APIRouter(prefix="/surgical-cases", tags=["Report Generation"])


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str):
        self._parts.append(data)


def _strip_html(html: str) -> str:
    if not html:
        return ""
    s = _HTMLStripper()
    s.feed(html)
    return " ".join(part.strip() for part in s._parts if part.strip())


def _parse_json_safe(raw: str) -> dict:
    """Parse JSON, stripping markdown fences if present."""
    raw = raw.strip()
    # strip ```json ... ``` or ``` ... ```
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


# --- Request schemas ---

class SpecimenDraftData(BaseModel):
    specimen_id: int
    microscopic_description: Optional[str] = None


class ReportGenDraftData(BaseModel):
    specimens: List[SpecimenDraftData] = []


class ReportGenRequest(BaseModel):
    source: Literal["gross_and_micro", "gross_only", "micro_only"]
    diagnosis_mode: Literal["individual", "integrated", "clean"]
    draft_data: Optional[ReportGenDraftData] = None


# --- Helpers ---

def _resolve_profile_and_settings(db, case_id):
    settings = get_settings(db)
    if not settings or not settings.report_gen_llm_profile_id:
        raise HTTPException(status_code=400, detail="Report generation AI profile not configured")
    profile = crud_llm.get_by_id(db, settings.report_gen_llm_profile_id)
    if not profile or not profile.is_active:
        raise HTTPException(status_code=400, detail="AI profile not found or inactive")
    case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    specimens = (
        db.query(SurgicalSpecimen)
        .filter(SurgicalSpecimen.case_id == case_id)
        .order_by(SurgicalSpecimen.specimen_label)
        .all()
    )
    if not specimens:
        raise HTTPException(status_code=422, detail="No specimens found for this case")
    return settings, profile, case, specimens


def _build_request_parts(db: Session, body: "ReportGenRequest", case, specimens):
    draft_micro_map: dict[int, str] = {}
    if body.source in ("gross_and_micro", "micro_only") and body.draft_data:
        for s in body.draft_data.specimens:
            if s.microscopic_description:
                draft_micro_map[s.specimen_id] = _strip_html(s.microscopic_description)
    blocks_map = fetch_blocks_by_specimen(db, [s.id for s in specimens])
    is_individual = body.diagnosis_mode == "individual"
    clinical_ctx = _strip_html(case.clinical_diagnosis or "") or "Not provided"
    if is_individual:
        user_message = _build_individual_message(specimens, draft_micro_map, blocks_map, clinical_ctx, body.source)
    else:
        user_message = _build_combined_message(specimens, draft_micro_map, blocks_map, clinical_ctx, body.source)
    return user_message, is_individual


# --- Endpoints ---

@router.post("/{case_id}/generate-report-preview", dependencies=[Depends(CAN_WRITE_REPORT)])
def get_report_preview(case_id: int, body: "ReportGenRequest", db: Session = Depends(get_db)):
    settings, profile, case, specimens = _resolve_profile_and_settings(db, case_id)
    user_message, _ = _build_request_parts(db, body, case, specimens)
    system_prompt = get_report_gen_prompt(settings.report_gen_system_prompt)
    return {
        "profile_name": profile.display_name,
        "provider": profile.provider,
        "model": profile.model,
        "system_prompt": system_prompt,
        "user_message": user_message,
    }


@router.post("/{case_id}/generate-report", dependencies=[Depends(CAN_WRITE_REPORT)])
async def generate_report(case_id: int, body: ReportGenRequest, db: Session = Depends(get_db)):
    settings, profile, case, specimens = _resolve_profile_and_settings(db, case_id)

    if body.source != "micro_only":
        gross_available = any(s.gross_description for s in specimens)
        if not gross_available:
            raise HTTPException(status_code=422, detail="No gross descriptions available")

    user_message, is_individual = _build_request_parts(db, body, case, specimens)
    system_prompt = get_report_gen_prompt(settings.report_gen_system_prompt)

    try:
        raw = await call_llm(profile, system_prompt, user_message, max_tokens=2048, timeout=60.0)
        parsed = _parse_json_safe(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {str(e)}")

    if is_individual:
        spec_map = {s.id: s for s in specimens}
        results = []
        for item in parsed.get("results", []):
            spec = spec_map.get(item.get("specimen_id"))
            if spec:
                results.append({
                    "specimen_id": spec.id,
                    "specimen_label": spec.specimen_label,
                    "specimen_name": spec.specimen_name,
                    "microscopic_description": item.get("microscopic_description", ""),
                    "diagnosis": item.get("diagnosis", ""),
                })
        return {"mode": "individual", "specimens": results, "case_diagnosis_text": None}
    else:
        return {
            "mode": body.diagnosis_mode,
            "specimens": [],
            "case_diagnosis_text": parsed.get("case_diagnosis_text", ""),
        }


def _build_individual_message(
    specimens: list, draft_micro_map: dict[int, str], blocks_map: dict[int, list], clinical_ctx: str, source: str
) -> str:
    lines = [f"Clinical context: {clinical_ctx}", ""]
    for spec in specimens:
        lines.append(f"Specimen {spec.specimen_label} — {spec.specimen_name} (id={spec.id}):")
        if source != "micro_only":
            gross = _strip_html(spec.gross_description or "") or "Not provided"
            lines.append(f"  Gross: {gross}")
            submitted = build_submitted_sections_text(
                spec.specimen_label, spec.is_entirely_submitted, blocks_map.get(spec.id, [])
            )
            if submitted:
                lines.append(f"  {submitted}")
        if source != "gross_only":
            micro = draft_micro_map.get(spec.id, "Not provided")
            lines.append(f"  Microscopic: {micro}")
        lines.append("")
    lines.append(
        "Generate microscopic_description and diagnosis for each specimen. "
        "Use INDIVIDUAL mode JSON format."
    )
    return "\n".join(lines)


def _build_combined_message(
    specimens: list, draft_micro_map: dict[int, str], blocks_map: dict[int, list], clinical_ctx: str, source: str
) -> str:
    lines = [f"Clinical context: {clinical_ctx}", ""]
    for spec in specimens:
        lines.append(f"Specimen {spec.specimen_label} — {spec.specimen_name}:")
        if source != "micro_only":
            gross = _strip_html(spec.gross_description or "") or "Not provided"
            lines.append(f"  Gross: {gross}")
            submitted = build_submitted_sections_text(
                spec.specimen_label, spec.is_entirely_submitted, blocks_map.get(spec.id, [])
            )
            if submitted:
                lines.append(f"  {submitted}")
        if source != "gross_only":
            micro = draft_micro_map.get(spec.id, "Not provided")
            lines.append(f"  Microscopic: {micro}")
        lines.append("")
    lines.append(
        "Generate a single unified diagnosis covering all specimens. "
        "Use INTEGRATED/COMBINED mode JSON format with key 'case_diagnosis_text'."
    )
    return "\n".join(lines)
