#!/usr/bin/env python
"""Seed the cyto-path QC ledger from history that already exists.

Gyne has been recording the pathologist's agree/disagree verdict on the case
since the 10% QC review shipped, so every reviewed gyne case can be graded
retroactively — the ledger's gyne statistics are useful the day it is switched
on. What no case ever stored is the cytotechnologist's *original* wording, so
backfilled rows carry `screening_recovered: false` in `screening_flags` and
show an empty screening column in the side-by-side view. Only cases signed out
after this feature ships have both halves.

Non-gyne has no historical verdict at all, so nothing is backfilled for it; its
statistics start from the next case a cytotech hands over.

    python scripts/backfill_cyto_path_correlations.py --dry-run
    python scripts/backfill_cyto_path_correlations.py
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: F401,E402  (register every mapper)
from app.crud.cyto_path_correlation import _gyne_text, _strip_html, get_row  # noqa: E402
from app.models.cyto_path_correlation import CytoPathCorrelation  # noqa: E402
from app.models.gyne_cyto_case import GyneCytologyCase  # noqa: E402
from app.models.gyne_diagnosis import GyneDiagnosis  # noqa: E402


def _session():
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set. Run this from the backend directory, with the .env in place.")
    return sessionmaker(bind=create_engine(url))()


def _verdict(case: GyneCytologyCase) -> str | None:
    if case.review_result == "agree":
        return "concordant"
    if case.review_result == "disagree":
        if case.discrepancy_level == "major":
            return "major_discrepancy"
        if case.discrepancy_level == "minor":
            return "minor_discrepancy"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = parser.parse_args()

    db = _session()
    created = skipped = ungraded = 0

    cases = (
        db.query(GyneCytologyCase)
        .filter(GyneCytologyCase.review_result.isnot(None))
        .order_by(GyneCytologyCase.id)
        .all()
    )
    print(f"{len(cases)} gyne case(s) carry a QC review verdict.")

    for case in cases:
        if get_row(db, "gyne", case.id) is not None:
            skipped += 1
            continue

        result = _verdict(case)
        if result is None:
            # "disagree" with no severity recorded — a human has to grade it,
            # guessing minor-vs-major here would put invented numbers in a
            # quality metric.
            ungraded += 1

        diagnosis = (
            db.query(GyneDiagnosis)
            .filter(GyneDiagnosis.case_id == case.id, GyneDiagnosis.is_current.is_(True))
            .first()
        )
        text = _gyne_text(diagnosis)

        row = CytoPathCorrelation(
            case_type="gyne",
            gyne_case_id=case.id,
            accession_no=case.accession_no,
            cytotechnologist_id=case.cytotechnologist_id,
            screening_flags={"screening_recovered": False},
            screened_at=case.screened_at,
            pathologist_id=case.reviewed_by_id or case.pathologist_id,
            final_diagnosis=text,
            final_summary=_strip_html(text),
            final_flags={
                "has_malignancy": case.has_malignancy,
                "is_satisfied_specimen": case.is_satisfied_specimen,
                "bethesda_category": case.bethesda_category,
                "specimen_type": case.specimen_type,
            },
            signed_out_at=case.report_at or case.reviewed_at,
            version_no=1,
            result=result,
            status="reviewed" if result else "pending_review",
            comment=case.review_note,
            reviewed_by_id=case.reviewed_by_id,
            reviewed_at=case.reviewed_at,
        )
        if not args.dry_run:
            db.add(row)
        created += 1

    if args.dry_run:
        db.rollback()
        print(f"[dry run] would create {created}, skip {skipped} already present.")
    else:
        db.commit()
        print(f"Created {created}, skipped {skipped} already present.")

    if ungraded:
        print(
            f"{ungraded} disagreement(s) had no minor/major level recorded — left as "
            f"'pending_review' for someone to grade in the QC worklist."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
