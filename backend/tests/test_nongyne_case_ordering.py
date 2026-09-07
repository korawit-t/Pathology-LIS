"""
Tests for get_nongyne_cases' prioritize_unreported ordering — the Pathologist
worklist's Non-Gyne "All" tab, which shows both finished and unfinished cases,
puts the ones still to be reported first (mirroring what Surgical's "All" tab
does with prioritize_status).

The ordering has to be the database's: the frontend Table's sorter only reaches
the rows already fetched, so an unreported case sitting past the page limit
never surfaced no matter how the client sorted.
"""

import pytest

from app.crud.nongyne_cyto_case import get_nongyne_cases

from tests.factories import make_bare_nongyne_case


def _make_case(db, registrar_id, pathologist_id, is_reported):
    """Cases are created oldest-first, so id order is creation order."""
    case = make_bare_nongyne_case(db, registrar_id=registrar_id)
    case.pathologist_id = pathologist_id
    case.is_reported = is_reported
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@pytest.fixture
def worklist(db, admin_user, pathologist_user):
    """One old unreported case, then two newer reported ones — the shape that
    the default newest-first ordering gets wrong."""
    registrar, _ = admin_user
    pathologist, _ = pathologist_user
    old_unreported = _make_case(db, registrar.id, pathologist.id, is_reported=False)
    newer_reported = _make_case(db, registrar.id, pathologist.id, is_reported=True)
    newest_reported = _make_case(db, registrar.id, pathologist.id, is_reported=True)
    return pathologist, old_unreported, newer_reported, newest_reported


class TestPrioritizeUnreported:
    def test_unreported_comes_first_even_when_it_is_the_oldest(self, db, worklist):
        pathologist, old_unreported, _, newest_reported = worklist

        result = get_nongyne_cases(
            db, assigned_user_id=pathologist.id, prioritize_unreported=True
        )

        ids = [c.id for c in result["items"]]
        assert ids[0] == old_unreported.id
        assert ids.index(old_unreported.id) < ids.index(newest_reported.id)

    def test_reported_cases_keep_their_newest_first_order(self, db, worklist):
        pathologist, _, newer_reported, newest_reported = worklist

        result = get_nongyne_cases(
            db, assigned_user_id=pathologist.id, prioritize_unreported=True
        )

        ids = [c.id for c in result["items"]]
        assert ids.index(newest_reported.id) < ids.index(newer_reported.id)

    def test_an_unreported_case_past_the_page_limit_still_reaches_page_one(
        self, db, worklist
    ):
        """The bug this fixes: with only newest-first ordering, the one case
        needing work fell off a limited page entirely."""
        pathologist, old_unreported, _, _ = worklist

        result = get_nongyne_cases(
            db, assigned_user_id=pathologist.id, limit=1, prioritize_unreported=True
        )

        assert [c.id for c in result["items"]] == [old_unreported.id]
        assert result["total"] == 3

    def test_ordering_only_changes_when_asked(self, db, worklist):
        """Every other caller — the other worklist tabs included — keeps the
        newest-first order it had."""
        pathologist, old_unreported, _, newest_reported = worklist

        result = get_nongyne_cases(db, assigned_user_id=pathologist.id)

        ids = [c.id for c in result["items"]]
        assert ids[0] == newest_reported.id
        assert ids[-1] == old_unreported.id

    def test_it_orders_without_filtering_anything_out(self, db, worklist):
        pathologist, _, _, _ = worklist

        prioritized = get_nongyne_cases(
            db, assigned_user_id=pathologist.id, prioritize_unreported=True
        )
        plain = get_nongyne_cases(db, assigned_user_id=pathologist.id)

        assert prioritized["total"] == plain["total"] == 3
        assert {c.id for c in prioritized["items"]} == {c.id for c in plain["items"]}
