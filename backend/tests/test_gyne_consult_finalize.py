"""
Gyne Out-Lab Consult finalize lifecycle regression suite — mirrors
test_nongyne_consult_finalize.py: sign off (flagging via the new Out-Lab
Consult button path) -> dispatch -> upload PDF -> a *different* pathologist
finalizes round 2.

Unlike NonGyne/Surgical, Gyne has no is_pending/pending_reason concept at
all — publish_gyne_report never accepted those params, so there's nothing to
assert there. Also like NonGyne, GyneCytoReport always inserts a fresh row
per publish (version_no = existing_count + 1) — no draft-reuse, so no
cross-round signer-attribution leak class of bug to guard here.
"""

import uuid
import pytest

from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.gyne_cyto_report import publish_gyne_report
from app.crud.outlab_consult import create_consult_run
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.outlab_consult import OutlabConsultRunCreate, CaseSelection
from app.models.gyne_cyto_report import GyneCytoReport
from fastapi import HTTPException

from tests.factories import make_bare_gyne_case
from tests.conftest import _make_user


@pytest.fixture
def two_pathologists(db):
    path1, _ = _make_user(db, f"gpath1_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    path2, _ = _make_user(db, f"gpath2_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    return path1, path2


class TestGyneConsultRoundTrip:
    def test_flag_dispatch_upload_and_second_finalize(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id, interpretation="Test diagnosis"))

        # --- Round 1: sign off, flagging the case for out-lab consult (the
        # Out-Lab Consult button path — handleOutLabConsult on the frontend) ---
        report1 = publish_gyne_report(
            db,
            case_id=case.id,
            signers=[{"user_id": path1.id, "role": "primary"}],
            current_user_id=path1.id,
            is_abnormal=False,
            is_out_lab_consult=True,
            consult_reason="Need subspecialty opinion",
        )

        db.refresh(case)
        assert case.is_out_lab_consult is True
        assert case.consult_status == "pending"  # flagged only, not dispatched yet
        assert case.status == "published"

        # --- Dispatch: create a consult run ---
        run_payload = OutlabConsultRunCreate(
            destination_lab="Reference Lab",
            cases=[CaseSelection(case_type="gyne", case_id=case.id, accession_no=case.accession_no)],
        )
        create_consult_run(db, run_payload, operator_id=registrar.id)
        db.refresh(case)
        assert case.consult_status == "processing"

        # --- The draft-save path (create_initial_diagnosis/update_diagnosis)
        # is now locked since the consult was dispatched but no PDF arrived ---
        with pytest.raises(HTTPException) as exc_info:
            create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id, interpretation="edit attempt"))
        assert exc_info.value.status_code == 423

        # --- Upload the returned consult PDF (direct field set — upload
        # endpoint itself shares app/crud/consult_pdf.py with Surgical/NonGyne,
        # already covered by test_consult_pdf.py) ---
        case.consult_pdf_path = "/tmp/fake_gyne_consult.pdf"
        db.commit()

        # --- Round 2: a DIFFERENT pathologist finalizes the consult round ---
        report2 = publish_gyne_report(
            db,
            case_id=case.id,
            signers=[{"user_id": path2.id, "role": "primary"}],
            current_user_id=path2.id,
            is_abnormal=False,
        )  # must not raise

        assert report2.id != report1.id
        assert isinstance(report2, GyneCytoReport)
        assert report2.version_no == 2

        db.refresh(case)
        assert case.consult_status == "received"
