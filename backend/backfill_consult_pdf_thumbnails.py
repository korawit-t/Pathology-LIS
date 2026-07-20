"""
One-off backfill: freeze consult_pdf_thumbnail_snapshot for surgical_reports
finalized before the consult-cover-sheet feature (migration 1638baeb40cc,
2026-07-20) added that column. Those rows have thumbnail_snapshot=NULL but
still reference the original uploaded consult PDF via consult_pdf_path_snapshot.

pdf_service.py already falls back to rasterizing consult_pdf_path_snapshot
on the fly when the snapshot is missing, so running this is not required for
correctness — it just freezes the snapshot (matching every other *_snapshot
column's intent) so old reports stop depending on the raw upload file and
stop re-rasterizing on every view.

Usage:
    python backfill_consult_pdf_thumbnails.py [--dry-run]
"""

import sys
import json

from app.db.database import SessionLocal
from app.models.surgical_report import SurgicalReport
from app.crud.surgical_report_builder import get_consult_pdf_thumbnails_base64


def main():
    dry_run = "--dry-run" in sys.argv

    db = SessionLocal()
    try:
        reports = (
            db.query(SurgicalReport)
            .filter(SurgicalReport.consult_pdf_path_snapshot.isnot(None))
            .filter(SurgicalReport.consult_pdf_thumbnail_snapshot.is_(None))
            .all()
        )
        print(f"Found {len(reports)} report(s) with a consult PDF but no thumbnail snapshot.")

        updated = 0
        missing_file = 0
        for report in reports:
            thumbnails = get_consult_pdf_thumbnails_base64(report.consult_pdf_path_snapshot)
            if not thumbnails:
                missing_file += 1
                print(f"  [SKIP] report {report.id} - file not found/unreadable: {report.consult_pdf_path_snapshot}")
                continue

            print(f"  [OK] report {report.id} - {len(thumbnails)} page(s) rasterized")
            if not dry_run:
                report.consult_pdf_thumbnail_snapshot = json.dumps(thumbnails)
            updated += 1

        if dry_run:
            print(f"\nDry run - would update {updated} report(s), {missing_file} skipped (source file missing).")
        else:
            db.commit()
            print(f"\nUpdated {updated} report(s). {missing_file} skipped (source file missing).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
