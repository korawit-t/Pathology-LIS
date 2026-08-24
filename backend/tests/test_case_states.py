"""
Guard: ห้ามมีสถานะใหม่โผล่ในโค้ดโดยไม่ได้ลงทะเบียนใน case_states.py

เทสต์นี้ไม่แตะ DB — มันสแกน source ของ crud/ หาทุกค่าที่ถูกเขียนลงคอลัมน์
``status`` แล้วบังคับให้ทุกค่าถูกจัดหมวดไว้แล้ว ไม่ว่าจะเป็นสถานะระดับเคส
(อยู่ใน CATALOGUE) หรือระดับอื่น (อยู่ใน NON_CASE_STATUSES)

เวลาใครเพิ่มสถานะใหม่แล้วลืมลงทะเบียน เทสต์จะพังพร้อมบอกชื่อไฟล์ —
ซึ่งคือสิ่งที่ทำให้ ``sectioned`` หลุดจากสองเซ็ตไปได้ตั้งแต่แรก

หมายเหตุเรื่องการสแกน: สถานะถูกเขียนด้วย 4 รูปแบบ และการจับไม่ครบทุกแบบ
คือสาเหตุที่ไล่โค้ดแล้วได้ภาพไม่ครบ —
    obj.status = "x"
    .update({"status": "x"})
    obj.status = CaseStatus.X.value
    obj.status = "a" if cond else "b"
"""

import re
from pathlib import Path

import pytest

from app.enums.case_states import (
    CATALOGUE,
    NONGYNE_SPINE,
    SURGICAL_PIPELINE,
    SURGICAL_TERMINAL,
    is_terminal,
    surgical_past,
)
from app.enums.case_status import CaseStatus

CRUD_DIR = Path(__file__).resolve().parents[1] / "app" / "crud"

_ASSIGN = re.compile(r'\.status\s*=(?!=)\s*([^\n#]+)')
_DICT_UPDATE = re.compile(r'\.update\(\s*\{[^}]*?["\']status["\']\s*:\s*([^,}\n]+)', re.S)
_STR_LITERAL = re.compile(r'["\']([^"\']+)["\']')
_ENUM_REF = re.compile(r'CaseStatus\.([A-Z_]+)')


def _values_in(rhs: str) -> set[str]:
    """ดึงค่าสถานะออกจากฝั่งขวาของการ assign — รองรับทั้ง literal, ternary และ enum"""
    values = set(_STR_LITERAL.findall(rhs))
    for member in _ENUM_REF.findall(rhs):
        if member in CaseStatus.__members__:
            values.add(CaseStatus[member].value)
    return values


def _scan() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for path in sorted(CRUD_DIR.glob("*.py")):
        text = path.read_text(encoding="utf-8")
        for pattern in (_ASSIGN, _DICT_UPDATE):
            for rhs in pattern.findall(text):
                for value in _values_in(rhs):
                    found.setdefault(value, set()).add(path.name)
    return found


# สถานะที่ "ไม่ใช่ระดับเคส" — ของ block / slide / run / item / consult / export
# แยกไว้ชัด ๆ เพราะคำเดียวกัน (เช่น "stained") ถูกใช้คนละความหมายในคนละตาราง
# ซึ่งเป็นอีกเหตุผลที่ไม่ควรยุบทุกอย่างเป็น enum เดียว
NON_CASE_STATUSES = {
    "grossed", "processing", "processed", "embedded", "sectioned",
    "stained", "stored", "consult",                       # block / slide
    "pending", "sent", "received", "partial",
    "completed", "missing",                               # stain order / outlab run
    "draft", "signed",                                    # diagnosis
    "responded", "closed",                                # internal consult
    "dead_letter",                                        # his export outbox
    "reported",                                           # molecular case (คนละโดเมน)
    "PRINTED", "DISPOSED", "CANCELLED",                   # ใบตรวจสอบการทำลายชิ้นเนื้อ
}

ALL_KNOWN = set().union(*CATALOGUE.values()) | NON_CASE_STATUSES


def test_no_unregistered_status_literal():
    unknown = {v: sorted(f) for v, f in _scan().items() if v not in ALL_KNOWN}
    assert not unknown, (
        "เจอสถานะที่ยังไม่ได้ลงทะเบียน — เพิ่มลง app/enums/case_states.py "
        "(ถ้าเป็นสถานะระดับเคส) หรือลง NON_CASE_STATUSES ในเทสต์นี้:\n"
        + "\n".join(f"  {v!r} ← {', '.join(files)}" for v, files in sorted(unknown.items()))
    )


# สถานะที่ไม่ได้มาจาก crud — เข้าระบบทางอื่น จึงสแกนไม่เจอ
#
# การสแกนเฉพาะ crud/ เคยทำให้สรุปผิดว่า "formalin_fixing" เป็นค่าตายที่ไม่มีใคร
# เขียน ทั้งที่จริงหน้าบ้านส่งมาเองตอนลงทะเบียน สถานะเข้าคอลัมน์นี้ได้ 3 ทาง
# ไม่ใช่ทางเดียว — เขียนใน crud, ค่า default ของคอลัมน์ และ client ส่งมาผ่าน
# schema ที่รับ Optional[str]
_NOT_WRITTEN_BY_CRUD = {
    "registered",       # models/surgical_case.py:50 — Column(default=...)
    "formalin_fixing",  # client ส่งมาตอนสร้างเคส เมื่อติ๊ก Extended Fixation
}


def test_catalogue_has_no_phantom_values():
    """ทุกค่าใน CATALOGUE ต้องมีทางเข้าจริง ไม่ใช่ค่าที่ประกาศไว้เฉย ๆ"""
    written = set(_scan()) | _NOT_WRITTEN_BY_CRUD
    for case_type, statuses in CATALOGUE.items():
        phantom = statuses - written
        assert not phantom, (
            f"{case_type}: มีสถานะใน catalogue ที่ไม่มีโค้ดไหนเขียน {sorted(phantom)} "
            "— ลบทิ้ง หรือถ้าตั้งใจเผื่อไว้ ให้ใส่คอมเมนต์กำกับ"
        )


# ── คอมเมนต์กำกับต้องชี้ไปยังฟังก์ชันที่มีจริง ──────────────────────
#
# เดิมคอมเมนต์ในไฟล์นี้เขียนเป็น ``file:line`` ซึ่งเน่าทุกครั้งที่มี commit
# แตะไฟล์ปลายทาง — ครั้งล่าสุดผิดไป 14 จาก 26 จุด และไม่มีอะไรจับได้เลย
# ตอนนี้เปลี่ยนไปอ้าง ``module.function`` แล้วให้เทสต์นี้กันไม่ให้ชื่อที่อ้าง
# ถูกลบ/เปลี่ยนชื่อโดยไม่แก้คอมเมนต์ตาม

_COMMENT_REF = re.compile(
    r'#\s*(?:[a-z_]+\.)?'                     # อาจมี prefix crud. นำหน้า
    r'([a-z_][a-z0-9_]*)\.'                    # module
    r'(?:\{([a-z0-9_,]+)\}|([a-z_][a-z0-9_]*))'  # func หรือ {a,b}
)

_STATES_SRC = (Path(__file__).resolve().parents[1] / "app" / "enums" / "case_states.py")


def _comment_targets() -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for line in _STATES_SRC.read_text(encoding="utf-8").splitlines():
        if "#" not in line:
            continue
        for module, braced, single in _COMMENT_REF.findall(line):
            funcs = braced.split(",") if braced else [single]
            for fn in funcs:
                if fn:
                    out.add((module, fn))
    return out


def test_status_comment_targets_exist():
    """ทุก module.function ที่คอมเมนต์อ้าง ต้องมีอยู่จริงใน crud/"""
    targets = _comment_targets()
    assert targets, "ไม่เจอคอมเมนต์รูปแบบ module.function เลย — regex พังหรือคอมเมนต์ถูกเขียนใหม่?"

    missing = []
    for module, func in sorted(targets):
        path = CRUD_DIR / f"{module}.py"
        if not path.exists():
            missing.append(f"{module}.py (ไม่มีไฟล์) ← {func}")
            continue
        src = path.read_text(encoding="utf-8")
        if not re.search(rf'^\s*def {re.escape(func)}\(', src, re.M):
            missing.append(f"{module}.{func}")

    assert not missing, (
        "คอมเมนต์ใน case_states.py อ้างฟังก์ชันที่ไม่มีอยู่จริง "
        "— แก้คอมเมนต์ให้ตรงกับชื่อใหม่:\n  " + "\n  ".join(missing)
    )


class TestDerivedSetContracts:
    """สัญญาของเซ็ตที่คำนวณออกมา — แต่ละข้อคือบั๊กที่เคยเกิดจริงจากการไล่รายชื่อด้วยมือ"""

    def test_sectioned_counts_as_past_grossing(self):
        # POST_GROSS_STATUSES เดิมตกค่านี้ไป
        assert surgical_past("sectioned", "grossed") is True

    def test_a_stage_is_not_past_itself(self):
        # เคสที่อยู่ที่ "grossed" ต้องยังถอยกลับเป็น "in progress" ได้
        assert surgical_past("grossed", "grossed") is False

    def test_cancelled_is_past_every_pipeline_stage(self):
        assert surgical_past("cancelled", "grossed") is True

    def test_unknown_status_is_never_past_anything(self):
        assert surgical_past("ค่าที่ไม่มีจริง", "grossed") is False
        assert surgical_past(None, "grossed") is False

    def test_unknown_stage_is_rejected_loudly(self):
        with pytest.raises(ValueError):
            surgical_past("grossed", "ขั้นที่ไม่มีจริง")

    def test_dashboard_pipeline_includes_sectioned(self):
        # PIPELINE เดิมตก "sectioned" → เคสที่ค้างขั้นตัดสไลด์ไม่ถูกนับในแดชบอร์ด
        assert "sectioned" in SURGICAL_PIPELINE

    def test_dashboard_pipeline_excludes_closed_cases(self):
        assert SURGICAL_PIPELINE.isdisjoint(SURGICAL_TERMINAL)

    def test_nongyne_draft_states_cover_the_whole_pre_report_spine(self):
        # เดิมเขียนคาไว้แค่ (registered, screening, screened) → เคสที่ "stained"
        # หรือ "slide sent" ไปโผล่เป็น FINAL REPORT ทั้งที่ยังไม่มีใครออกผล
        assert "stained" in NONGYNE_SPINE
        assert "slide sent" in NONGYNE_SPINE

    def test_terminal_vocabulary_differs_between_case_types(self):
        # เหตุผลที่ query ข้ามชนิดเคสด้วย status == "published" เฉย ๆ ถึงพัง
        assert is_terminal("published", "gyne") is True
        assert is_terminal("published", "surgical") is False
        assert is_terminal("signed out", "surgical") is True
