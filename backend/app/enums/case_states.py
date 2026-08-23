"""
แหล่งความจริงเดียวของสถานะเคส (case-level workflow status).

ที่มา: สถานะถูกเก็บเป็น ``Column(String)`` เปล่า ไม่มี constraint ระดับ DB
ก่อนหน้านี้จึงมีการ "ไล่รายชื่อสถานะด้วยมือ" กระจายอยู่หลายจุด แล้วแต่ละจุด
หลุดจากความจริงคนละแบบ (``sectioned`` หายไปจากสองเซ็ต, ``formalin_fixing``
กับ ``reported`` ถูกใส่ไว้ทั้งที่ไม่มีโค้ดไหนเขียนลงคอลัมน์นี้)

หลักการของไฟล์นี้: **ประกาศลำดับ pipeline ครั้งเดียว แล้วคำนวณเซ็ตที่เหลือ
ออกมาจากลำดับนั้น** เพิ่มขั้นตอนใหม่ = แก้ tuple เดียว ทุกที่ที่ใช้อัปเดตตาม

ไฟล์นี้ไม่แตะค่าที่เก็บใน DB — เป็นการรวมศูนย์ "การอ่าน" เท่านั้น
การ normalize ค่าจริง (เช่นทำให้ surgical กับ cytology ใช้คำเดียวกัน)
เป็นงานคนละก้อนที่ต้องมี migration
"""

from typing import Final, Iterable

# ═══════════════════════════════════════════════════════════════════
#  SURGICAL
# ═══════════════════════════════════════════════════════════════════

# ลำดับหลัก — เดินหน้าอย่างเดียว ใช้ตัดสินว่า "เลยขั้นไหนไปแล้ว"
SURGICAL_SPINE: Final[tuple[str, ...]] = (
    "registered",          # models/surgical_case.py:50 (column default)
    "in progress",         # crud/surgical_specimen.py:72
    "grossed",             # crud/surgical_specimen.py:68
    "processed",           # crud/tissue_processing.py:418
    "embedded",            # crud/embedding.py:110
    "sectioned",           # crud/sectioning.py:39
    "stained",             # crud/surgical_block_stain.py:60
    "slide sent",          # crud/slide_dispatch.py:140
    "pending diagnosis",   # crud/surgical_block_stain.py:60
)

# รอผลย้อมเพิ่ม — แตกออกจากช่วงวินิจฉัยแล้ววนกลับ ไม่ใช่ขั้นในลำดับหลัก
SURGICAL_STAIN_HOLDS: Final[tuple[str, ...]] = (
    "pending special stains",   # crud/surgical_block_stain.py:48
    "pending immuno",           # crud/surgical_block_stain.py:46
)

# รออนุมัติ — มีเฉพาะเมื่อ system_settings.enable_approve_system เปิด
SURGICAL_REVIEW: Final[tuple[str, ...]] = (
    "pending peer review",      # crud/surgical_report.py:452
)

# ปิดเคสแล้ว ไม่มีทางกลับ
SURGICAL_CLOSED: Final[tuple[str, ...]] = (
    "signed out",               # crud/surgical_report.py:455, crud/report_crud.py:70
    "cancelled",                # crud/surgical_case.py:290
)


# ═══════════════════════════════════════════════════════════════════
#  GYNE CYTOLOGY
# ═══════════════════════════════════════════════════════════════════

GYNE_SPINE: Final[tuple[str, ...]] = (
    "registered",          # column default
    "stained",             # crud/gyne_cyto_stain.py:143
    "screened",            # crud/gyne_cyto_report.py:523, crud/gyne_report_crud.py:92
)

GYNE_REVIEW: Final[tuple[str, ...]] = (
    "pending_review",      # crud/gyne_cyto_report.py:388 (abnormal), :453 (สุ่ม NILM)
)

GYNE_CLOSED: Final[tuple[str, ...]] = (
    "published",           # crud/gyne_cyto_report.py:471, :545
    "revised",             # crud/gyne_diagnosis.py:104 — แก้ผลที่ออกไปแล้ว
    "cancelled",           # crud/gyne_cyto_case.py:511
)


# ═══════════════════════════════════════════════════════════════════
#  NON-GYNE CYTOLOGY
# ═══════════════════════════════════════════════════════════════════

NONGYNE_SPINE: Final[tuple[str, ...]] = (
    "registered",          # column default
    "stained",             # crud/nongyne_cyto_stain.py:143
    "slide sent",          # crud/slide_dispatch.py:147
    "screened",            # crud/nongyne_cyto_report.py:625
)

NONGYNE_REVIEW: Final[tuple[str, ...]] = (
    "pending_approval",    # crud/nongyne_cyto_report.py:349
)

NONGYNE_CLOSED: Final[tuple[str, ...]] = (
    "published",           # crud/nongyne_cyto_report.py:349, :616
    "cancelled",           # crud/nongyne_cyto_case.py:355
)


# ═══════════════════════════════════════════════════════════════════
#  เซ็ตที่คำนวณออกมา — ห้ามไล่พิมพ์เพิ่มด้วยมือ
# ═══════════════════════════════════════════════════════════════════

def _catalogue(*groups: Iterable[str]) -> frozenset[str]:
    return frozenset(s for g in groups for s in g)


SURGICAL_ALL: Final = _catalogue(
    SURGICAL_SPINE, SURGICAL_STAIN_HOLDS, SURGICAL_REVIEW, SURGICAL_CLOSED
)
GYNE_ALL: Final = _catalogue(GYNE_SPINE, GYNE_REVIEW, GYNE_CLOSED)
NONGYNE_ALL: Final = _catalogue(NONGYNE_SPINE, NONGYNE_REVIEW, NONGYNE_CLOSED)

# "จบแล้ว" ต่างกันตามชนิดเคส — นี่คือสาเหตุที่ query ข้ามชนิดเคส
# ด้วย status == "published" เฉย ๆ ถึงตกเคส surgical ทั้งหมด
SURGICAL_TERMINAL: Final = frozenset(SURGICAL_CLOSED)
GYNE_TERMINAL: Final = frozenset(GYNE_CLOSED) - {"revised"}   # revised ยังแก้ต่อได้
NONGYNE_TERMINAL: Final = frozenset(NONGYNE_CLOSED)

SURGICAL_ACTIVE: Final = SURGICAL_ALL - SURGICAL_TERMINAL
GYNE_ACTIVE: Final = GYNE_ALL - GYNE_TERMINAL
NONGYNE_ACTIVE: Final = NONGYNE_ALL - NONGYNE_TERMINAL

# ใช้นับยอดในแดชบอร์ด (status.in_(...)) — คือทุกสถานะที่ยังไม่ปิดเคส
SURGICAL_PIPELINE: Final = SURGICAL_ACTIVE

CATALOGUE: Final[dict[str, frozenset[str]]] = {
    "surgical": SURGICAL_ALL,
    "gyne": GYNE_ALL,
    "nongyne": NONGYNE_ALL,
}


# ── อันดับสำหรับ guard "ห้ามถอยหลัง" ────────────────────────────────
#
# ใช้เฉพาะกับการ์ดกันสถานะถอยหลังเท่านั้น ไม่ใช่ลำดับเวลาจริงของเคส
# มีหลายจุดที่ตั้งใจถอยสถานะกลับ (ยกเลิก slide dispatch → "stained",
# เคลียร์รายการย้อมค้าง → "stained") จุดพวกนั้นสั่ง assign ตรง ๆ
# ไม่ควรมาผ่านฟังก์ชันนี้

def _build_rank(
    spine: tuple[str, ...],
    holds: tuple[str, ...] = (),
    review: tuple[str, ...] = (),
    closed: tuple[str, ...] = (),
) -> dict[str, int]:
    rank = {s: i for i, s in enumerate(spine)}
    tail = len(spine)
    rank.update({s: tail for s in holds})
    rank.update({s: tail + 1 for s in review})
    rank.update({s: tail + 2 for s in closed})
    return rank


_SURGICAL_RANK: Final = _build_rank(
    SURGICAL_SPINE, SURGICAL_STAIN_HOLDS, SURGICAL_REVIEW, SURGICAL_CLOSED
)


def surgical_at_or_past(status: str | None, stage: str) -> bool:
    """
    True ถ้า ``status`` อยู่ที่ ``stage`` แล้วหรือเลยไปแล้ว

    ใช้แทนเซ็ตที่ไล่รายชื่อด้วยมือ เช่น ``POST_GROSS_STATUSES``:

        if not surgical_at_or_past(case.status, "grossed"):
            case.status = "grossed"

    สถานะที่ไม่รู้จักจะได้ ``False`` เสมอ (เหมือนพฤติกรรมเดิมที่
    ค่านอกเซ็ตถือว่ายังไม่เลยขั้น) — ให้ ``test_status_catalogue``
    เป็นตัวจับว่ามีสถานะใหม่โผล่มาโดยไม่ได้ลงทะเบียนที่นี่
    """
    if stage not in _SURGICAL_RANK:
        raise ValueError(f"ไม่รู้จักขั้นตอน {stage!r} — ต้องอยู่ใน SURGICAL_SPINE")
    return _SURGICAL_RANK.get(status or "", -1) >= _SURGICAL_RANK[stage]


def is_terminal(status: str | None, case_type: str) -> bool:
    """True ถ้าเคสปิดแล้ว — รู้เองว่าแต่ละชนิดเคสใช้คำว่าอะไร"""
    return (status or "") in {
        "surgical": SURGICAL_TERMINAL,
        "gyne": GYNE_TERMINAL,
        "nongyne": NONGYNE_TERMINAL,
    }[case_type]
