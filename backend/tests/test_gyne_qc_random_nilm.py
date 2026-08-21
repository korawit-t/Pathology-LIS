"""Tests for the random NILM QC sampling on gyne cytology sign-out.

When a cytotechnologist (not a pathologist) publishes a NILM/normal gyne case and
the Gyne QC system is enabled, `publish_gyne_report` gives the case a
``nilm_review_every_n`` percent chance of being routed to pathologist QC review
(`review_reason = "random_10pct"`) instead of publishing directly. This proves the
gate still fires per-publish and honours every condition. See
`app/crud/gyne_cyto_report.py`.
"""

import uuid
from unittest.mock import patch

from app.crud.gyne_cyto_report import complete_gyne_review, publish_gyne_report
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.models.gyne_diagnosis import GyneSpecimenAdequacy
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from tests.factories import make_bare_gyne_case, make_system_setting
from tests.conftest import _make_user

_RND = "app.crud.gyne_cyto_report.random.random"


def _cytotech(db):
    user, _ = _make_user(db, f"cyto_{uuid.uuid4().hex[:8]}", "CytoPass1!", ["cytotechnologist"])
    return user


def _nilm_case(db, registrar_id, cytotech_id):
    """A gyne case owned by a cytotech with a plain NILM diagnosis (no category_1)."""
    case = make_bare_gyne_case(db, registrar_id=registrar_id)
    case.cytotechnologist_id = cytotech_id
    db.commit()
    create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
    return case


class TestGyneRandomNilmQc:
    def test_nilm_sampled_into_qc_when_roll_below_threshold(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        cyto = _cytotech(db)
        case = _nilm_case(db, registrar.id, cyto.id)

        with patch(_RND, return_value=0.0):  # 0.0 < 0.10 → sampled
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.needs_review is True
        assert case.review_reason == "random_10pct"
        assert case.status == "pending_review"

    def test_nilm_published_when_roll_above_threshold(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        cyto = _cytotech(db)
        case = _nilm_case(db, registrar.id, cyto.id)

        with patch(_RND, return_value=0.99):  # 0.99 ≥ 0.10 → not sampled
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.status == "published"
        assert case.review_reason is None

    def test_pathologist_publisher_bypasses_sampling(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path_user, _ = pathologist_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        cyto = _cytotech(db)
        case = _nilm_case(db, registrar.id, cyto.id)

        # Roll of 0.0 WOULD sample — but a pathologist signing off is itself the review.
        with patch(_RND, return_value=0.0):
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": path_user.id, "role": "primary"}],
                current_user_id=path_user.id, is_abnormal=False,
            )

        assert case.status == "published"
        assert case.review_reason is None

    def test_qc_disabled_publishes_directly(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=False, nilm_review_every_n=10)
        cyto = _cytotech(db)
        case = _nilm_case(db, registrar.id, cyto.id)

        with patch(_RND, return_value=0.0):
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.status == "published"
        assert case.review_reason is None

    def test_abnormal_always_reviewed_not_via_random_pool(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        cyto = _cytotech(db)
        case = _nilm_case(db, registrar.id, cyto.id)

        with patch(_RND, return_value=0.99):  # would NOT sample, but abnormal forces review
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=True,
            )

        assert case.needs_review is True
        assert case.review_reason == "abnormal"
        assert case.status == "pending_review"

    def test_unsatisfactory_adequacy_always_reviewed_even_if_client_flag_false(self, db, admin_user):
        """Unsatisfactory specimens must route to pathologist QC review just like an
        abnormal category — re-derived server-side so a stale/wrong client is_abnormal
        flag can't let one slip into the random NILM pool or straight to publish."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        cyto = _cytotech(db)
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.cytotechnologist_id = cyto.id
        db.commit()

        adequacy = GyneSpecimenAdequacy(
            group_type="ADEQUACY", text="Unsatisfactory for evaluation (PAP)", code="031",
        )
        db.add(adequacy)
        db.commit()
        create_initial_diagnosis(
            db, GyneDiagnosisCreate(case_id=case.id, adequacy_id=adequacy.id)
        )

        with patch(_RND, return_value=0.99):  # would NOT sample, but unsatisfactory forces review
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.needs_review is True
        assert case.review_reason == "abnormal"
        assert case.status == "pending_review"

    def test_threshold_honours_nilm_review_every_n(self, db, admin_user):
        """Gate is `random() < n/100`, evaluated fresh per publish — at n=50 a 0.40
        roll samples, a 0.60 roll doesn't, proving it's probabilistic each case."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=50)
        cyto = _cytotech(db)

        outcomes = []
        for roll in (0.40, 0.60):
            case = _nilm_case(db, registrar.id, cyto.id)
            with patch(_RND, return_value=roll):
                publish_gyne_report(
                    db, case.id,
                    signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                    current_user_id=cyto.id, is_abnormal=False,
                )
            outcomes.append(case.review_reason)

        assert outcomes[0] == "random_10pct"  # 0.40 < 0.50 → sampled
        assert outcomes[1] is None            # 0.60 ≥ 0.50 → published


class TestReFlagClearsPriorVerdict:
    """A case bounced back on a Disagree and then re-published must return to the QC
    Review page's *Pending* bucket, not sit under Reviewed wearing the old verdict.
    That bucket is `review_result IS NULL`, so re-flagging has to clear the stamp
    `complete_gyne_review` left on the case."""

    def _bounce_back(self, db, admin_user, cyto, path_user, is_abnormal):
        registrar, _ = admin_user
        case = _nilm_case(db, registrar.id, cyto.id)
        with patch(_RND, return_value=0.0):
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=is_abnormal,
            )
        complete_gyne_review(
            db, case.id, reviewer_id=path_user.id, review_result="disagree",
            review_note="Missed an ASC-US", discrepancy_level="major",
        )
        assert case.review_result == "disagree"  # precondition for the re-publish
        assert case.status == "screened"
        return case

    def test_random_nilm_re_flag_clears_disagree_verdict(
        self, db, admin_user, pathologist_user
    ):
        path_user, _ = pathologist_user
        cyto = _cytotech(db)
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        case = self._bounce_back(db, admin_user, cyto, path_user, is_abnormal=False)

        with patch(_RND, return_value=0.0):  # sampled again
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.status == "pending_review"
        assert case.review_reason == "random_10pct"
        assert case.needs_review is True
        assert case.review_result is None
        assert case.review_note is None
        assert case.reviewed_by_id is None
        assert case.reviewed_at is None
        assert case.discrepancy_level is None

    def test_abnormal_re_flag_clears_disagree_verdict(
        self, db, admin_user, pathologist_user
    ):
        path_user, _ = pathologist_user
        cyto = _cytotech(db)
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        case = self._bounce_back(db, admin_user, cyto, path_user, is_abnormal=True)

        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
            current_user_id=cyto.id, is_abnormal=True,
        )

        assert case.status == "pending_review"
        assert case.review_reason == "abnormal"
        assert case.needs_review is True
        assert case.review_result is None
        assert case.reviewed_by_id is None
        assert case.discrepancy_level is None

    def test_publishing_without_re_flag_keeps_the_agree_history(
        self, db, admin_user, pathologist_user
    ):
        """The verdict is only cleared when the case is actually routed back into
        review — a NILM that publishes straight through keeps its QC history."""
        registrar, _ = admin_user
        path_user, _ = pathologist_user
        cyto = _cytotech(db)
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)

        case = _nilm_case(db, registrar.id, cyto.id)
        with patch(_RND, return_value=0.0):
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )
        complete_gyne_review(db, case.id, reviewer_id=path_user.id, review_result="agree")

        with patch(_RND, return_value=0.99):  # not sampled → publishes directly
            publish_gyne_report(
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.status == "published"
        assert case.review_result == "agree"
        assert case.reviewed_by_id == path_user.id


class TestDualRolePublisher:
    """One account holding both "pathologist" and "cytotechnologist" is normal in a
    small lab. The exemption is for a pathologist *reading the case out*, so it has
    to key off the hat worn in this publish (the signer row), not the roles array —
    otherwise a dual-role screener empties the NILM pool at every sampling rate."""

    def _dual_role_user(self, db):
        user, _ = _make_user(
            db, f"dual_{uuid.uuid4().hex[:8]}", "DualPass1!",
            ["admin", "pathologist", "cytotechnologist"],
        )
        return user

    def test_dual_role_signing_as_cytotech_is_still_sampled(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        dual = self._dual_role_user(db)
        case = _nilm_case(db, registrar.id, dual.id)

        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": dual.id, "role": "cytotechnologist"}],
            current_user_id=dual.id, is_abnormal=False,
        )

        assert case.review_reason == "random_10pct"
        assert case.status == "pending_review"

    def test_dual_role_signing_as_primary_still_bypasses(self, db, admin_user):
        """Same account, pathologist hat — they read it out, so it publishes."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        dual = self._dual_role_user(db)
        case = _nilm_case(db, registrar.id, dual.id)

        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": dual.id, "role": "primary"}],
            current_user_id=dual.id, is_abnormal=False,
        )

        assert case.status == "published"
        assert case.review_reason is None

    def test_rate_100_always_samples_a_cytotech_publish(self, db, admin_user):
        """`random() < 1.0` can never be false, so 100% must flag every NILM case."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        cyto = _cytotech(db)

        for _ in range(5):
            case = _nilm_case(db, registrar.id, cyto.id)
            publish_gyne_report(  # real random, no patch
                db, case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id, is_abnormal=False,
            )
            assert case.review_reason == "random_10pct"
            assert case.status == "pending_review"

    def test_co_sign_cytotech_role_counts_as_screening(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        dual = self._dual_role_user(db)
        case = _nilm_case(db, registrar.id, dual.id)

        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": dual.id, "role": "co-sign cytotechnologist"}],
            current_user_id=dual.id, is_abnormal=False,
        )

        assert case.review_reason == "random_10pct"

    def test_pure_pathologist_without_signers_still_bypasses(
        self, db, admin_user, pathologist_user
    ):
        """No signer row for the publisher → fall back to the roles array."""
        registrar, _ = admin_user
        path_user, _ = pathologist_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        cyto = _cytotech(db)
        case = _nilm_case(db, registrar.id, cyto.id)

        publish_gyne_report(
            db, case.id, signers=None,
            current_user_id=path_user.id, is_abnormal=False,
        )

        assert case.status == "published"
        assert case.review_reason is None


class TestSamplingDoesNotFailOpen:
    """`cytotechnologist_id` is optional at registration and a screener whose account
    lacks the cytotechnologist role signs as "primary", so the screener often can't be
    identified at publish time. That must not silently exempt the case from QC — the
    screener's name is notification detail, not a precondition for sampling."""

    def _unassigned_nilm_case(self, db, registrar_id):
        """A case with NO cytotechnologist_id — the registrar skipped 'Screened by'."""
        case = make_bare_gyne_case(db, registrar_id=registrar_id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        return case

    def test_sampled_with_no_cytotech_id_and_empty_signers(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        cyto = _cytotech(db)
        case = self._unassigned_nilm_case(db, registrar.id)

        publish_gyne_report(
            db, case.id, signers=[], current_user_id=cyto.id, is_abnormal=False,
        )

        assert case.review_reason == "random_10pct"
        assert case.status == "pending_review"
        assert case.cytotechnologist_id is None  # still unknown, still sampled

    def test_sampled_when_screener_signed_as_primary(self, db, admin_user):
        """Screener's account lacks the cytotechnologist role → stamped "primary"."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)
        screener, _ = _make_user(
            db, f"lab_{uuid.uuid4().hex[:8]}", "LabPass1!", ["lab_manager"],
        )
        case = self._unassigned_nilm_case(db, registrar.id)

        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": screener.id, "role": "primary"}],
            current_user_id=screener.id, is_abnormal=False,
        )

        assert case.review_reason == "random_10pct"
        assert case.status == "pending_review"

    def test_not_sampled_when_rate_is_zero(self, db, admin_user):
        """Removing the ct_user_id gate must not make rate=0 start flagging."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=0)
        cyto = _cytotech(db)
        case = self._unassigned_nilm_case(db, registrar.id)

        with patch(_RND, return_value=0.0):
            publish_gyne_report(
                db, case.id, signers=[], current_user_id=cyto.id, is_abnormal=False,
            )

        assert case.status == "published"
        assert case.review_reason is None


class TestMultiRoleCytotech:
    """Lab staff commonly hold several roles at once (cytotechnologist + histo +
    gross). Only the pathologist roles change QC routing — every other role is
    additive and must not affect sampling either way."""

    def _publish_as(self, db, registrar_id, roles, signer_role="cytotechnologist"):
        user, _ = _make_user(db, f"m_{uuid.uuid4().hex[:8]}", "MultiPass1!", roles)
        case = _nilm_case(db, registrar_id, user.id)
        publish_gyne_report(
            db, case.id,
            signers=[{"user_id": user.id, "role": signer_role}],
            current_user_id=user.id, is_abnormal=False,
        )
        return case

    def test_cytotech_with_histo_and_gross_is_sampled(self, db, admin_user):
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)

        case = self._publish_as(
            db, registrar.id, ["cytotechnologist", "histo", "gross"],
        )

        assert case.review_reason == "random_10pct"
        assert case.status == "pending_review"

    def test_histo_gross_without_cytotech_role_is_still_sampled(self, db, admin_user):
        """No cytotechnologist role → the frontend stamps them "primary". They are
        still not a pathologist, so the NILM they signed out belongs in the pool."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)

        case = self._publish_as(
            db, registrar.id, ["histo", "gross"], signer_role="primary",
        )

        assert case.review_reason == "random_10pct"

    def test_only_pathologist_roles_change_routing(self, db, admin_user):
        """The exemption keys on pathologist/senior_pathologist alone — adding
        histo/gross/lab_manager to a pathologist must not un-exempt them."""
        registrar, _ = admin_user
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=100)

        case = self._publish_as(
            db, registrar.id,
            ["pathologist", "histo", "gross", "lab_manager"],
            signer_role="primary",
        )

        assert case.status == "published"
        assert case.review_reason is None
