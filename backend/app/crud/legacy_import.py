"""Import of old-system reports into the legacy report tables.

Preview and commit run the same analysis (analyze), so what the page showed
is what gets written: read the file, map each row, match hospitals, refuse a
reference repeated within the file, and find rows this source imported
before. Commit then inserts the new rows in one transaction with a batch
record; rolling the batch back deletes the rows it inserted.
"""

from __future__ import annotations

import hashlib
from collections import Counter
from dataclasses import dataclass
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_import import LegacyImportBatch, LegacyImportProfile
from app.models.legacy_nongyne_cyto_report import LegacyNongyneCytoReport
from app.models.legacy_surgical_report import LegacySurgicalReport
from app.models.organization import Hospital, Title
from app.schemas.legacy_import import ImportMapping, ProfileIn
from app.services import legacy_import_service as svc
from app.utils.time import local_now

MODEL_BY_TYPE = {
    "surgical": LegacySurgicalReport,
    "gyne": LegacyGyneCytoReport,
    "nongyne": LegacyNongyneCytoReport,
}

PREVIEW_SAMPLE_ROWS = 20
PREVIEW_MAX_ISSUES = 1000
_IN_CHUNK = 1000


def _chunks(items: list, size: int = _IN_CHUNK) -> Iterable[list]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _norm(s: str) -> str:
    return " ".join(s.split()).casefold()


# ── Analysis shared by preview and commit ────────────────────────────────────

@dataclass
class HospitalMatch:
    value: str
    count: int
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    matched_by: Optional[str] = None


@dataclass
class Analysis:
    table: svc.Table
    rows: list[svc.RowResult]
    hospitals: list[HospitalMatch]
    file_sha256: str
    same_file_batches: list[LegacyImportBatch]


def _titles(db: Session) -> list[str]:
    return [t for (t,) in db.query(Title.title).all()] + list(svc.BUILTIN_TITLES)


def _match_hospitals(values: Counter, mapping: ImportMapping, hospitals: list[Hospital]) -> dict[str, HospitalMatch]:
    by_id = {h.id: h for h in hospitals}
    by_code = {_norm(h.code): h for h in hospitals if h.code}
    by_name = {_norm(h.name): h for h in hospitals if h.name}
    chosen = {_norm(k): v for k, v in mapping.hospital_values.items()}
    out: dict[str, HospitalMatch] = {}
    for value, count in values.items():
        m = HospitalMatch(value=value, count=count)
        key = _norm(value)
        hospital, how = None, None
        if key in chosen and chosen[key] in by_id:
            hospital, how = by_id[chosen[key]], "mapping"
        elif key in by_code:
            hospital, how = by_code[key], "code"
        elif key in by_name:
            hospital, how = by_name[key], "name"
        if hospital:
            m.hospital_id, m.hospital_name, m.matched_by = hospital.id, hospital.name, how
        out[value] = m
    return out


def analyze(db: Session, data: bytes, mapping: ImportMapping) -> Analysis:
    table = svc.read_table(data, mapping.sheet, mapping.header_row)
    svc.check_mapping(mapping, table.headers)

    hospitals = db.query(Hospital).all()
    default_hospital = None
    if mapping.default_hospital_id is not None:
        default_hospital = next((h for h in hospitals if h.id == mapping.default_hospital_id), None)
        if default_hospital is None:
            raise svc.ImportFileError("ไม่พบโรงพยาบาลที่ตั้งเป็นค่าเริ่มต้น")

    titles = _titles(db)
    rows = [svc.map_row(n, cells, table.headers, mapping, titles) for n, cells in table.rows]

    # Hospitals: chosen on the page, else matched by code or name, else the
    # default for rows that have none.
    matches = _match_hospitals(Counter(r.hospital_value for r in rows if r.hospital_value), mapping, hospitals)
    hospital_mapped = svc.HOSPITAL in mapping.fields
    for r in rows:
        if r.hospital_value:
            m = matches[r.hospital_value]
            if m.hospital_id:
                r.values["hospital_id"], r.values["hospital_name"] = m.hospital_id, m.hospital_name
            else:
                r.errors.append((svc.HOSPITAL, f"ยังไม่ได้เลือกว่า “{r.hospital_value}” คือโรงพยาบาลไหน"))
        elif default_hospital:
            r.values["hospital_id"], r.values["hospital_name"] = default_hospital.id, default_hospital.name
        else:
            r.warnings.append((
                svc.HOSPITAL,
                "ไม่มีโรงพยาบาล บัญชีฝั่งโรงพยาบาลและแพทย์ผู้ส่งจะมองไม่เห็นรายงานนี้"
                if hospital_mapped else
                "ไม่ได้ระบุโรงพยาบาล บัญชีฝั่งโรงพยาบาลและแพทย์ผู้ส่งจะมองไม่เห็นรายงานนี้",
            ))

    # A reference twice in one file: the first row wins, the rest are refused.
    first_row: dict[str, int] = {}
    for r in rows:
        ref = r.values.get(svc.SOURCE_REF)
        if not ref:
            continue
        if ref in first_row:
            r.errors.append((svc.SOURCE_REF, f"รหัสอ้างอิง “{ref}” ซ้ำกับแถว {first_row[ref]}"))
        else:
            first_row[ref] = r.row

    model = MODEL_BY_TYPE[mapping.report_type]
    existing: dict[str, int] = {}
    for chunk in _chunks(list(first_row)):
        for row_id, ref in (
            db.query(model.id, model.source_ref)
            .filter(model.source_system == mapping.source_system, model.source_ref.in_(chunk))
        ):
            existing[ref] = row_id
    for r in rows:
        ref = r.values.get(svc.SOURCE_REF)
        if ref and ref in existing and first_row.get(ref) == r.row:
            r.existing_id = existing[ref]

    # The same accession number already in the table under another source
    # or reference, e.g. a report typed in by hand before the import existed.
    accessions = sorted({r.values["accession_no"] for r in rows if r.values.get("accession_no")})
    by_accession: dict[str, list[int]] = {}
    for chunk in _chunks(accessions):
        for row_id, acc in db.query(model.id, model.accession_no).filter(model.accession_no.in_(chunk)):
            by_accession.setdefault(acc, []).append(row_id)
    for r in rows:
        others = [i for i in by_accession.get(r.values.get("accession_no"), []) if i != r.existing_id]
        if others:
            r.warnings.append(("accession_no", "มี Accession No. นี้ในตาราง legacy อยู่แล้ว (นำเข้าจากที่อื่นหรือพิมพ์เอง) จะได้รายงานซ้ำกัน"))

    sha = hashlib.sha256(data).hexdigest()
    same_file = (
        db.query(LegacyImportBatch)
        .filter(LegacyImportBatch.file_sha256 == sha, LegacyImportBatch.status == "committed")
        .order_by(LegacyImportBatch.id.desc())
        .all()
    )
    hospital_list = sorted(matches.values(), key=lambda m: (m.hospital_id is not None, -m.count, m.value))
    return Analysis(table=table, rows=rows, hospitals=hospital_list, file_sha256=sha, same_file_batches=same_file)


# ── Inspect / preview / commit ───────────────────────────────────────────────

def inspect_file(data: bytes, file_name: Optional[str], report_type: str, sheet: Optional[str], header_row: int) -> dict:
    table = svc.read_table(data, sheet, header_row)
    return {
        "file_name": file_name,
        "sheets": table.sheets,
        "sheet": table.sheet,
        "headers": table.headers,
        "sample_rows": [[svc.cell_text(c) for c in cells] for _, cells in table.rows[:10]],
        "total_rows": len(table.rows),
        "suggested_fields": svc.suggest_fields(report_type, table.headers),
    }


def preview(db: Session, data: bytes, mapping: ImportMapping) -> dict:
    a = analyze(db, data, mapping)
    valid = [r for r in a.rows if not r.errors]
    issues = [
        {"row": r.row, "level": level, "field": f, "message": msg}
        for r in a.rows
        for level, items in (("error", r.errors), ("warning", r.warnings))
        for f, msg in items
    ]
    issues.sort(key=lambda i: (i["level"] != "error", i["row"]))
    return {
        "total_rows": len(a.rows),
        "valid_rows": len(valid),
        "error_rows": len(a.rows) - len(valid),
        "warning_rows": sum(1 for r in a.rows if r.warnings and not r.errors),
        "new_rows": sum(1 for r in valid if r.existing_id is None),
        "existing_rows": sum(1 for r in valid if r.existing_id is not None),
        "issues": issues[:PREVIEW_MAX_ISSUES],
        "issues_truncated": len(issues) > PREVIEW_MAX_ISSUES,
        "sample": [
            {"row": r.row, "existing": r.existing_id is not None,
             "values": {k: svc.json_value(v) for k, v in r.values.items()}}
            for r in valid[:PREVIEW_SAMPLE_ROWS]
        ],
        "hospital_values": [m.__dict__ for m in a.hospitals],
        "same_file_batches": [
            {"id": b.id, "created_at": b.created_at, "inserted_count": b.inserted_count}
            for b in a.same_file_batches
        ],
    }


def commit(
    db: Session,
    data: bytes,
    file_name: Optional[str],
    mapping: ImportMapping,
    skip_invalid: bool,
    current_user,
) -> LegacyImportBatch:
    a = analyze(db, data, mapping)
    invalid = [r for r in a.rows if r.errors]
    if invalid and not skip_invalid:
        raise HTTPException(
            status_code=422,
            detail=f"มี {len(invalid):,} แถวที่ยังมีข้อผิดพลาด แก้ไฟล์ก่อน หรือเลือกนำเข้าเฉพาะแถวที่ถูกต้อง",
        )
    valid = [r for r in a.rows if not r.errors]
    if not valid:
        raise HTTPException(status_code=422, detail="ไม่มีแถวที่นำเข้าได้")

    model = MODEL_BY_TYPE[mapping.report_type]
    batch = LegacyImportBatch(
        report_type=mapping.report_type,
        source_system=mapping.source_system,
        file_name=(file_name or "")[:255] or None,
        file_sha256=a.file_sha256,
        mapping=mapping.model_dump(mode="json"),
        total_rows=len(a.rows),
        inserted_count=0,
        updated_count=0,
        skipped_count=0,
        error_count=len(invalid),
        status="committed",
        created_by_id=current_user.id,
    )
    db.add(batch)
    db.flush()

    new_rows = [r for r in valid if r.existing_id is None]
    old_rows = [r for r in valid if r.existing_id is not None]
    try:
        for chunk in _chunks(new_rows):
            db.execute(insert(model), [
                {**r.values, "source_system": mapping.source_system, "import_batch_id": batch.id, "status": "published"}
                for r in chunk
            ])
        updated = 0
        if mapping.on_duplicate == "update":
            for chunk in _chunks(old_rows):
                objs = {o.id: o for o in db.query(model).filter(model.id.in_([r.existing_id for r in chunk]))}
                for r in chunk:
                    obj = objs.get(r.existing_id)
                    if obj is None:
                        continue
                    for key, value in r.values.items():
                        setattr(obj, key, value)
                    updated += 1
        batch.inserted_count = len(new_rows)
        batch.updated_count = updated
        batch.skipped_count = len(old_rows) - updated
        db.commit()
    except IntegrityError:
        # Another import of the same source committed between our duplicate
        # check and the insert.
        db.rollback()
        raise HTTPException(status_code=409, detail="มีการนำเข้าข้อมูลชุดเดียวกันพร้อมกัน ลองตรวจสอบอีกครั้ง")
    db.refresh(batch)
    return batch


# ── Batches ───────────────────────────────────────────────────────────────────

def list_batches(db: Session, skip: int, limit: int) -> tuple[int, list[LegacyImportBatch]]:
    q = db.query(LegacyImportBatch)
    total = q.count()
    items = q.order_by(LegacyImportBatch.id.desc()).offset(skip).limit(limit).all()
    return total, items


def rollback_batch(db: Session, batch_id: int, current_user) -> LegacyImportBatch:
    batch = (
        db.query(LegacyImportBatch)
        .filter(LegacyImportBatch.id == batch_id)
        .with_for_update()
        .first()
    )
    if batch is None:
        raise HTTPException(status_code=404, detail="ไม่พบรายการนำเข้านี้")
    if batch.status != "committed":
        raise HTTPException(status_code=409, detail="รายการนี้ถูกยกเลิกไปแล้ว")
    model = MODEL_BY_TYPE[batch.report_type]
    deleted = (
        db.query(model)
        .filter(model.import_batch_id == batch.id)
        .delete(synchronize_session=False)
    )
    batch.status = "rolled_back"
    batch.rolled_back_at = local_now()
    batch.rolled_back_by_id = current_user.id
    batch.rolled_back_count = deleted
    db.commit()
    db.refresh(batch)
    return batch


def batch_out(batch: LegacyImportBatch) -> dict:
    return {
        **{c.name: getattr(batch, c.name) for c in batch.__table__.columns if c.name not in ("mapping", "file_sha256")},
        "created_by_name": (batch.created_by.full_name or batch.created_by.username) if batch.created_by else None,
        "rolled_back_by_name": (batch.rolled_back_by.full_name or batch.rolled_back_by.username) if batch.rolled_back_by else None,
    }


# ── Profiles ──────────────────────────────────────────────────────────────────

def list_profiles(db: Session, report_type: Optional[str] = None) -> list[LegacyImportProfile]:
    q = db.query(LegacyImportProfile)
    if report_type:
        q = q.filter(LegacyImportProfile.report_type == report_type)
    return q.order_by(LegacyImportProfile.name).all()


def _name_taken(db: Session, name: str, exclude_id: Optional[int] = None) -> bool:
    q = db.query(LegacyImportProfile.id).filter(LegacyImportProfile.name == name)
    if exclude_id is not None:
        q = q.filter(LegacyImportProfile.id != exclude_id)
    return q.first() is not None


def create_profile(db: Session, body: ProfileIn, current_user) -> LegacyImportProfile:
    if _name_taken(db, body.name):
        raise HTTPException(status_code=409, detail="มีชื่อ mapping นี้แล้ว")
    profile = LegacyImportProfile(
        name=body.name,
        report_type=body.mapping.report_type,
        mapping=body.mapping.model_dump(mode="json"),
        created_by_id=current_user.id,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_profile(db: Session, profile_id: int, body: ProfileIn) -> LegacyImportProfile:
    profile = db.query(LegacyImportProfile).filter(LegacyImportProfile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="ไม่พบ mapping นี้")
    if _name_taken(db, body.name, exclude_id=profile_id):
        raise HTTPException(status_code=409, detail="มีชื่อ mapping นี้แล้ว")
    profile.name = body.name
    profile.report_type = body.mapping.report_type
    profile.mapping = body.mapping.model_dump(mode="json")
    db.commit()
    db.refresh(profile)
    return profile


def delete_profile(db: Session, profile_id: int) -> None:
    profile = db.query(LegacyImportProfile).filter(LegacyImportProfile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="ไม่พบ mapping นี้")
    db.delete(profile)
    db.commit()
