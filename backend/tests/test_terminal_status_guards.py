"""ทะเบียนกลาง: งานหลังบ้านต้องไม่ดันสถานะเคสที่ปิดไปแล้วให้ถอยกลับ

เคสที่ออกผล/ยกเลิกไปแล้ว ต้องไม่ถูกงานที่เกิดขึ้นทีหลัง (ฝัง ตัด ย้อม
run processor) เขียนทับสถานะจนเด้งกลับเข้า worklist ใหม่

ทำไมต้องมีไฟล์รวม: บั๊กชุดนี้ไม่ใช่เคสเดี่ยว แต่ละจุดเขียนสถานะเคยเขียน
การ์ดของตัวเองแยกกัน (บางจุดเขียนเซ็ตด้วยมือ บางจุดลืมใส่) พอ
``surgical_specimen_ap_test_service.py`` โดนเข้าจริง จึงไล่ทั้งหมดมาไว้ที่เดียว
แล้ว parametrize ครอบทุกค่าใน catalogue — สถานะปิดตัวใหม่ที่เพิ่มเข้า
``case_states.py`` จะถูกเทสต์ทุกจุดอัตโนมัติโดยไม่ต้องมาไล่แก้ไฟล์นี้

หมายเหตุเรื่อง gyne: ใช้ ``GYNE_CLOSED`` ไม่ใช่ ``GYNE_TERMINAL`` เพราะ
``GYNE_TERMINAL`` หัก "revised" ออก (เคสแก้ผลยังแก้ diagnosis ต่อได้)
แต่ในแง่ "ห้ามถอยกลับไปขั้นก่อนมีผล" เคส revised ต้องถูกกันด้วย
ไม่งั้นมันจะโผล่ใน slide dispatch manual select ทั้งที่ออกผลไปแล้ว

จุดที่มีการ์ดอยู่แล้วและมีเทสต์ในไฟล์ตัวเองอยู่แล้ว ไม่ซ้ำมาที่นี่:
``surgical_block_stain.py`` (test_surgical_block_stain.py) และ
``surgical_specimen_ap_test_service.py`` (test_surgical_specimen_ap_test_service.py)
"""

import uuid
from datetime import datetime

import pytest

from app.enums.case_states import GYNE_CLOSED, NONGYNE_CLOSED, SURGICAL_TERMINAL

from app.crud.tissue_processing import create_processing_run, complete_processing_run
from app.schemas.tissue_processing import TissueProcessingRunCreate

from app.crud.embedding import create_embedding_run, add_multiple_blocks_to_embedding
from app.crud.sectioning import _promote_cases_if_fully_sectioned

from app.crud.gyne_cyto_stain import (
    create_stain as gyne_create_stain,
    create_stain_run as gyne_create_stain_run,
)
from app.schemas.gyne_cyto_stain import GyneStainCreate

from app.crud.nongyne_cyto_stain import (
    create_stain as nongyne_create_stain,
    create_stain_run as nongyne_create_stain_run,
)
from app.schemas.nongyne_cyto_stain import NongyneStainCreate

from tests.factories import (
    make_signable_case,
    make_block,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_anatomical_pathology_test,
)


# ── SURGICAL ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("terminal_status", sorted(SURGICAL_TERMINAL))
def test_processing_run_does_not_reopen_closed_case(db, admin_user, terminal_status):
    """crud/tissue_processing.py — จบ run แล้วบล็อกครบ ต้องไม่ทับเป็น 'processed'"""
    registrar, _ = admin_user
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id, status="grossed")
    run = create_processing_run(
        db,
        TissueProcessingRunCreate(
            processor_name="M1",
            program_name="P1",
            start_at=datetime.now(),
            block_ids=[block.id],
            created_by_id=registrar.id,
        ),
    )
    case.status = terminal_status
    db.commit()

    complete_processing_run(db, run.id, user_id=registrar.id, confirmed_block_ids=[block.id])

    db.refresh(case)
    assert case.status == terminal_status


@pytest.mark.parametrize("terminal_status", sorted(SURGICAL_TERMINAL))
def test_embedding_does_not_reopen_closed_case(db, admin_user, terminal_status):
    """crud/embedding.py — บล็อกที่ฝังหลัง sign out ต้องไม่ทับเป็น 'embedded'

    นี่คือทางที่น่าจะเกิดจริงที่สุด: recut / เพิ่มบล็อกหลังออกผลเป็นงานปกติ
    ของแล็บ พอบล็อกใหม่ถูกฝัง not_embedded_count จะกลับเป็น 0 อีกรอบ
    """
    registrar, _ = admin_user
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id, status="processed")
    case.status = terminal_status
    db.commit()
    run = create_embedding_run(db, registrar.id)

    add_multiple_blocks_to_embedding(db, run.id, [block.id])

    db.refresh(case)
    assert case.status == terminal_status


@pytest.mark.parametrize("terminal_status", sorted(SURGICAL_TERMINAL))
def test_sectioning_does_not_reopen_closed_case(db, admin_user, terminal_status):
    """crud/sectioning.py — ตัดสไลด์ครบทุกบล็อก ต้องไม่ทับเป็น 'sectioned'"""
    registrar, _ = admin_user
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id, status="sectioned")
    case.status = terminal_status
    db.commit()

    _promote_cases_if_fully_sectioned(db, [block.id])
    db.commit()

    db.refresh(case)
    assert case.status == terminal_status


# ── CYTOLOGY ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("terminal_status", sorted(GYNE_CLOSED))
def test_gyne_stain_run_does_not_reopen_closed_case(db, admin_user, terminal_status):
    """crud/gyne_cyto_stain.py — ย้อมเสร็จ ต้องไม่ทับเคสที่ออกผลแล้วเป็น 'stained'

    "revised" อยู่ในชุดนี้ด้วยโดยตั้งใจ — ดูเหตุผลใน docstring ของโมดูล
    """
    registrar, _ = admin_user
    case = make_bare_gyne_case(db, registrar_id=registrar.id)
    ap_test = make_anatomical_pathology_test(db)
    stain = gyne_create_stain(
        db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1)
    )
    case.status = terminal_status
    db.commit()

    gyne_create_stain_run(
        db,
        stainer_id="ST-1",
        stain_ids=[stain.id],
        run_no=f"RUN-{uuid.uuid4().hex[:8]}",
        user_id=registrar.id,
    )

    db.refresh(case)
    assert case.status == terminal_status


@pytest.mark.parametrize("terminal_status", sorted(NONGYNE_CLOSED))
def test_nongyne_stain_run_does_not_reopen_closed_case(db, admin_user, terminal_status):
    """crud/nongyne_cyto_stain.py — โครงเดียวกับ gyne"""
    registrar, _ = admin_user
    case = make_bare_nongyne_case(db, registrar_id=registrar.id)
    ap_test = make_anatomical_pathology_test(db)
    stain = nongyne_create_stain(
        db, NongyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1)
    )
    case.status = terminal_status
    db.commit()

    nongyne_create_stain_run(
        db,
        stainer_id="ST-1",
        stain_ids=[stain.id],
        run_no=f"RUN-{uuid.uuid4().hex[:8]}",
        user_id=registrar.id,
    )

    db.refresh(case)
    assert case.status == terminal_status


# ── การย้อมที่ยังเปิดอยู่ต้องทำงานปกติ ────────────────────────────────
#
# การ์ดข้างบนเป็นการ "ไม่ทำอะไร" ถ้าไม่มีเทสต์ฝั่งตรงข้าม การเขียนการ์ด
# ให้ return ทิ้งทุกกรณีก็ยังผ่านหมด — สองเทสต์นี้กันไม่ให้การ์ดกว้างเกิน

def test_open_surgical_case_still_promoted_by_embedding(db, admin_user):
    registrar, _ = admin_user
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id, status="processed")
    run = create_embedding_run(db, registrar.id)

    add_multiple_blocks_to_embedding(db, run.id, [block.id])

    db.refresh(case)
    assert case.status == "embedded"


def test_open_gyne_case_still_promoted_by_stain_run(db, admin_user):
    registrar, _ = admin_user
    case = make_bare_gyne_case(db, registrar_id=registrar.id)
    ap_test = make_anatomical_pathology_test(db)
    stain = gyne_create_stain(
        db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1)
    )

    gyne_create_stain_run(
        db,
        stainer_id="ST-1",
        stain_ids=[stain.id],
        run_no=f"RUN-{uuid.uuid4().hex[:8]}",
        user_id=registrar.id,
    )

    db.refresh(case)
    assert case.status == "stained"
