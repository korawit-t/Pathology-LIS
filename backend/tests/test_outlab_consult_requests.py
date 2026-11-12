"""Out-lab consult rounds — one OutlabConsultRequest per round on the case's
own accession (S26-01234-C1, -C2, …). Covers what the per-case columns
couldn't do (a second round), the rules the rounds enforce, the case-level
cache, the cover sheets, the new router's gates and the migration backfill."""
import base64
import importlib.util
import io
import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.crud import outlab_consult_request as consult_crud
from app.crud.gyne_cyto_report import publish_gyne_report
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.outlab_consult import create_consult_run, delete_consult_run
from app.crud.surgical_diagnosis import bulk_save_draft_orchestrator
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.models.outlab_consult import OutlabConsultRun, OutlabConsultRunDetail
from app.models.outlab_consult_request import OutlabConsultRequest
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.outlab_consult import CaseSelection, OutlabConsultRunCreate
from tests.factories import (
    MINIMAL_PDF,
    attach_consult_result,
    build_bulk_save_payload,
    clear_system_settings,
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_consult,
    make_signable_case,
)


def _dispatch(db, operator_id, case_type, case):
    return create_consult_run(
        db,
        OutlabConsultRunCreate(
            destination_lab="Reference Lab",
            cases=[CaseSelection(case_type=case_type, case_id=case.id, accession_no=case.accession_no)],
        ),
        operator_id=operator_id,
    )


def _finalize(db, case, specimen, pathologist_id):
    payload = build_bulk_save_payload(
        case.id, specimen.id, pathologist_id, is_pending=False, pending_reason=None
    )
    return finalize_and_snapshot_orchestrator(db, case.id, payload, pathologist_id)


# ─── A second round ───────────────────────────────────────────────────────────

class TestSecondRound:
    def test_two_rounds_then_both_covers_on_the_latest_report(
        self, db, admin_user, two_pathologists, tmp_path, monkeypatch
    ):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        # The UI asks for a saved draft before a consult can be requested.
        bulk_save_draft_orchestrator(db, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        # Round 1: request, ship, result back, approve, release.
        c1 = consult_crud.request_consult(
            db, "surgical", case.id, reason="First opinion", destination_lab=None, user_id=path1.id
        )
        assert c1.consult_no == f"{case.accession_no}-C1"
        _dispatch(db, registrar.id, "surgical", case)
        attach_consult_result(db, "surgical", case, tmp_path, monkeypatch)
        consult_crud.approve_consult(db, c1, path1.id)
        report1 = _finalize(db, case, specimen, path1.id)
        db.refresh(c1)
        assert c1.status == "reported"
        assert report1.consult_ids_snapshot == [c1.id]

        # Round 2 on the same case — what the old per-case columns refused.
        c2 = consult_crud.request_consult(
            db, "surgical", case.id, reason="Second opinion", destination_lab="Other Lab", user_id=path2.id
        )
        assert c2.seq == 2
        assert c2.consult_no == f"{case.accession_no}-C2"
        db.refresh(case)
        assert case.consult_status == "pending"
        assert case.consult_no == f"{case.accession_no}-C2"
        assert case.consult_reason == "Second opinion"
        assert case.consult_pdf_path is None

        _dispatch(db, registrar.id, "surgical", case)
        db.refresh(c2)
        assert c2.status == "sent"
        assert c2.destination_lab == "Other Lab"  # the request's own choice wins

        attach_consult_result(db, "surgical", case, tmp_path, monkeypatch)
        consult_crud.approve_consult(db, c2, path2.id)
        report2 = _finalize(db, case, specimen, path2.id)

        # The latest round is the copy the clinician reads: it carries both.
        assert report2.consult_ids_snapshot == [c1.id, c2.id]
        db.refresh(c2)
        assert c2.status == "reported"
        assert c2.reported_in_report_id == report2.id
        assert c1.reported_in_report_id == report1.id  # untouched

    def test_only_one_round_open_at_a_time(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        make_consult(db, "surgical", case, status="sent")

        with pytest.raises(HTTPException) as exc:
            consult_crud.request_consult(
                db, "surgical", case.id, reason="again", destination_lab=None, user_id=registrar.id
            )
        assert exc.value.status_code == 409
        assert f"{case.accession_no}-C1" in exc.value.detail

    def test_cancelled_round_frees_the_case_and_keeps_numbering(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        c1 = make_consult(db, "surgical", case, status="requested")
        consult_crud.cancel_consult(db, c1, user_id=registrar.id, reason="Not needed")

        db.refresh(case)
        assert case.is_out_lab_consult is False
        assert case.consult_status is None
        assert case.consult_no is None

        c2 = consult_crud.request_consult(
            db, "surgical", case.id, reason="Needed after all", destination_lab=None, user_id=registrar.id
        )
        assert c2.consult_no == f"{case.accession_no}-C2"


# ─── The old per-case flag ────────────────────────────────────────────────────

class TestCaseFlag:
    def test_flag_still_on_after_release_does_not_open_a_new_round(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        make_consult(db, "surgical", case, status="reported")

        consult_crud.apply_case_flag(db, "surgical", case, flag=True, reason=None, user_id=registrar.id)
        db.commit()

        assert len(consult_crud.list_for_case(db, "surgical", case.id)) == 1

    def test_unflag_withdraws_a_queued_round_only(self, db, admin_user):
        registrar, _ = admin_user
        queued = make_bare_case(db, registrar_id=registrar.id)
        make_consult(db, "surgical", queued, status="requested")
        shipped = make_bare_case(db, registrar_id=registrar.id)
        sent = make_consult(db, "surgical", shipped, status="sent")

        consult_crud.apply_case_flag(db, "surgical", queued, flag=False, reason=None, user_id=registrar.id)
        consult_crud.apply_case_flag(db, "surgical", shipped, flag=False, reason=None, user_id=registrar.id)
        db.commit()

        assert consult_crud.list_for_case(db, "surgical", queued.id)[0].status == "cancelled"
        db.refresh(sent)
        assert sent.status == "sent"
        db.refresh(shipped)
        assert shipped.consult_status == "processing"

    def test_case_patch_cannot_write_the_cached_status(self, staff_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        r = staff_client.patch(
            f"/nongyne-cytology/{case.id}",
            json={"is_out_lab_consult": True, "consult_status": "received"},
        )

        assert r.status_code == 200, r.text
        db.expire_all()
        [consult] = consult_crud.list_for_case(db, "nongyne", case.id)
        assert consult.status == "requested"
        assert r.json()["consult_status"] == "pending"


# ─── Runs ─────────────────────────────────────────────────────────────────────

class TestRuns:
    def test_deleting_a_run_requeues_the_consult(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        consult = make_consult(db, "surgical", case, status="requested")
        run = _dispatch(db, registrar.id, "surgical", case)
        [detail] = run.details
        assert detail.consult_id == consult.id

        delete_consult_run(db, run.id)

        db.refresh(consult)
        assert consult.status == "requested"
        db.refresh(case)
        assert case.consult_status == "pending"

    def test_run_with_a_result_on_file_cannot_be_deleted(self, db, admin_user, tmp_path, monkeypatch):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        make_consult(db, "surgical", case, status="requested")
        run = _dispatch(db, registrar.id, "surgical", case)
        attach_consult_result(db, "surgical", case, tmp_path, monkeypatch)

        with pytest.raises(HTTPException) as exc:
            delete_consult_run(db, run.id)
        assert exc.value.status_code == 409
        db.rollback()
        assert db.get(OutlabConsultRunDetail, run.details[0].id) is not None

    def test_more_material_for_a_consult_already_out_joins_it(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        consult = make_consult(db, "surgical", case, status="requested")
        first = _dispatch(db, registrar.id, "surgical", case)
        second = _dispatch(db, registrar.id, "surgical", case)

        assert second.details[0].consult_id == consult.id
        # Pulling the second box back leaves the consult out with the first.
        delete_consult_run(db, second.id)
        db.refresh(consult)
        assert consult.status == "sent"
        assert first.id != second.id


# ─── Result PDF and approval ──────────────────────────────────────────────────

class TestResultAndApproval:
    def test_replacing_the_pdf_voids_the_approval(
        self, admin_client, db, admin_user, pathologist_user, tmp_path, monkeypatch
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_case(db, registrar_id=registrar.id)
        make_consult(db, "surgical", case, status="requested")
        _dispatch(db, registrar.id, "surgical", case)
        consult = attach_consult_result(db, "surgical", case, tmp_path, monkeypatch)
        consult_crud.approve_consult(db, consult, pathologist.id)

        r = admin_client.post(
            f"/outlab-consults/{consult.id}/result-pdf",
            files={"file": ("new.pdf", MINIMAL_PDF, "application/pdf")},
        )

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "result_received"
        assert body["approved_by_id"] is None
        assert body["has_result_pdf"] is True
        assert "result_pdf_path" not in body

    def test_released_round_is_frozen(self, admin_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        consult = make_consult(db, "surgical", case, status="reported", result_pdf_path="/tmp/x.pdf")

        assert admin_client.delete(f"/outlab-consults/{consult.id}/result-pdf").status_code == 409
        r = admin_client.patch(f"/outlab-consults/{consult.id}", json={"external_ref": "X-1"})
        assert r.status_code == 409
        # Recording whether the consultant agreed stays possible after release.
        r = admin_client.patch(f"/outlab-consults/{consult.id}", json={"concordance": "minor_discordant"})
        assert r.status_code == 200, r.text
        assert r.json()["concordance"] == "minor_discordant"

    def test_approve_records_the_caller(self, pathologist_client, db, admin_user, pathologist_user, tmp_path, monkeypatch):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        make_consult(db, "gyne", case, status="sent")
        consult = attach_consult_result(db, "gyne", case, tmp_path, monkeypatch)

        r = pathologist_client.post(f"/outlab-consults/{consult.id}/approve")

        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        assert r.json()["approved_by_id"] == pathologist.id

        listed = pathologist_client.get("/outlab-consults", params={"case_type": "gyne", "case_id": case.id})
        assert [c["consult_no"] for c in listed.json()] == [f"{case.accession_no}-C1"]


# ─── Release gate on cytology ─────────────────────────────────────────────────

class TestCytoReleaseGate:
    def test_gyne_cannot_publish_while_the_consult_is_out(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id, interpretation="Dx"))
        make_consult(db, "gyne", case, status="sent")

        with pytest.raises(HTTPException) as exc:
            publish_gyne_report(
                db,
                case_id=case.id,
                signers=[{"user_id": path1.id, "role": "primary"}],
                current_user_id=path1.id,
            )
        assert exc.value.status_code == 423


# ─── Gates ────────────────────────────────────────────────────────────────────

class TestGates:
    def test_referring_side_accounts_cannot_reach_the_consult_router(self, clinician_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        r = clinician_client.get("/outlab-consults", params={"case_type": "surgical", "case_id": case.id})
        assert r.status_code == 403

    @pytest.mark.parametrize("prefix", ["/surgical-cases", "/gyne-cytology"])
    def test_referring_side_accounts_cannot_upload_or_delete_the_case_pdf(
        self, clinician_client, db, admin_user, prefix
    ):
        """These two case routers are open to clinicians for reading; the
        consult PDF writes used to check only the hospital scope."""
        registrar, _ = admin_user
        make = make_bare_case if prefix == "/surgical-cases" else make_bare_gyne_case
        case = make(db, registrar_id=registrar.id)

        up = clinician_client.post(
            f"{prefix}/{case.id}/consult-pdf",
            files={"file": ("c.pdf", MINIMAL_PDF, "application/pdf")},
        )
        assert up.status_code == 403
        assert clinician_client.delete(f"{prefix}/{case.id}/consult-pdf").status_code == 403


# ─── Cover sheets ─────────────────────────────────────────────────────────────

def _tiny_jpeg_data_uri() -> str:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 56), "white").save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _page_count(pdf_bytes: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(pdf_bytes)).pages)


class TestCovers:
    def test_one_cover_per_consult_in_front_of_the_report(self, db, admin_user):
        from weasyprint import HTML

        from app.services.consult_cover import prepend_consult_covers

        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        thumbs = json.dumps([_tiny_jpeg_data_uri()])
        c1 = make_consult(db, "gyne", case, status="reported")
        c1.pdf_thumbnails = thumbs
        db.commit()
        c2 = make_consult(db, "gyne", case, status="approved", approved_by_id=registrar.id)
        c2.pdf_thumbnails = thumbs
        db.commit()

        main = HTML(string="<p>report</p>").write_pdf()
        merged = prepend_consult_covers(
            db, main, {"consult_ids_snapshot": [c1.id, c2.id]}, case_type="gyne", case_id=case.id
        )

        assert _page_count(merged) == _page_count(main) + 2

    def test_report_from_before_the_table_keeps_its_old_cover_path(self, db):
        from weasyprint import HTML

        from app.services.consult_cover import prepend_consult_covers

        main = HTML(string="<p>report</p>").write_pdf()
        # No consult_ids_snapshot and no legacy thumbnail: printed as it was.
        assert prepend_consult_covers(db, main, {}, case_type="gyne", case_id=0) == main
        assert prepend_consult_covers(db, main, {"consult_ids_snapshot": []}, case_type="gyne", case_id=0) == main


# ─── Migration backfill ───────────────────────────────────────────────────────

def _migration():
    path = next(Path(__file__).resolve().parents[1].glob("alembic/versions/8f3638ca7ca8_*.py"))
    spec = importlib.util.spec_from_file_location("consult_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestBackfill:
    def test_legacy_case_columns_become_round_one(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user

        def legacy(make, **cols):
            case = make(db, registrar_id=registrar.id)
            for k, v in cols.items():
                setattr(case, k, v)
            db.commit()
            return case

        queued = legacy(make_bare_case, is_out_lab_consult=True, consult_status="pending", consult_reason="why")
        out = legacy(make_bare_case, is_out_lab_consult=True, consult_status="processing")
        back = legacy(make_bare_case, is_out_lab_consult=True, consult_status="processing", consult_pdf_path="/p.pdf")
        signed = legacy(
            make_bare_case, is_out_lab_consult=True, consult_status="processing",
            consult_pdf_path="/p.pdf", consult_pdf_approved_by_id=pathologist.id,
        )
        released_gyne = legacy(make_bare_gyne_case, is_out_lab_consult=True, consult_status="received", consult_pdf_path="/g.pdf")
        # Put in a run without ever being flagged.
        unflagged = legacy(make_bare_nongyne_case, is_out_lab_consult=False, consult_status="processing")
        untouched = legacy(make_bare_case)

        # A run line from before the table existed: no consult_id yet.
        legacy_run = OutlabConsultRun(run_no=f"BF-{out.id}", destination_lab="Siriraj", status="sent")
        db.add(legacy_run)
        db.flush()
        run_id = legacy_run.id
        db.add(OutlabConsultRunDetail(run_id=run_id, case_type="surgical", case_id=out.id, accession_no=out.accession_no))
        db.commit()

        migration = _migration()
        for _ in range(2):  # re-running (after a manual raw-SQL apply) adds nothing
            for case_type, table, has_approver in migration._CASE_TABLES:
                db.execute(text(migration._backfill_sql(case_type, table, has_approver)))
            db.execute(text(migration._LINK_RUN_DETAILS_SQL))
            db.commit()

        def round1(case_type, case):
            rows = db.query(OutlabConsultRequest).filter_by(case_type=case_type, case_id=case.id).all()
            assert len(rows) == 1
            return rows[0]

        assert round1("surgical", queued).status == "requested"
        assert round1("surgical", queued).reason == "why"
        assert round1("surgical", out).status == "sent"
        assert round1("surgical", out).destination_lab == "Siriraj"
        assert round1("surgical", back).status == "result_received"
        assert round1("surgical", signed).status == "approved"
        assert round1("surgical", signed).approved_by_id == pathologist.id
        assert round1("gyne", released_gyne).status == "reported"
        assert round1("nongyne", unflagged).status == "sent"
        assert round1("surgical", queued).consult_no == f"{queued.accession_no}-C1"
        assert db.query(OutlabConsultRequest).filter_by(case_type="surgical", case_id=untouched.id).count() == 0

        db.expire_all()
        assert db.get(type(unflagged), unflagged.id).is_out_lab_consult is True
        detail = db.query(OutlabConsultRunDetail).filter_by(run_id=run_id).one()
        assert detail.consult_id == round1("surgical", out).id


class TestCaseListShowsRound:
    def test_case_list_carries_the_latest_round_number(self, staff_client, db, admin_user):
        """The External Consult tab shows which round a case is on next to its
        accession, from the case list itself — no per-row lookup."""
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        make_consult(db, "surgical", case, status="reported")
        make_consult(db, "surgical", case, status="sent")

        r = staff_client.get("/surgical-cases", params={"search": case.accession_no, "is_out_lab_consult": True})

        assert r.status_code == 200, r.text
        [row] = [i for i in r.json()["items"] if i["id"] == case.id]
        assert row["accession_no"] == case.accession_no
        assert row["consult_no"] == f"{case.accession_no}-C2"
        assert row["consult_status"] == "processing"

    def test_backfill_fills_the_round_number(self, db, admin_user):
        path = next(Path(__file__).resolve().parents[1].glob("alembic/versions/318aaf388aec_*.py"))
        spec = importlib.util.spec_from_file_location("consult_no_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)

        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        make_consult(db, "gyne", case, status="reported")
        make_consult(db, "gyne", case, status="requested")
        case.consult_no = None  # as left by 8f3638ca7ca8, before this column existed
        db.commit()

        for case_type, table in migration._CASE_TABLES:
            db.execute(text(migration._backfill_sql(case_type, table)))
        db.commit()

        db.refresh(case)
        assert case.consult_no == f"{case.accession_no}-C2"
