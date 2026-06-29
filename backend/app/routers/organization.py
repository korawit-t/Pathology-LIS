from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.db.database import get_db
from app.schemas.organization import (
    HospitalCreate,
    HospitalResponse,
    HospitalUpdate,
    PositionCreate,
    PositionResponse,
    PositionUpdate,
    TitleCreate,
    TitleResponse,
    TitleUpdate,
    MedicalSchemeCreate,
    MedicalSchemeResponse,
    DepartmentCreate,
    DepartmentUpdate,
    Department,
    HolidayCreate,
    HolidayResponse,
    HolidayUpdate,
)
from app.crud import organization as crud
from app.dependencies.auth import RoleChecker, get_current_user
from app.core.roles import CAN_MANAGE_SETTINGS
from app.utils.time import local_now

router = APIRouter(prefix="/org", tags=["Organization"])

# --- Hospitals Endpoints ---


# 🔓 ดูรายชื่อ รพ. (ให้ User ทุกคนที่ Login แล้วดูได้ เพื่อเอาไปใส่ Dropdown)
@router.get(
    "/hospitals",
    response_model=List[HospitalResponse],
    dependencies=[Depends(get_current_user)],
)
def read_hospitals(db: Session = Depends(get_db)):
    return crud.get_hospitals(db)


# 🔒 สร้าง รพ. (เฉพาะ Admin)
@router.post(
    "/hospitals",
    response_model=HospitalResponse,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def create_new_hospital(hospital: HospitalCreate, db: Session = Depends(get_db)):
    return crud.create_hospital(db, hospital)


# 🔒 แก้ไข รพ. (เฉพาะ Admin)
@router.put(
    "/hospitals/{hospital_id}",
    response_model=HospitalResponse,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def update_existing_hospital(
    hospital_id: int, hospital: HospitalUpdate, db: Session = Depends(get_db)
):
    updated = crud.update_hospital(db, hospital_id, hospital)
    if not updated:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return updated


# 🔒 ลบ รพ. (เฉพาะ Admin)
@router.delete("/hospitals/{hospital_id}", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def delete_existing_hospital(hospital_id: int, db: Session = Depends(get_db)):
    success = crud.delete_hospital(db, hospital_id)
    if not success:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {"message": "Hospital deleted"}


# --- Positions Endpoints ---


# 🔓 ดูตำแหน่ง (ทุกคนดูได้)
@router.get(
    "/positions",
    response_model=List[PositionResponse],
    dependencies=[Depends(get_current_user)],
)
def read_positions(db: Session = Depends(get_db)):
    return crud.get_positions(db)


# 🔒 สร้างตำแหน่ง (เฉพาะ Admin)
@router.post(
    "/positions",
    response_model=PositionResponse,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def create_new_position(position: PositionCreate, db: Session = Depends(get_db)):
    return crud.create_position(db, position)


@router.put(
    "/positions/{position_id}",
    response_model=PositionResponse,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def update_existing_position(
    position_id: int, position: PositionUpdate, db: Session = Depends(get_db)
):
    # เราต้องไปเพิ่มฟังก์ชัน update_position ใน crud/organization.py ด้วยนะ
    updated = crud.update_position(db, position_id, position)
    if not updated:
        raise HTTPException(status_code=404, detail="Position not found")
    return updated


# 🔒 ลบตำแหน่ง (เฉพาะ Admin)
@router.delete("/positions/{position_id}", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def delete_existing_position(position_id: int, db: Session = Depends(get_db)):
    success = crud.delete_position(db, position_id)
    if not success:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"message": "Position deleted"}


# --- Titles Endpoints ---


# 🔓 ดูคำนำหน้า (ทุกคนดูได้ เอาไว้ใส่ Dropdown)
@router.get(
    "/titles",
    response_model=List[TitleResponse],
    dependencies=[Depends(get_current_user)],
)
def read_titles(db: Session = Depends(get_db)):
    return crud.get_titles(db)


@router.post(
    "/titles", response_model=TitleResponse, dependencies=[Depends(get_current_user)]
)
def create_new_title(title: TitleCreate, db: Session = Depends(get_db)):
    return crud.create_title(db, title)


# 🔒 แก้ไขคำนำหน้า (Admin Only)
@router.put(
    "/titles/{title_id}",
    response_model=TitleResponse,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def update_existing_title(
    title_id: int, title: TitleUpdate, db: Session = Depends(get_db)
):
    updated = crud.update_title(db, title_id, title)
    if not updated:
        raise HTTPException(status_code=404, detail="Title not found")
    return updated


# 🔒 ลบคำนำหน้า (Admin Only)
@router.delete("/titles/{title_id}", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def delete_existing_title(title_id: int, db: Session = Depends(get_db)):
    success = crud.delete_title(db, title_id)
    if not success:
        raise HTTPException(status_code=404, detail="Title not found")
    return {"message": "Title deleted"}


@router.get(
    "/medical-schemes",
    response_model=List[MedicalSchemeResponse],
    dependencies=[Depends(get_current_user)],
)
def read_medical_schemes(db: Session = Depends(get_db)):
    return crud.get_medical_schemes(db)


@router.post(
    "/medical-schemes",
    response_model=MedicalSchemeResponse,
    dependencies=[Depends(get_current_user)],
)
def create_medical_scheme(scheme: MedicalSchemeCreate, db: Session = Depends(get_db)):
    return crud.create_medical_scheme(db, scheme)


# --- Department Endpoints ---


# 🔓 ดูรายชื่อแผนก (ทุกคนดูได้ เพื่อใช้ใน Dropdown หน้าลงทะเบียน)
@router.get(
    "/departments",
    response_model=List[Department],
    dependencies=[Depends(get_current_user)],
)
def read_departments(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    return crud.get_departments(db, skip=skip, limit=limit, active_only=active_only)


@router.post(
    "/departments",
    response_model=Department,
    dependencies=[Depends(get_current_user)],
)
def create_new_department(dept: DepartmentCreate, db: Session = Depends(get_db)):
    return crud.create_department(db=db, department=dept)


# 🔓 ดูรายละเอียดรายแผนก
@router.get(
    "/departments/{department_id}",
    response_model=Department,
    dependencies=[Depends(get_current_user)],
)
def read_department(department_id: int, db: Session = Depends(get_db)):
    db_dept = crud.get_department(db, department_id=department_id)
    if db_dept is None:
        raise HTTPException(status_code=404, detail="Department not found")
    return db_dept


# 🔒 แก้ไขแผนก (เฉพาะ Admin)
@router.patch(
    "/departments/{department_id}",
    response_model=Department,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def update_existing_department(
    department_id: int, dept: DepartmentUpdate, db: Session = Depends(get_db)
):
    updated = crud.update_department(db, department_id, dept)
    if not updated:
        raise HTTPException(status_code=404, detail="Department not found")
    return updated


# 🔒 ลบแผนก (เฉพาะ Admin) - แนะนำให้ใช้ Soft Delete ผ่าน Patch is_active แทน
@router.delete(
    "/departments/{department_id}", dependencies=[Depends(CAN_MANAGE_SETTINGS)]
)
def delete_existing_department(department_id: int, db: Session = Depends(get_db)):
    success = crud.delete_department(db, department_id)
    if not success:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"message": "Department deleted"}


# --- Holidays Endpoints ---


# 🔓 ดูรายการวันหยุดทั้งหมด (ทุกคนที่ Login ดูได้เพื่อใช้คำนวณ TAT)
@router.get(
    "/holidays",
    response_model=List[HolidayResponse],
    dependencies=[Depends(get_current_user)],
)
def read_holidays(db: Session = Depends(get_db)):
    return crud.get_holidays(db)


# 🔒 เพิ่มวันหยุด (Admin Only)
@router.post(
    "/holidays",
    response_model=HolidayResponse,
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)
def create_new_holiday(holiday: HolidayCreate, db: Session = Depends(get_db)):
    # ตรวจสอบก่อนว่ามีวันที่นี้อยู่แล้วหรือไม่ (เพื่อป้องกัน Unique constraint error)
    db_holiday = crud.get_holiday_by_date(db, holiday_date=holiday.holiday_date)
    if db_holiday:
        raise HTTPException(status_code=400, detail="Holiday date already exists")
    return crud.create_holiday(db, holiday)


# 🔒 ลบวันหยุด (Admin Only)
@router.delete("/holidays/{holiday_id}", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def delete_existing_holiday(holiday_id: int, db: Session = Depends(get_db)):
    success = crud.delete_holiday(db, holiday_id)
    if not success:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"message": "Holiday deleted"}


# --- Google Calendar Config Endpoints ---

def _resolve_api_key(db: Session) -> str:
    """Return the API key from DB config, falling back to the GOOGLE_CALENDAR_API_KEY env var."""
    import os
    config_obj = crud.get_system_config(db, "google_calendar")
    if config_obj and config_obj.value and config_obj.value.get("api_key"):
        return config_obj.value["api_key"]
    return os.environ.get("GOOGLE_CALENDAR_API_KEY", "")


@router.get("/config/google-calendar", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def get_google_calendar_config(db: Session = Depends(get_db)):
    import os
    obj = crud.get_system_config(db, "google_calendar")
    env_key = os.environ.get("GOOGLE_CALENDAR_API_KEY", "")
    default_cal = "th.th#holiday@group.v.calendar.google.com"

    if not obj or not obj.value:
        # Show env key (masked) if set, otherwise blank
        masked_env = ("*" * max(0, len(env_key) - 4)) + env_key[-4:] if env_key else ""
        return {"api_key": masked_env, "calendar_id": default_cal, "source": "env" if env_key else "none"}

    val = obj.value.copy()
    raw_key = val.get("api_key") or env_key
    if raw_key:
        val["api_key"] = ("*" * max(0, len(raw_key) - 4)) + raw_key[-4:]
    val.setdefault("calendar_id", default_cal)
    val["source"] = "db" if val.get("api_key") else "env"
    return val


@router.put("/config/google-calendar", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def save_google_calendar_config(
    payload: dict,
    db: Session = Depends(get_db),
):
    existing = crud.get_system_config(db, "google_calendar")
    # If the api_key being saved is masked (all *), keep the existing one
    api_key = payload.get("api_key", "")
    if api_key and set(api_key[:-4]) == {"*"} and existing and existing.value:
        payload["api_key"] = existing.value.get("api_key", api_key)
    crud.set_system_config(db, "google_calendar", payload)
    return {"message": "Config saved"}


@router.post("/holidays/import-google-calendar", dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def import_holidays_from_google_calendar(
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Fetch events from a Google Calendar and bulk-import as holidays.
    payload: { year: int, calendar_id?: str }
    Uses the stored api_key from system config.
    """
    import httpx
    from datetime import datetime, timezone
    from urllib.parse import quote

    api_key = _resolve_api_key(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="Google Calendar API key not configured")

    config_obj = crud.get_system_config(db, "google_calendar")
    year: int = payload.get("year", local_now().year)
    calendar_id: str = payload.get(
        "calendar_id",
        (config_obj.value.get("calendar_id") if config_obj and config_obj.value else None)
        or "th.th#holiday@group.v.calendar.google.com",
    )

    time_min = f"{year}-01-01T00:00:00Z"
    time_max = f"{year}-12-31T23:59:59Z"

    try:
        resp = httpx.get(
            f"https://www.googleapis.com/calendar/v3/calendars/{quote(calendar_id, safe='')}/events",
            params={
                "key": api_key,
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "maxResults": 500,
            },
            timeout=15,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Google Calendar API error: {e.response.status_code}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Google Calendar: {str(e)}")

    events = resp.json().get("items", [])
    holidays = []
    for event in events:
        start = event.get("start", {})
        event_date_str = start.get("date") or start.get("dateTime", "")[:10]
        if not event_date_str:
            continue
        try:
            event_date = date.fromisoformat(event_date_str)
        except ValueError:
            continue
        holidays.append({"holiday_date": event_date, "name": event.get("summary", "Holiday")})

    created, skipped = crud.bulk_create_holidays(db, holidays)
    return {"created": created, "skipped": skipped, "total_fetched": len(holidays)}
