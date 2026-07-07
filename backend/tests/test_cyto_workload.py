"""Tests for app/crud/cyto_workload.py — by far the most logic-dense of the
crud batch it's part of. get_workload_stats aggregates Gyne + NonGyne slide
counts per (user, date), classifies NonGyne specimens into conventional vs
"liquid" (half-weighted), and computes a hours-based compliance limit. Each
of those is real, easy-to-get-wrong arithmetic, so this file gets thorough
coverage; upsert/get_workload_log are thin and get lighter coverage."""

from datetime import date, datetime, time

from app.crud.cyto_workload import upsert_workload_log, get_workload_log, get_workload_stats
from app.schemas.cyto_workload import CytoWorkloadLogUpsert
from app.models.gyne_cyto_stain import GyneCytologyStain
from app.models.nongyne_cyto_stain import NongyneCytologyStain

from tests.factories import make_bare_gyne_case, make_bare_nongyne_case, make_anatomical_pathology_test

WORK_DATE = date(2026, 1, 15)


def _gyne_case_with_stains(db, registrar_id, cytotech_id, test_id, n_stains=1, work_date=WORK_DATE):
    case = make_bare_gyne_case(db, registrar_id=registrar_id)
    case.cytotechnologist_id = cytotech_id
    case.screened_at = datetime.combine(work_date, time(10, 0))
    db.commit()
    for i in range(n_stains):
        db.add(GyneCytologyStain(case_id=case.id, test_id=test_id, slide_no=i + 1))
    db.commit()
    return case


def _nongyne_case_with_stains(
    db, registrar_id, cytotech_id, test_id, specimen_type="FNA", is_cell_block=False,
    n_stains=1, work_date=WORK_DATE,
):
    case = make_bare_nongyne_case(db, registrar_id=registrar_id)
    case.cytotechnologist_id = cytotech_id
    case.screened_at = datetime.combine(work_date, time(10, 0))
    case.specimen_type = specimen_type
    case.is_cell_block = is_cell_block
    db.commit()
    for i in range(n_stains):
        db.add(NongyneCytologyStain(case_id=case.id, test_id=test_id, slide_no=i + 1))
    db.commit()
    return case


class TestUpsertWorkloadLog:
    def test_creates_a_new_log(self, db, admin_user):
        registrar, _ = admin_user

        result = upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=registrar.id, work_date=WORK_DATE, reading_hours=6.5), recorded_by_id=registrar.id,
        )

        assert result.reading_hours == 6.5
        assert get_workload_log(db, registrar.id, WORK_DATE).id == result.id

    def test_second_upsert_for_the_same_user_and_date_updates_in_place(self, db, admin_user):
        registrar, _ = admin_user
        first = upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=registrar.id, work_date=WORK_DATE, reading_hours=4), recorded_by_id=registrar.id,
        )

        result = upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=registrar.id, work_date=WORK_DATE, reading_hours=7, note="corrected"),
            recorded_by_id=registrar.id,
        )

        assert result.id == first.id
        assert result.reading_hours == 7
        assert result.note == "corrected"

    def test_get_workload_log_returns_none_when_absent(self, db, admin_user):
        registrar, _ = admin_user
        assert get_workload_log(db, registrar.id, WORK_DATE) is None


class TestGetWorkloadStats:
    def test_counts_gyne_slides_for_the_assigned_cytotechnologist(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="PAP1")
        _gyne_case_with_stains(db, registrar.id, cytotech.id, test.id, n_stains=3)

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert len(result) == 1
        row = result[0]
        assert row.gyne_slides == 3
        assert row.nongyne_conv_slides == 0
        assert row.nongyne_liquid_slides == 0
        assert row.effective_count == 3.0

    def test_ignores_gyne_cases_with_no_cytotechnologist_assigned(self, db, admin_user):
        registrar, _ = admin_user
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="PAP2")
        _gyne_case_with_stains(db, registrar.id, cytotech_id=None, test_id=test.id)

        # user_ids=[] is falsy and would be treated as "no filter" by the
        # crud function, exposing this assertion to real data committed by
        # every other test on the same WORK_DATE — an out-of-range id keeps
        # the filter active while still excluding everything real.
        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[10_000_000])

        assert result == []

    def test_classifies_nongyne_liquid_specimen_types_separately_from_conventional(
        self, db, admin_user, two_pathologists,
    ):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG1")
        _nongyne_case_with_stains(db, registrar.id, cytotech.id, test.id, specimen_type="Urine", n_stains=2)
        _nongyne_case_with_stains(db, registrar.id, cytotech.id, test.id, specimen_type="FNA", n_stains=4)

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        row = result[0]
        assert row.nongyne_liquid_slides == 2  # Urine
        assert row.nongyne_conv_slides == 4  # FNA

    def test_is_cell_block_flag_forces_liquid_classification_regardless_of_specimen_type(
        self, db, admin_user, two_pathologists,
    ):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG2")
        # "FNA" isn't in NONGYNE_LIQUID_TYPES, but is_cell_block=True should still count it as liquid
        _nongyne_case_with_stains(db, registrar.id, cytotech.id, test.id, specimen_type="FNA", is_cell_block=True, n_stains=2)

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        row = result[0]
        assert row.nongyne_liquid_slides == 2
        assert row.nongyne_conv_slides == 0

    def test_liquid_slides_are_weighted_at_half_in_effective_count(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG3")
        _nongyne_case_with_stains(db, registrar.id, cytotech.id, test.id, specimen_type="Urine", n_stains=4)

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert result[0].effective_count == 2.0  # 4 liquid slides * 0.5

    def test_adjusted_limit_scales_with_reading_hours_capped_at_8(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG4")
        _gyne_case_with_stains(db, registrar.id, cytotech.id, test.id, n_stains=1)
        upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=cytotech.id, work_date=WORK_DATE, reading_hours=4), recorded_by_id=registrar.id,
        )

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert result[0].adjusted_limit == 50.0  # 100 * min(4, 8) / 8

    def test_reading_hours_over_8_are_capped_not_extrapolated(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG5")
        _gyne_case_with_stains(db, registrar.id, cytotech.id, test.id, n_stains=1)
        upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=cytotech.id, work_date=WORK_DATE, reading_hours=10), recorded_by_id=registrar.id,
        )

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert result[0].adjusted_limit == 100.0  # capped at 8h, not 125

    def test_no_reading_hours_logged_defaults_the_limit_to_100(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG6")
        _gyne_case_with_stains(db, registrar.id, cytotech.id, test.id, n_stains=1)

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert result[0].adjusted_limit == 100.0
        assert result[0].reading_hours is None

    def test_is_compliant_reflects_effective_count_against_adjusted_limit(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG7")
        _gyne_case_with_stains(db, registrar.id, cytotech.id, test.id, n_stains=60)
        upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=cytotech.id, work_date=WORK_DATE, reading_hours=4), recorded_by_id=registrar.id,
        )  # adjusted_limit = 50, effective = 60 -> non-compliant

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert result[0].effective_count == 60.0
        assert result[0].adjusted_limit == 50.0
        assert result[0].is_compliant is False

    def test_includes_hours_only_entries_with_zero_slide_counts(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        upsert_workload_log(
            db, CytoWorkloadLogUpsert(user_id=cytotech.id, work_date=WORK_DATE, reading_hours=8, note="Admin day"),
            recorded_by_id=registrar.id,
        )

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert len(result) == 1
        assert result[0].gyne_slides == 0
        assert result[0].effective_count == 0.0
        assert result[0].note == "Admin day"

    def test_user_ids_filter_excludes_other_users(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech_a, cytotech_b = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG8")
        _gyne_case_with_stains(db, registrar.id, cytotech_a.id, test.id, n_stains=1)
        _gyne_case_with_stains(db, registrar.id, cytotech_b.id, test.id, n_stains=1)

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech_a.id])

        assert {r.user_id for r in result} == {cytotech_a.id}

    def test_excludes_dates_outside_the_requested_range(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        cytotech, _ = two_pathologists
        test = make_anatomical_pathology_test(db, category="Cytology", system_code="NG9")
        _gyne_case_with_stains(db, registrar.id, cytotech.id, test.id, work_date=date(2025, 1, 1))

        result = get_workload_stats(db, WORK_DATE, WORK_DATE, user_ids=[cytotech.id])

        assert result == []
