#!/usr/bin/env python
"""Report uploaded files the database refers to but the upload root lacks.

Read-only: it reads every column that holds a stored file key or path and
checks for the file under the upload root (UPLOAD_ROOT, default
backend/uploads). Nothing in the database or on disk is changed.

Run it after moving the uploads, before switching UPLOAD_ROOT to the new place
(--root) and again after the restart:

    python scripts/check_upload_paths.py                         # the configured root
    python scripts/check_upload_paths.py --root \\\\fileserver\\lis-uploads
    python scripts/check_upload_paths.py --show 50              # list up to 50 missing per column

Prints a count per table and column and exits 1 when anything is missing, so
it can gate a migration script. Run it from the backend directory with the
virtualenv active, so DATABASE_URL and UPLOAD_ROOT are read the same way the
application reads them.
"""

import argparse
import logging
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Make `python scripts/check_upload_paths.py` work from the backend directory
# without needing the package installed.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import app.models  # noqa: E402,F401  (registers every table on Base.metadata)
from app.core.config import settings  # noqa: E402
from app.db.database import Base, SessionLocal  # noqa: E402
from app.utils import storage_paths  # noqa: E402

# Columns holding a key relative to the upload root (storage_paths.resolve).
KEY_COLUMNS = [
    ("gross_images", "image_url"),
    ("microscopic_images", "image_url"),
    ("surgical_report_images", "image_url"),
    ("gyne_case_images", "image_url"),
    ("nongyne_case_images", "image_url"),
    ("system_settings", "report_logo_url"),
    ("system_settings", "login_logo_url"),
    ("hospitals", "logo_path"),
]

# Columns holding an absolute path (storage_paths.resolve_stored_file), found
# again under the current root when written under an earlier one.
ABSOLUTE_PATH_COLUMNS = [
    ("surgical_request_files", "file_path"),
    ("gyne_cyto_request_files", "file_path"),
    ("nongyne_request_files", "file_path"),
    ("surgical_cases", "consult_pdf_path"),
    ("gyne_cytology_cases", "consult_pdf_path"),
    ("gyne_cytology_cases", "out_lab_result_pdf_path"),
    ("nongyne_cytology_cases", "consult_pdf_path"),
    ("nongyne_cytology_cases", "out_lab_result_pdf_path"),
    ("molecular_cases", "outlab_pdf_path"),
]


@dataclass
class ColumnResult:
    table: str
    column: str
    total: int = 0
    missing: list[tuple[int, str]] = field(default_factory=list)


def _check_column(db: Session, table_name: str, column_name: str, found) -> ColumnResult:
    table = Base.metadata.tables[table_name]
    column = table.c[column_name]
    result = ColumnResult(table_name, column_name)
    rows = db.execute(
        select(table.c.id, column).where(column.isnot(None), column != "").order_by(table.c.id)
    )
    for row_id, value in rows:
        result.total += 1
        if not found(value):
            result.missing.append((row_id, value))
    return result


def check(db: Session) -> list[ColumnResult]:
    """Every listed column, checked against the current upload root."""
    results = [_check_column(db, t, c, storage_paths.exists) for t, c in KEY_COLUMNS]
    results += [
        _check_column(db, t, c, lambda v: storage_paths.resolve_stored_file(v) is not None)
        for t, c in ABSOLUTE_PATH_COLUMNS
    ]
    return results


def _print_report(results: list[ColumnResult], show: int) -> None:
    width = max(len(f"{r.table}.{r.column}") for r in results)
    print(f"{'table.column':{width}}  {'files':>7}  {'missing':>7}")
    print("-" * (width + 18))
    for r in results:
        print(f"{r.table + '.' + r.column:{width}}  {r.total:>7}  {len(r.missing):>7}")
    for r in results:
        if not r.missing or show <= 0:
            continue
        print(f"\nMissing in {r.table}.{r.column}:")
        for row_id, value in r.missing[:show]:
            print(f"  id={row_id}  {value}")
        if len(r.missing) > show:
            print(f"  ... and {len(r.missing) - show} more (--show to list more)")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--root",
        help="check this folder instead of the configured UPLOAD_ROOT "
        "(e.g. the new location, before switching to it)",
    )
    parser.add_argument(
        "--show", type=int, default=20,
        help="missing entries to list per column (default 20, 0 for counts only)",
    )
    args = parser.parse_args(argv)

    if args.root:
        settings.UPLOAD_ROOT = Path(args.root)
    root = Path(settings.UPLOAD_ROOT)
    if not root.is_dir():
        print(f"Upload root {root} does not exist or is not reachable.", file=sys.stderr)
        return 2

    # Each missing file is already counted and listed below; the per-file
    # warnings resolve_stored_file logs for the running app would only repeat it.
    logging.getLogger(storage_paths.__name__).setLevel(logging.ERROR)

    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        print(f"Checking uploads under {root.resolve()}\n")
        results = check(db)
    finally:
        db.rollback()
        db.close()

    _print_report(results, args.show)
    missing = sum(len(r.missing) for r in results)
    total = sum(r.total for r in results)
    print(f"\n{total} file references checked, {missing} missing.")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
