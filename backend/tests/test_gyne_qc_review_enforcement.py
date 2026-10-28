"""Server-side enforcement of the gyne QC review (pending_review).

The UI only shows Agree/Disagree to pathologists; these tests pin the same
rules at the API so a direct call can't get around them:

  * only CAN_REVIEW_GYNE_QC (pathologist / senior_pathologist — admin alone
    does not count) may complete a review;
  * the reviewer may not be the case's screener or whoever sent it for review;
  * a pathologist's own read-out publishes directly instead of queueing a
    review of themselves;
  * nothing but complete-review takes a case out of pending_review;
  * every refusal is written to audit_logs.
"""

import uuid

from app.crud.gyne_cyto_report import publish_gyne_report
from app.crud.gyne_cyto_stain import create_stain, create_stain_run
from app.crud.gyne_diagnosis import create_initial_diagnosis, get_current_diagnosis
from app.models.audit_log import AuditLog
from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus
from app.schemas.gyne_cyto_stain import GyneStainCreate
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.utils.time import local_now
from tests.conftest import _login, _make_user
from tests.factories import (
    make_anatomical_pathology_test,
    make_bare_gyne_case,
    make_system_setting,
)


def _user(db, *roles):
    return _make_user(db, f"u_{uuid.uuid4().hex[:10]}", "TestPass1!", list(roles))


def _flagged_case(db, registrar_id, screener, pathologist=None, screener_role="cytotechnologist",
                  assign_screener=True, pathologist_signed=False):
    """A case the screener has signed out as abnormal → pending_review."""
    make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
    case = make_bare_gyne_case(db, registrar_id=registrar_id)
    if assign_screener:
        case.cytotechnologist_id = screener.id
    if pathologist:
        case.pathologist_id = pathologist.id
    db.commit()
    create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
    signers = [{"user_id": screener.id, "role": screener_role}]
    if pathologist:
        signers.append({
            "user_id": pathologist.id,
            "role": "primary",
            "signed_at": local_now() if pathologist_signed else None,
        })
    publish_gyne_report(
        db, case.id, signers=signers, current_user_id=screener.id, is_abnormal=True,
    )
    db.refresh(case)
    assert case.status == "pending_review"
    return case


def _latest_report(db, case_id):
    return (
        db.query(GyneCytoReport)
        .filter(GyneCytoReport.case_id == case_id)
        .order_by(GyneCytoReport.created_at.desc())
        .first()
    )


def _audit(db, case_id, action):
    db.expire_all()
    return (
        db.query(AuditLog)
        .filter(
            AuditLog.action == action,
            AuditLog.resource_type == "GyneCytologyCase",
            AuditLog.resource_id == case_id,
        )
        .all()
    )


def _review(client, case_id, result="agree", **extra):
    return client.post(
        f"/gyne-cyto-reports/cases/{case_id}/complete-review",
        json={"review_result": result, **extra},
    )


class TestReviewerMustBeAPathologist:
    def test_cytotech_gets_403_and_the_attempt_is_logged(self, db, client, admin_user):
        registrar, _ = admin_user
        screener, _ = _user(db, "cytotechnologist")
        other_ct, pwd = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener)

        r = _review(_login(client, other_ct.username, pwd), case.id)

        assert r.status_code == 403
        assert "pathologist" in r.json()["detail"]
        db.refresh(case)
        assert case.status == "pending_review"
        assert case.review_result is None
        denials = _audit(db, case.id, "QC_REVIEW_DENIED")
        assert len(denials) == 1
        assert denials[0].user_id == other_ct.id
        assert denials[0].new_values["reason"] == "role"

    def test_lab_manager_gets_403(self, db, lab_manager_client, admin_user):
        registrar, _ = admin_user
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener)

        r = _review(lab_manager_client, case.id, "disagree")

        assert r.status_code == 403
        db.refresh(case)
        assert case.status == "pending_review"

    def test_admin_without_the_pathologist_role_gets_403(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener)

        r = _review(admin_client, case.id)

        assert r.status_code == 403
        db.refresh(case)
        assert case.status == "pending_review"

    def test_admin_who_is_also_a_pathologist_may_review(self, db, client, admin_user):
        registrar, _ = admin_user
        screener, _ = _user(db, "cytotechnologist")
        admin_path, pwd = _user(db, "admin", "pathologist")
        case = _flagged_case(db, registrar.id, screener)

        r = _review(_login(client, admin_path.username, pwd), case.id)

        assert r.status_code == 200


class TestPathologistVerdict:
    def test_agree_publishes_the_report(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener, pathologist=pathologist)

        r = _review(pathologist_client, case.id, "agree")

        assert r.status_code == 200
        db.refresh(case)
        assert case.status == "published"
        assert case.review_result == "agree"
        assert case.reviewed_by_id == pathologist.id
        report = _latest_report(db, case.id)
        assert report.status == GyneReportStatus.PUBLISHED
        assert report.published_at is not None

    def test_disagree_sends_it_back_as_draft(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener, pathologist=pathologist)

        r = _review(pathologist_client, case.id, "disagree", discrepancy_level="major")

        assert r.status_code == 200
        db.refresh(case)
        assert case.status == "screened"
        assert case.review_result == "disagree"
        assert _latest_report(db, case.id).status == GyneReportStatus.DRAFT

    def test_assigned_pathologist_may_review_even_if_the_screener_stamped_them(
        self, db, pathologist_client, admin_user, pathologist_user
    ):
        """With require_all_gyne_sign off the screener's sign-off stamps every
        listed signer, the assigned pathologist included. That stamp is not the
        pathologist's own act, so it must not lock them out of the review."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(
            db, registrar.id, screener, pathologist=pathologist, pathologist_signed=True
        )

        r = _review(pathologist_client, case.id, "agree")

        assert r.status_code == 200


class TestNoSelfReview:
    def test_whoever_sent_it_for_review_is_refused(self, db, client, admin_user):
        """A dual-role account signing out as the screener routes the case into
        review — and then can't be the one to clear it."""
        registrar, _ = admin_user
        dual, pwd = _user(db, "pathologist", "cytotechnologist")
        case = _flagged_case(db, registrar.id, dual)
        assert case.review_requested_by_id == dual.id

        r = _review(_login(client, dual.username, pwd), case.id)

        assert r.status_code == 403
        assert "sent it for review" in r.json()["detail"]
        db.refresh(case)
        assert case.status == "pending_review"
        denials = _audit(db, case.id, "QC_REVIEW_DENIED")
        assert len(denials) == 1
        assert denials[0].new_values["reason"] == "self_review"

    def test_the_assigned_screener_is_refused(self, db, client, admin_user):
        registrar, _ = admin_user
        dual, pwd = _user(db, "pathologist", "cytotechnologist")
        submitter, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, submitter, assign_screener=False)
        case.cytotechnologist_id = dual.id
        db.commit()

        r = _review(_login(client, dual.username, pwd), case.id)

        assert r.status_code == 403
        assert "screening cytotechnologist" in r.json()["detail"]

    def test_reassigning_the_case_screener_does_not_lift_the_block(self, db, client, admin_user):
        """case.cytotechnologist_id stays PATCHable; the report under review froze
        who screened it."""
        registrar, _ = admin_user
        dual, pwd = _user(db, "pathologist", "cytotechnologist")
        submitter, _ = _user(db, "cytotechnologist")
        make_system_setting(db, enable_gyne_qc_system=True)
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(
            case_id=case.id,
            signers=[{"user_id": dual.id, "role": "cytotechnologist"}],
        ))
        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": submitter.id, "role": "primary"}],
            current_user_id=submitter.id, is_abnormal=True,
        )
        # Wipe every editable trace: the case field and the diagnosis signers.
        case.cytotechnologist_id = None
        diag = get_current_diagnosis(db, case.id)
        diag.signers = []
        db.commit()
        assert _latest_report(db, case.id).cytotechnologist_id == dual.id

        r = _review(_login(client, dual.username, pwd), case.id)

        assert r.status_code == 403
        assert "screening cytotechnologist" in r.json()["detail"]

    def test_a_cytotech_signer_on_the_report_is_refused(self, db, client, admin_user):
        registrar, _ = admin_user
        dual, pwd = _user(db, "pathologist", "cytotechnologist")
        submitter, _ = _user(db, "cytotechnologist")
        make_system_setting(db, enable_gyne_qc_system=True)
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        publish_gyne_report(
            db, case.id,
            signers=[
                {"user_id": submitter.id, "role": "cytotechnologist"},
                {"user_id": dual.id, "role": "co-sign cytotechnologist"},
            ],
            current_user_id=submitter.id, is_abnormal=True,
        )

        r = _review(_login(client, dual.username, pwd), case.id)

        assert r.status_code == 403
        assert "screener" in r.json()["detail"]


class TestPathologistReadOutNeedsNoReview:
    def test_own_abnormal_read_out_publishes_directly(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db, enable_gyne_qc_system=True)
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))

        report = publish_gyne_report(
            db, case.id,
            signers=[{"user_id": pathologist.id, "role": "primary"}],
            current_user_id=pathologist.id, is_abnormal=True,
        )

        db.refresh(case)
        assert case.status == "published"
        assert case.needs_review is False
        assert case.review_requested_by_id is None
        assert report.status == GyneReportStatus.PUBLISHED

    def test_dual_role_signing_as_screener_still_goes_to_review(self, db, admin_user):
        registrar, _ = admin_user
        dual, _ = _user(db, "pathologist", "cytotechnologist")
        case = _flagged_case(db, registrar.id, dual)

        assert case.review_reason == "abnormal"
        assert case.review_requested_by_id == dual.id


class TestNoOtherWayOutOfPendingReview:
    """Each of these used to move a pending_review case without a verdict."""

    def _setup(self, db, client, admin_user):
        registrar, _ = admin_user
        screener, pwd = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener)
        return case, _login(client, screener.username, pwd)

    def _assert_held(self, db, case, attempted):
        db.refresh(case)
        assert case.status == "pending_review"
        denials = _audit(db, case.id, "QC_BYPASS_BLOCKED")
        assert [d.new_values["attempted"] for d in denials] == [attempted]

    def test_re_publishing(self, db, client, admin_user):
        case, ct_client = self._setup(db, client, admin_user)

        r = ct_client.post(f"/gyne-cyto-reports/{case.id}/publish", json={"is_abnormal": False})

        assert r.status_code == 409
        self._assert_held(db, case, "publish")
        assert db.query(GyneCytoReport).filter(GyneCytoReport.case_id == case.id).count() == 1

    def test_revising_the_diagnosis(self, db, client, admin_user):
        case, ct_client = self._setup(db, client, admin_user)
        diag = get_current_diagnosis(db, case.id)

        r = ct_client.put(
            f"/gyne-diagnosis/{diag.id}/revise", json={"revised_reason": "make it NILM"}
        )

        assert r.status_code == 409
        self._assert_held(db, case, "revise_diagnosis")

    def test_patching_the_status(self, db, client, admin_user):
        case, ct_client = self._setup(db, client, admin_user)

        r = ct_client.patch(f"/gyne-cytology/{case.id}", json={"status": "published"})

        assert r.status_code == 409
        self._assert_held(db, case, "patch_status:published")

    def test_cancelling(self, db, client, admin_user):
        case, ct_client = self._setup(db, client, admin_user)

        r = ct_client.post(f"/gyne-cytology/{case.id}/cancel", json={"reason": "dup"})

        assert r.status_code == 409
        self._assert_held(db, case, "cancel")

    def test_a_stain_run_leaves_the_status_alone(self, db, admin_user):
        registrar, _ = admin_user
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener)
        ap_test = make_anatomical_pathology_test(db)
        stain = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=9))

        create_stain_run(
            db, stainer_id="ST-1", stain_ids=[stain.id],
            run_no=f"RUN-{uuid.uuid4().hex[:8]}", user_id=registrar.id,
        )

        db.refresh(case)
        assert case.status == "pending_review"


class TestPatchStatusOutsideReview:
    def test_cannot_mark_a_case_published_by_patch(self, db, client, admin_user):
        registrar, _ = admin_user
        ct, pwd = _user(db, "cytotechnologist")
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        r = _login(client, ct.username, pwd).patch(
            f"/gyne-cytology/{case.id}", json={"status": "published"}
        )

        assert r.status_code == 409
        db.refresh(case)
        assert case.status == "registered"

    def test_resending_the_current_status_still_saves(self, db, client, admin_user):
        """The registration edit modal sends the case's status back unchanged."""
        registrar, _ = admin_user
        ct, pwd = _user(db, "cytotechnologist")
        screener, _ = _user(db, "cytotechnologist")
        case = _flagged_case(db, registrar.id, screener)

        r = _login(client, ct.username, pwd).patch(
            f"/gyne-cytology/{case.id}",
            json={"status": "pending_review", "clinical_history": "edited"},
        )

        assert r.status_code == 200
        db.refresh(case)
        assert case.clinical_history == "edited"
        assert case.status == "pending_review"
