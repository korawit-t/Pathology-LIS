"""
NonGyne Out-Lab Consult finalize lifecycle regression suite — mirrors
test_surgical_consult_finalize.py's TestConsultRoundTrip: sign off (flagging
via the new Out-Lab Consult button path) -> dispatch -> upload PDF -> a
*different* pathologist finalizes round 2.

Unlike Surgical, NongyneCytoReport always inserts a fresh row per publish
(version_no = existing_count + 1) — there's no in-flight draft to reuse, so
there is no cross-round signer-attribution leak class of bug to guard here
(see nongyne_cyto_report.py::publish_nongyne_report).
"""

import uuid
import pytest

from app.crud.nongyne_diagnosis import create_nongyne_diagnosis, update_nongyne_diagnosis, get_nongyne_diagnosis_by_id
from app.crud.nongyne_cyto_report import publish_nongyne_report
from app.crud.outlab_consult import create_consult_run
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate, NongyneDiagnosisUpdate
from app.schemas.outlab_consult import OutlabConsultRunCreate, CaseSelection
from app.models.nongyne_cyto_report import NongyneCytoReport
from fastapi import HTTPException

from tests.factories import make_bare_nongyne_case
from tests.conftest import _make_user


@pytest.fixture
def two_pathologists(db):
    path1, _ = _make_user(db, f"npath1_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    path2, _ = _make_user(db, f"npath2_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    return path1, path2


class TestNongyneConsultRoundTrip:
    def test_flag_dispatch_upload_and_second_finalize(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        diagnosis = create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )
        update_nongyne_diagnosis(db, db_obj=diagnosis, obj_in=NongyneDiagnosisUpdate(status="signed"))

        # --- Round 1: sign off, flagging the case for out-lab consult (the
        # Out-Lab Consult button path — handleOutLabConsult on the frontend) ---
        report1 = publish_nongyne_report(
            db,
            case_id=case.id,
            signers=[{"user_id": path1.id, "role": "primary"}],
            current_user_id=path1.id,
            is_pending=True,
            pending_reason="Out-Lab Consult — awaiting results",
            is_out_lab_consult=True,
            consult_reason="Need subspecialty opinion",
        )

        db.refresh(case)
        assert case.is_out_lab_consult is True
        assert case.consult_status == "pending"  # flagged only, not dispatched yet
        assert case.is_pending is True
        assert case.pending_reason == "Out-Lab Consult — awaiting results"

        # --- Dispatch: create a consult run ---
        run_payload = OutlabConsultRunCreate(
            destination_lab="Reference Lab",
            cases=[CaseSelection(case_type="nongyne", case_id=case.id, accession_no=case.accession_no)],
        )
        create_consult_run(db, run_payload, operator_id=registrar.id)
        db.refresh(case)
        assert case.consult_status == "processing"

        # --- The draft-save path (update_nongyne_diagnosis) is now locked
        # since the consult was dispatched but no PDF has arrived yet ---
        with pytest.raises(HTTPException) as exc_info:
            update_nongyne_diagnosis(db, db_obj=diagnosis, obj_in=NongyneDiagnosisUpdate(comment="edit attempt"))
        assert exc_info.value.status_code == 423

        # --- Upload the returned consult PDF (direct field set — upload
        # endpoint itself is covered by test_consult_pdf.py's Surgical case,
        # both share app/crud/consult_pdf.py) ---
        case.consult_pdf_path = "/tmp/fake_nongyne_consult.pdf"
        db.commit()

        # Now that the PDF is in, the guard clears and a plain draft edit
        # (e.g. re-marking the diagnosis "signed") is allowed again.
        diagnosis = get_nongyne_diagnosis_by_id(db, diagnosis.id)
        update_nongyne_diagnosis(db, db_obj=diagnosis, obj_in=NongyneDiagnosisUpdate(status="signed"))

        # --- Round 2: a DIFFERENT pathologist finalizes the consult round.
        # is_pending=False here mirrors what the real Sign-Off modal submits
        # once isConsultEditorLocked forces initialIsCasePending to false. ---
        report2 = publish_nongyne_report(
            db,
            case_id=case.id,
            signers=[{"user_id": path2.id, "role": "primary"}],
            current_user_id=path2.id,
            is_pending=False,
            pending_reason=None,
        )  # must not raise

        assert report2.id != report1.id
        assert isinstance(report2, NongyneCytoReport)
        assert report2.version_no == 2

        db.refresh(case)
        assert case.is_pending is False
        assert case.pending_reason is None
        assert case.consult_status == "received"
