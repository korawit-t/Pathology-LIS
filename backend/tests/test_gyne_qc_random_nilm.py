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

from app.crud.gyne_cyto_report import publish_gyne_report
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
