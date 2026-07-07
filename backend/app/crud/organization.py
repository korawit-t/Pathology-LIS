from sqlalchemy.orm import Session
from datetime import date
from app.models.organization import (
    Hospital,
    Position,
    Title,
    MedicalScheme,
    Department as DepartmentModel,
    Holiday,
    SystemConfig,
)
from app.schemas.organization import (
    HospitalCreate,
    PositionCreate,
    HospitalUpdate,
    PositionUpdate,
    TitleCreate,
    TitleUpdate,
    MedicalSchemeCreate,
    MedicalSchemeUpdate,
    DepartmentCreate,
    DepartmentUpdate,
    Department as DepartmentSchema,
    HolidayCreate,
)


# --- Hospital CRUD ---
def get_hospitals(db: Session):
    return db.query(Hospital).all()


def create_hospital(db: Session, hospital: HospitalCreate):
    db_hospital = Hospital(**hospital.dict())
    db.add(db_hospital)
    db.commit()
    db.refresh(db_hospital)
    return db_hospital


def update_hospital(db: Session, hospital_id: int, hospital_data: HospitalUpdate):
    db_hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not db_hospital:
        return None

    for key, value in hospital_data.dict(exclude_unset=True).items():
        setattr(db_hospital, key, value)

    db.commit()
    db.refresh(db_hospital)
    return db_hospital


def update_hospital_logo(db: Session, hospital_id: int, logo_path: str):
    db_hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not db_hospital:
        return None
    db_hospital.logo_path = logo_path
    db.commit()
    db.refresh(db_hospital)
    return db_hospital


def delete_hospital(db: Session, hospital_id: int):
    db_hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if db_hospital:
        db.delete(db_hospital)
        db.commit()
        return True
    return False


def resolve_lab_header(hospital: Hospital | None, settings) -> tuple[str, str, str | None]:
    """(name_en, address, logo_relative_path) for the report header — the referring
    hospital's own branding when it has use_custom_report_header set, else the master
    SystemSetting's branding."""
    if hospital and hospital.use_custom_report_header:
        name = hospital.report_name_en or hospital.name
        return name, hospital.address or "", hospital.logo_path
    name = (settings.lab_name_en or settings.lab_name_th) if settings else "Laboratory Name"
    address = settings.lab_address if settings else ""
    return name, address, (settings.report_logo_url if settings else None)


def resolve_lab_short_name(hospital: Hospital | None, settings) -> str:
    """Short lab code stamped on slide/block stickers — the referring hospital's own
    short name when it has use_custom_report_header set, else the master SystemSetting's."""
    if hospital and hospital.use_custom_report_header:
        return hospital.report_short_name_en or hospital.name or ""
    return (settings.lab_short_name_en or "") if settings else ""


# --- Position CRUD ---
def get_positions(db: Session):
    return db.query(Position).all()


def create_position(db: Session, position: PositionCreate):
    db_position = Position(**position.dict())
    db.add(db_position)
    db.commit()
    db.refresh(db_position)
    return db_position


def update_position(db: Session, position_id: int, position_data: PositionUpdate):
    db_position = db.query(Position).filter(Position.id == position_id).first()
    if not db_position:
        return None

    for key, value in position_data.dict(exclude_unset=True).items():
        setattr(db_position, key, value)

    db.commit()
    db.refresh(db_position)
    return db_position


def delete_position(db: Session, position_id: int):
    db_pos = db.query(Position).filter(Position.id == position_id).first()
    if db_pos:
        db.delete(db_pos)
        db.commit()
        return True
    return False


# --- Title CRUD ---
def get_titles(db: Session):
    return db.query(Title).all()


def create_title(db: Session, title: TitleCreate):
    db_title = Title(**title.dict())
    db.add(db_title)
    db.commit()
    db.refresh(db_title)
    return db_title


def update_title(db: Session, title_id: int, title_data: TitleUpdate):
    db_title = db.query(Title).filter(Title.id == title_id).first()
    if not db_title:
        return None

    for key, value in title_data.dict(exclude_unset=True).items():
        setattr(db_title, key, value)

    db.commit()
    db.refresh(db_title)
    return db_title


def delete_title(db: Session, title_id: int):
    db_title = db.query(Title).filter(Title.id == title_id).first()
    if db_title:
        db.delete(db_title)
        db.commit()
        return True
    return False


# --- Medical Scheme CRUD (เพิ่ม Update และ Delete ให้แล้ว) ---
def get_medical_schemes(db: Session):
    return db.query(MedicalScheme).all()


def create_medical_scheme(db: Session, scheme: MedicalSchemeCreate):
    db_item = MedicalScheme(**scheme.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


def update_medical_scheme(
    db: Session, scheme_id: int, scheme_data: MedicalSchemeUpdate
):
    db_scheme = db.query(MedicalScheme).filter(MedicalScheme.id == scheme_id).first()
    if not db_scheme:
        return None

    for key, value in scheme_data.dict(exclude_unset=True).items():
        setattr(db_scheme, key, value)

    db.commit()
    db.refresh(db_scheme)
    return db_scheme


def delete_medical_scheme(db: Session, scheme_id: int):
    db_scheme = db.query(MedicalScheme).filter(MedicalScheme.id == scheme_id).first()
    if db_scheme:
        db.delete(db_scheme)
        db.commit()
        return True
    return False


# --- End of Medical Scheme CRUD ---


# --- Department CRUD ---
def get_department(db: Session, department_id: int):
    # ใช้ DepartmentModel แทน Department
    return db.query(DepartmentModel).filter(DepartmentModel.id == department_id).first()


def get_departments(
    db: Session, skip: int = 0, limit: int = 100, active_only: bool = False
):
    query = db.query(DepartmentModel)  # ใช้ DepartmentModel
    if active_only:
        query = query.filter(DepartmentModel.is_active == True)
    return query.offset(skip).limit(limit).all()


def create_department(db: Session, department: DepartmentCreate):
    db_dept = DepartmentModel(  # ใช้ DepartmentModel
        name=department.name, is_active=department.is_active
    )
    db.add(db_dept)
    db.commit()
    db.refresh(db_dept)
    return db_dept


def update_department(db: Session, department_id: int, department: DepartmentUpdate):
    db_dept = get_department(db, department_id)
    if not db_dept:
        return None

    # อัปเดตเฉพาะฟิลด์ที่ส่งมา (Exclude unset)
    update_data = department.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_dept, key, value)

    db.commit()
    db.refresh(db_dept)
    return db_dept


def delete_department(db: Session, department_id: int):
    db_dept = get_department(db, department_id)
    if db_dept:
        db.delete(db_dept)
        db.commit()
    return db_dept


def get_holidays(db: Session):
    return db.query(Holiday).order_by(Holiday.holiday_date.asc()).all()


def get_holiday_by_date(db: Session, holiday_date: date):
    return db.query(Holiday).filter(Holiday.holiday_date == holiday_date).first()


def create_holiday(db: Session, holiday: HolidayCreate):
    db_obj = Holiday(**holiday.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def delete_holiday(db: Session, holiday_id: int):
    db_obj = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if db_obj:
        db.delete(db_obj)
        db.commit()
        return True
    return False


def get_system_config(db: Session, key: str):
    return db.query(SystemConfig).filter(SystemConfig.key == key).first()


def set_system_config(db: Session, key: str, value: dict):
    obj = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if obj:
        obj.value = value
    else:
        obj = SystemConfig(key=key, value=value)
        db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def bulk_create_holidays(db: Session, holidays: list[dict]) -> tuple[int, int]:
    """Insert holidays, skipping dates that already exist. Returns (created, skipped)."""
    created, skipped = 0, 0
    for h in holidays:
        exists = db.query(Holiday).filter(Holiday.holiday_date == h["holiday_date"]).first()
        if exists:
            skipped += 1
        else:
            db.add(Holiday(holiday_date=h["holiday_date"], name=h["name"]))
            created += 1
    db.commit()
    return created, skipped
