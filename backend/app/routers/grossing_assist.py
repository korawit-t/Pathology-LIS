from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from html.parser import HTMLParser
import json

from app.db.database import get_db
from app.models.surgical_specimen import SurgicalSpecimen
from app.core.roles import CAN_ACCESS_GROSSING_ASSIST
from app.core.prompts import get_grossing_assist_prompt
from app.crud import llm_profile as crud_llm
from app.crud.system_setting import get_settings
from app.services.llm_service import call_llm
from app.utils.submitted_sections import build_submitted_sections_text, fetch_blocks_by_specimen

router = APIRouter(prefix="/surgical-cases", tags=["Grossing Assistant"])


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str):
        self._parts.append(data)


def _strip_html(html: str) -> str:
    s = _HTMLStripper()
    s.feed(html)
    return " ".join(part.strip() for part in s._parts if part.strip())


def _build_specimens_text(db: Session, case_id: int) -> str | None:
    specimens = (
        db.query(SurgicalSpecimen)
        .filter(SurgicalSpecimen.case_id == case_id)
        .order_by(SurgicalSpecimen.specimen_label)
        .all()
    )
    blocks_map = fetch_blocks_by_specimen(db, [s.id for s in specimens])

    parts: list[str] = []
    for spec in specimens:
        gross = _strip_html(spec.gross_description or "")
        submitted = build_submitted_sections_text(
            spec.specimen_label, spec.is_entirely_submitted, blocks_map.get(spec.id, [])
        )
        if not gross and not submitted:
            continue
        lines = [f"Specimen {spec.specimen_label} — {spec.specimen_name}:"]
        if gross:
            lines.append(f"  Gross: {gross}")
        if submitted:
            lines.append(f"  {submitted}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts) if parts else None


def _require_enabled(db: Session) -> None:
    settings = get_settings(db)
    if not settings or not settings.grossing_assist_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Grossing assistant is disabled")


@router.get("/{case_id}/grossing-assist-preview", dependencies=[Depends(CAN_ACCESS_GROSSING_ASSIST)])
def get_grossing_assist_preview(case_id: int, db: Session = Depends(get_db)):
    _require_enabled(db)
    settings = get_settings(db)
    if not settings or not settings.grossing_assist_llm_profile_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not configured")

    profile = crud_llm.get_by_id(db, settings.grossing_assist_llm_profile_id)
    if not profile or not profile.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not found or inactive")

    system_prompt = get_grossing_assist_prompt(settings.grossing_assist_system_prompt)
    specimens_text = _build_specimens_text(db, case_id)

    return {
        "profile_name": profile.display_name,
        "provider": profile.provider,
        "model": profile.model,
        "system_prompt": system_prompt,
        "specimens_text": specimens_text,
    }


@router.post("/{case_id}/grossing-assist", dependencies=[Depends(CAN_ACCESS_GROSSING_ASSIST)])
async def run_grossing_assist(case_id: int, db: Session = Depends(get_db)):
    _require_enabled(db)
    settings = get_settings(db)
    if not settings or not settings.grossing_assist_llm_profile_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not configured")

    profile = crud_llm.get_by_id(db, settings.grossing_assist_llm_profile_id)
    if not profile or not profile.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI profile not found or inactive")

    specimens_text = _build_specimens_text(db, case_id)
    if not specimens_text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No gross descriptions found for this case")

    system_prompt = get_grossing_assist_prompt(settings.grossing_assist_system_prompt)
    try:
        raw = await call_llm(profile, system_prompt, specimens_text)
        result = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM error: {str(e)}")

    return {"feedback": result.get("feedback", "")}
