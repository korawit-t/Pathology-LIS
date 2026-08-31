"""
การ์ดกันการแก้ "เนื้อหารายงาน" ของเคสที่ปิดไปแล้ว

หน้าบ้านซ่อนปุ่มแก้ไขอยู่แล้ว (``isLocked`` / ``isFormLocked``) แต่ไม่มีอะไร
กันการยิง API ตรง — รูปของรายงานที่ออกผลไปแล้วจึงยังถูกเพิ่ม แทนที่ แก้ caption
หรือลบได้ ไฟล์นี้ย้ายเงื่อนไขเดียวกันมาบังคับฝั่ง server

ใช้ 423 Locked ตามแบบ :mod:`app.utils.consult_lock` ที่มีอยู่ก่อน — เป็น
"สถานะของทรัพยากรไม่ยอมให้ทำ" ไม่ใช่ปัญหาสิทธิ์ (นั่นคือ 403 ที่ RoleChecker
จัดการอยู่แล้ว)
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.enums.case_states import SURGICAL_SIGNED, is_content_locked
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.surgical_case import SurgicalCase
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import SurgicalReport
from app.models.surgical_specimen import SurgicalSpecimen

_DETAIL = (
    "Case is locked (status: {status}). Images cannot be added, replaced, "
    "edited, or removed once the report has been signed out, published, "
    "cancelled, or sent for approval."
)


def _locked(status: str | None) -> HTTPException:
    return HTTPException(status_code=423, detail=_DETAIL.format(status=status or "unknown"))


def assert_surgical_case_unlocked(db: Session, case: SurgicalCase | None) -> None:
    """
    มิเรอร์สูตร ``isLocked`` ของ ``useSurgicalReport`` แบบตรงตัว:

    1. มีรายงานรออนุมัติอยู่ → ล็อก
    2. สถานะเคสอยู่ใน ``SURGICAL_CONTENT_LOCKED`` → ล็อก
    3. ยกเว้นเคส ``signed out`` ที่มี diagnosis ยังเป็น draft ค้างอยู่ → ปลดล็อก
       การมี draft ค้าง = กำลังทำ addendum ซึ่งตั้งใจให้แก้เนื้อหาได้ นี่คือ
       ร่องรอยฝั่ง server อย่างเดียวที่บอกได้ว่า addendum กำลังเปิดอยู่
       (``isAddendumMode`` เองเป็น state ในเบราว์เซอร์ล้วน ๆ)
       เคสที่ยกเลิกหรือรอ peer review ไม่ได้รับข้อยกเว้นนี้ — ไม่มี flow ไหน
       แก้เคสพวกนั้นอย่างถูกต้อง (หน้าบ้านไม่ได้เช็ค "cancelled" ไว้ แต่
       เพิ่มเข้ามาเพราะไม่มีทางไปชนการใช้งานจริง)

    เคสที่หาไม่เจอปล่อยผ่าน — ให้ endpoint เป็นคนตอบ 404 เอง
    """
    if case is None:
        return

    # รายงานที่รออนุมัติล็อกได้แม้สถานะเคสจะยังไม่ขยับ
    # ReportStatus เป็น PG enum ที่มีแค่ draft/pending/published/cancelled —
    # "pending_approval" ที่หน้าบ้านเช็คคู่กันไว้เป็นค่าที่เกิดขึ้นไม่ได้จริง
    awaiting_approval = (
        db.query(SurgicalReport.id)
        .filter(SurgicalReport.case_id == case.id, SurgicalReport.status == "pending")
        .first()
        is not None
    )
    if awaiting_approval:
        raise _locked(case.status)

    if not is_content_locked(case.status, "surgical"):
        return

    # มีแต่ "signed out" เท่านั้นที่ปลดล็อกได้ด้วย draft ที่ค้างอยู่ — เคสที่
    # ยกเลิกหรือกำลังรอ peer review ไม่มีทางแก้ที่ถูกต้อง แม้จะมี draft ค้าง
    if case.status in SURGICAL_SIGNED:
        has_open_draft = (
            db.query(SurgicalDiagnosis.id)
            .filter(
                SurgicalDiagnosis.case_id == case.id,
                SurgicalDiagnosis.status == "draft",
            )
            .first()
            is not None
        )
        if has_open_draft:
            return

    raise _locked(case.status)


def assert_surgical_specimen_unlocked(db: Session, specimen_id: int) -> None:
    """Gross และ microscopic image ผูกกับ specimen — ไล่กลับไปหาเคสก่อน."""
    case = (
        db.query(SurgicalCase)
        .join(SurgicalSpecimen, SurgicalSpecimen.case_id == SurgicalCase.id)
        .filter(SurgicalSpecimen.id == specimen_id)
        .first()
    )
    assert_surgical_case_unlocked(db, case)


def assert_gyne_case_unlocked(case: GyneCytologyCase | None) -> None:
    """
    Cytology ตัดสินจากสถานะล้วน ๆ ต่างจาก surgical

    โหมดแก้ผล (``isRevision``) เป็น state ในเบราว์เซอร์ล้วน ๆ ไม่มีร่องรอยฝั่ง
    server จนกว่าจะกดบันทึกครั้งแรก ซึ่งตอนนั้น ``revise_diagnosis`` จะเปลี่ยน
    สถานะเป็น ``revised`` ที่ไม่อยู่ในเซ็ตล็อก — แปลว่าการแก้ผลต้องบันทึก
    diagnosis หนึ่งครั้งก่อน แล้วรูปถึงจะแก้ได้ เป็นการแลกที่ตั้งใจ
    """
    if case is None:
        return
    if is_content_locked(case.status, "gyne"):
        raise _locked(case.status)


def assert_nongyne_case_unlocked(case: NongyneCytologyCase | None) -> None:
    """เหมือน :func:`assert_gyne_case_unlocked` — ดูคำอธิบายที่นั่น."""
    if case is None:
        return
    if is_content_locked(case.status, "nongyne"):
        raise _locked(case.status)


def assert_gyne_case_id_unlocked(db: Session, case_id: int) -> None:
    """สำหรับ endpoint ที่มีแต่ image row อยู่ในมือ ยังไม่ได้ดึงเคส."""
    assert_gyne_case_unlocked(db.get(GyneCytologyCase, case_id))


def assert_nongyne_case_id_unlocked(db: Session, case_id: int) -> None:
    """สำหรับ endpoint ที่มีแต่ image row อยู่ในมือ ยังไม่ได้ดึงเคส."""
    assert_nongyne_case_unlocked(db.get(NongyneCytologyCase, case_id))
