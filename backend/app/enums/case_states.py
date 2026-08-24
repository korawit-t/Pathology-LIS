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

คอมเมนต์กำกับแต่ละค่าอ้าง ``module.function`` **ไม่ใช่เลขบรรทัด** — ของเดิม
เขียนเป็น ``file:line`` แล้วเน่าทุกครั้งที่มี commit แตะไฟล์ปลายทาง
(ครั้งล่าสุดผิดไป 14 จาก 26 จุด) ชื่อฟังก์ชันไม่เลื่อนตามการแก้โค้ด และมี
``test_status_comment_targets_exist`` คอยกันไม่ให้ชื่อที่อ้างหายไปเงียบ ๆ
"""

from typing import Final, Iterable

# ═══════════════════════════════════════════════════════════════════
#  SURGICAL
# ═══════════════════════════════════════════════════════════════════

# ลำดับหลัก — เดินหน้าอย่างเดียว ใช้ตัดสินว่า "เลยขั้นไหนไปแล้ว"
SURGICAL_SPINE: Final[tuple[str, ...]] = (
    "registered",          # models/surgical_case.py — Column(default=...)
    # ไม่มีโค้ดหลังบ้านเขียนค่านี้ — หน้าบ้านส่งมาเองตอนลงทะเบียนเมื่อติ๊ก
    # "Extended Fixation" (SurgicalCaseFormModal/index.tsx) ผ่าน
    # SurgicalCaseCreate.status ซึ่งเป็น Optional[str] ที่ client กำหนดได้
    "formalin_fixing",     # client-supplied at registration
    "in progress",         # surgical_specimen.update_specimen_gross
    "grossed",             # surgical_specimen.update_specimen_gross
    "processed",           # tissue_processing.complete_processing_run
    "embedded",            # embedding.add_multiple_blocks_to_embedding
    "sectioned",           # sectioning._promote_cases_if_fully_sectioned
    "stained",             # surgical_block_stain._update_case_status_from_block_stains
    "slide sent",          # slide_dispatch.create_bulk_slide_dispatch
    "pending diagnosis",   # surgical_block_stain._update_case_status_from_block_stains
)

# รอผลย้อมเพิ่ม — แตกออกจากช่วงวินิจฉัยแล้ววนกลับ ไม่ใช่ขั้นในลำดับหลัก
SURGICAL_STAIN_HOLDS: Final[tuple[str, ...]] = (
    # เขียนได้ 2 ทาง: สั่งย้อมที่ระดับบล็อก และสั่ง AP test ที่ระดับ specimen
    "pending special stains",   # surgical_block_stain.{_update_case_status_from_block_stains,create_stain}
                                # surgical_specimen_ap_test_service.create_specimen_test
                                # surgical_specimen_ap_test_service.delete_specimen_test
    "pending immuno",           # ทางเดียวกับข้างบน
)

# รออนุมัติ — มีเฉพาะเมื่อ system_settings.enable_approve_system เปิด
SURGICAL_REVIEW: Final[tuple[str, ...]] = (
    "pending peer review",      # surgical_report.finalize_and_snapshot_orchestrator
)

# ปิดเคสแล้ว ไม่มีทางกลับ
SURGICAL_CLOSED: Final[tuple[str, ...]] = (
    "signed out",               # surgical_report.finalize_and_snapshot_orchestrator
                                # report_crud.process_report_approval
    "cancelled",                # surgical_case.cancel_surgical_case
)


# ═══════════════════════════════════════════════════════════════════
#  GYNE CYTOLOGY
# ═══════════════════════════════════════════════════════════════════

GYNE_SPINE: Final[tuple[str, ...]] = (
    "registered",          # column default
    "stained",             # gyne_cyto_stain.create_stain_run
    "screened",            # gyne_cyto_report.complete_gyne_review
                           # gyne_report_crud.process_gyne_report_approval
)

GYNE_REVIEW: Final[tuple[str, ...]] = (
    "pending_review",      # gyne_cyto_report.publish_gyne_report — ทั้ง abnormal และสุ่ม NILM
)

GYNE_CLOSED: Final[tuple[str, ...]] = (
    "published",           # gyne_cyto_report.{publish_gyne_report,complete_gyne_review}
                           # gyne_report_crud.process_gyne_report_approval
    "revised",             # gyne_diagnosis.revise_diagnosis — แก้ผลที่ออกไปแล้ว
    "cancelled",           # gyne_cyto_case.cancel_gyne_case
)


# ═══════════════════════════════════════════════════════════════════
#  NON-GYNE CYTOLOGY
# ═══════════════════════════════════════════════════════════════════

NONGYNE_SPINE: Final[tuple[str, ...]] = (
    "registered",          # column default
    "stained",             # nongyne_cyto_stain.create_stain_run
    "slide sent",          # slide_dispatch.create_bulk_slide_dispatch
    "screened",            # nongyne_cyto_report.process_nongyne_report_approval
)

NONGYNE_REVIEW: Final[tuple[str, ...]] = (
    "pending_approval",    # nongyne_cyto_report.publish_nongyne_report
)

NONGYNE_CLOSED: Final[tuple[str, ...]] = (
    "published",           # nongyne_cyto_report.{publish_nongyne_report,process_nongyne_report_approval}
    "cancelled",           # nongyne_cyto_case.cancel_nongyne_case
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

# "เซ็นออกแล้ว" — แคบกว่า SURGICAL_TERMINAL ตรงที่ไม่นับเคสที่ยกเลิก
# ใช้กับ worklist ที่ต้องการซ่อนเฉพาะเคสที่ออกผลแล้ว แต่ยังอยากเห็นเคสที่ถูกยกเลิก
SURGICAL_SIGNED: Final = frozenset({"signed out"})

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


def surgical_past(status: str | None, stage: str) -> bool:
    """
    True ถ้า ``status`` **เลย** ``stage`` ไปแล้ว — ไม่นับตัว ``stage`` เอง

    ต่างจาก :func:`surgical_at_or_past` ตรงที่ยังยอมให้ถอยภายในขั้นเดิมได้
    การ์ดตอนแก้ gross description ต้องใช้ตัวนี้: เคสที่อยู่ที่ ``grossed``
    ยังถอยกลับเป็น ``in progress`` ได้ถ้าลบคำบรรยายออก แต่เคสที่เลยขั้นนั้น
    ไปแล้วต้องไม่ถูกแตะ
    """
    if stage not in _SURGICAL_RANK:
        raise ValueError(f"ไม่รู้จักขั้นตอน {stage!r} — ต้องอยู่ใน SURGICAL_SPINE")
    return _SURGICAL_RANK.get(status or "", -1) > _SURGICAL_RANK[stage]


def is_terminal(status: str | None, case_type: str) -> bool:
    """True ถ้าเคสปิดแล้ว — รู้เองว่าแต่ละชนิดเคสใช้คำว่าอะไร"""
    return (status or "") in {
        "surgical": SURGICAL_TERMINAL,
        "gyne": GYNE_TERMINAL,
        "nongyne": NONGYNE_TERMINAL,
    }[case_type]
