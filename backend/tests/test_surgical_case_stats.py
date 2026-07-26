"""Characterization tests for the 8 stats/dashboard endpoints in
routers/surgical_case.py that are currently fully inline (query-building
and business logic living directly in the route handler, violating the
project's router->crud convention). Written against the CURRENT
implementation to lock in behavior before it's extracted into
crud/surgical_case.py — these must stay green, unmodified, before and
after each extraction item to prove the refactor is behavior-preserving.

Each test scopes its data with a fresh pathologist_id (and/or tight
date_from/date_to bounds) so it isn't polluted by SurgicalCase rows
committed by other tests in the same real-Postgres session (see
conftest.py / CLAUDE.md testing notes: no per-test DB reset).
"""

import random
import uuid
from datetime import datetime, timedelta

from app.models.molecular_case import MolecularCase
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.enums.quality_enum import QualityEnum
from app.utils.tat import business_days_between, get_holiday_dates

from tests.factories import (
    make_bare_case,
    make_block,
    make_block_stain,
    make_anatomical_pathology_test,
)


def _add_specimen(db, case_id):
    from app.models.surgical_specimen import SurgicalSpecimen
    specimen = SurgicalSpecimen(case_id=case_id, specimen_label="A", specimen_name=f"Specimen {uuid.uuid4().hex[:6]}")
    db.add(specimen)
    db.commit()
    db.refresh(specimen)
    return specimen


def _stain_case(db, registrar_id, pathologist_id, category, *, is_external=False, name=None):
    """A case with one block/stain of the given AP-test category, so it
    counts toward he_slides/special_stain_slides/ihc_slides in
    workload-summary/workload-daily/workload-ihc-top/immuno-stats."""
    case = make_bare_case(db, registrar_id)
    case.pathologist_id = pathologist_id
    db.commit()
    specimen = _add_specimen(db, case.id)
    block = make_block(db, specimen.id)
    test = make_anatomical_pathology_test(
        db, category=category, name=name or f"{category} Test {uuid.uuid4().hex[:6]}"
    )
    if is_external:
        test.is_external = True
        db.commit()
    make_block_stain(db, block.id, test_id=test.id, status="pending")
    return case


class TestWorkloadSummary:
    def test_counts_and_conditional_signed_cases(self, db, admin_client, pathologist_user):
        pathologist, _ = pathologist_user
        registrar_id = pathologist.id

        he_case = _stain_case(db, registrar_id, pathologist.id, "Histochem", name="H&E Stain")
        ihc_case = _stain_case(db, registrar_id, pathologist.id, "IHC")

        # Mark he_case's diagnosis as signed, to exercise the signed_cases branch.
        db.add(SurgicalDiagnosis(case_id=he_case.id, status="signed"))
        db.commit()

        r = admin_client.get(
            "/surgical-cases/workload-summary",
            params={"pathologist_id": pathologist.id},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total_cases"] == 2
        assert body["total_blocks"] == 2
        assert body["he_slides"] == 1
        assert body["ihc_slides"] == 1
        assert body["signed_cases"] == 1

        # Without pathologist_id, signed_cases key must not appear at all.
        r2 = admin_client.get("/surgical-cases/workload-summary")
        assert "signed_cases" not in r2.json()


class TestWorkloadDaily:
    def test_zero_fills_every_day_in_range(self, db, admin_client, pathologist_user):
        pathologist, _ = pathologist_user
        today = datetime.utcnow().date()
        case = _stain_case(db, pathologist.id, pathologist.id, "IHC")
        case.registered_at = datetime.combine(today, datetime.min.time())
        db.commit()

        r = admin_client.get(
            "/surgical-cases/workload-daily",
            params={
                "pathologist_id": pathologist.id,
                "date_from": str(today - timedelta(days=1)),
                "date_to": str(today + timedelta(days=1)),
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 3  # every day in the 3-day range present, even with 0 cases
        by_date = {row["date"]: row for row in body}
        assert by_date[str(today)]["cases"] == 1
        assert by_date[str(today)]["ihc_slides"] == 1
        assert by_date[str(today - timedelta(days=1))]["cases"] == 0


class TestWorkloadIhcTop:
    def test_orders_by_count_desc_and_respects_limit(self, db, admin_client, pathologist_user):
        pathologist, _ = pathologist_user
        popular = make_anatomical_pathology_test(db, category="IHC", name=f"Popular {uuid.uuid4().hex[:6]}")
        rare = make_anatomical_pathology_test(db, category="IHC", name=f"Rare {uuid.uuid4().hex[:6]}")

        for test, n in ((popular, 3), (rare, 1)):
            for _ in range(n):
                case = make_bare_case(db, pathologist.id)
                case.pathologist_id = pathologist.id
                db.commit()
                specimen = _add_specimen(db, case.id)
                block = make_block(db, specimen.id)
                make_block_stain(db, block.id, test_id=test.id)

        r = admin_client.get(
            "/surgical-cases/workload-ihc-top",
            params={"pathologist_id": pathologist.id, "limit": 1},
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1  # limit respected
        assert body[0]["name"] == popular.name
        assert body[0]["count"] == 3


class TestImmunoStats:
    def test_pending_counts_split_internal_external_and_molecular(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        _stain_case(db, registrar.id, None, "IHC", is_external=False)
        _stain_case(db, registrar.id, None, "IHC", is_external=True)
        ap_test = make_anatomical_pathology_test(db, category="IHC", name=f"Molecular AP {uuid.uuid4().hex[:6]}")
        # A purely-numeric 5-digit suffix, not a hex one: _get_next_molecular_accession_no
        # order_by(accession_no.desc())'s to find the "last" row, then int()-parses its
        # suffix to increment — a hex suffix sorts after real sequential numbers and fails
        # that parse, silently resetting the run counter to 1 and colliding with whatever
        # other test in the same session already claimed "M26-00001" (same gotcha already
        # documented for surgical accessions in test_surgical_case.py).
        db.add(MolecularCase(
            accession_no=f"M26-{random.randint(10000, 99999)}",
            ap_test_id=ap_test.id,
            status="pending",
            registrar_id=registrar.id,
        ))
        db.commit()

        r = admin_client.get("/surgical-cases/immuno-stats")
        assert r.status_code == 200
        body = r.json()
        for key in (
            "pending_ihc", "pending_special_stain", "pending_ihc_internal",
            "pending_special_stain_internal", "pending_ihc_outlab",
            "pending_special_stain_outlab", "pending_molecular_outlab",
        ):
            assert key in body
        assert body["pending_ihc"] >= 2
        assert body["pending_ihc_internal"] >= 1
        assert body["pending_ihc_outlab"] >= 1
        assert body["pending_molecular_outlab"] >= 1


def _expected_bucket(tat_days: float) -> str:
    """Same lt3/t3_5/t5_10/gt10 rule the router currently implements twice
    (get_tat_stats and get_tat_cases) — used here as the independent
    expectation both endpoints are checked against."""
    if tat_days < 3:
        return "lt3"
    elif tat_days < 5:
        return "t3_5"
    elif tat_days <= 10:
        return "t5_10"
    return "gt10"


class TestTatStatsAndTatCases:
    """tat-stats and tat-cases currently reimplement the same bucket rule
    independently (a drift risk this cleanup fixes) — tested together since
    both must agree on the same seeded cases."""

    def _seed_cases(self, db, registrar_id, pathologist_id, holidays):
        # Deliberately generous spacing (not exact-boundary values) so the
        # expected bucket is unambiguous regardless of weekday/holiday
        # alignment; the actual bucket is derived via the same
        # business_days_between() production util, not guessed.
        now = datetime.utcnow()
        offsets_hours = [4, 96, 168, 480]  # ~0.17d, ~4d, ~7d, ~20d of wall-clock spacing
        cases = []
        for hours in offsets_hours:
            case = make_bare_case(db, registrar_id)
            case.pathologist_id = pathologist_id
            case.registered_at = now
            case.report_at = now + timedelta(hours=hours)
            case.is_express = False
            db.commit()
            db.refresh(case)
            tat = business_days_between(case.registered_at, case.report_at, holidays)
            cases.append((case, tat, _expected_bucket(tat)))
        return cases

    def test_tat_stats_distribution_matches_independent_computation(self, db, admin_client, pathologist_user):
        pathologist, _ = pathologist_user
        holidays = get_holiday_dates(db)
        cases = self._seed_cases(db, pathologist.id, pathologist.id, holidays)

        expected_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
        for _, _, bucket in cases:
            expected_dist[bucket] += 1

        r = admin_client.get(
            "/surgical-cases/tat-stats",
            params={"pathologist_id": pathologist.id},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total_reported"] == len(cases)
        assert body["distribution"] == expected_dist

    def test_tat_cases_bucket_filter_matches_tat_stats(self, db, admin_client, pathologist_user):
        pathologist, _ = pathologist_user
        holidays = get_holiday_dates(db)
        cases = self._seed_cases(db, pathologist.id, pathologist.id, holidays)

        for _, _, bucket in cases:
            r = admin_client.get(
                "/surgical-cases/tat-cases",
                params={"pathologist_id": pathologist.id, "bucket": bucket},
            )
            assert r.status_code == 200
            returned_ids = {row["id"] for row in r.json()}
            expected_ids = {c.id for c, _, b in cases if b == bucket}
            assert returned_ids == expected_ids

    def test_tat_stats_empty_result_shape(self, db, admin_client, pathologist_user):
        pathologist, _ = pathologist_user
        r = admin_client.get(
            "/surgical-cases/tat-stats",
            params={"pathologist_id": pathologist.id},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total_reported"] == 0
        assert body["distribution"] == {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
        assert body["monthly"] == []


class TestCancerRegistrySummary:
    def test_malignant_benign_split_and_top_specimens(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        today = datetime.utcnow().date()

        malignant = make_bare_case(db, registrar.id)
        malignant.has_malignancy = True
        db.commit()
        spec = _add_specimen(db, malignant.id)
        spec.specimen_name = "Breast"
        db.commit()

        benign = make_bare_case(db, registrar.id)
        benign.has_malignancy = False
        db.commit()

        r = admin_client.get(
            "/surgical-cases/cancer-registry-summary",
            params={"date_from": str(today), "date_to": str(today)},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["malignant"] >= 1
        assert body["benign"] >= 1
        assert body["total"] >= 2
        specimen_names = {row["specimen_name"] for row in body["by_specimen"]}
        assert "Breast" in specimen_names
        assert len(body["by_specimen"]) <= 15
        month_key = today.strftime("%Y-%m")
        assert any(m["month"] == month_key for m in body["monthly"])


class TestSlideQualityStats:
    def test_groups_by_quality_with_unspecified_fallback(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        today = datetime.utcnow().date()

        good_case = make_bare_case(db, registrar.id)
        good_case.slide_quality = QualityEnum.good
        db.commit()

        unspecified_case = make_bare_case(db, registrar.id)
        # slide_quality left as None -> falls into "unspecified"
        db.commit()

        r = admin_client.get(
            "/surgical-cases/slide-quality-stats",
            params={"start_date": str(today), "end_date": str(today)},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["slide_quality"]["good"] >= 1
        assert body["slide_quality"]["unspecified"] >= 1
        assert body["total"] == sum(body["slide_quality"].values())
        assert body["stain_quality"] is None
