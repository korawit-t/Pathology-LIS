"""Images that went out with each report version.

A published report is a legal document: reprinting version N has to show the
images version N was signed out with. Each report row therefore records the
image paths it was built from (``images_snapshot``), and its PDF is drawn from
that list instead of the case's current images, which an addendum or a
revision can still add to, re-crop or delete.

Only paths and captions are kept, not image bytes, so the files themselves
have to outlive later edits to the case. The ``*_still_in_report`` checks let
the image routers skip deleting a file that a report still points at.
"""

from sqlalchemy.orm import Session

from app.models.gyne_cyto_report import GyneCytoReport
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.models.surgical_report import ReportStatus, SurgicalReport, SurgicalReportImage


def surgical_images_snapshot(gross_images: list, micro_images: list) -> dict:
    """Reduce the gross_images / micro_images payloads prepare_report_data()
    builds to what a reprint needs to rebuild them (no base64)."""
    return {
        "gross": [
            {"image_url": g["image_url"], "label": g.get("label")}
            for g in gross_images
        ],
        "micro": [
            {
                "image_url": m["image_url"],
                "label": m.get("label"),
                "desc": m.get("desc"),
                "mag": m.get("mag"),
                "stain": m.get("stain"),
            }
            for m in micro_images
        ],
    }


def case_images_snapshot(images) -> list:
    """Gyne/non-gyne: the case's show_in_report images, in report order."""
    return [
        {"image_url": img.image_url, "description": img.description or ""}
        for img in images
    ]


def surgical_image_still_in_report(db: Session, image_url: str) -> bool:
    """True if a non-draft surgical report was built with this gross or
    microscopic image. A draft is skipped: it is rebuilt from the case on
    every finalize, so nothing reprints it from its old image list.

    surgical_report_images is written next to images_snapshot by
    create_final_report_snapshot() and also exists for reports made before
    images_snapshot did, so one lookup covers both."""
    return (
        db.query(SurgicalReportImage.id)
        .join(SurgicalReport, SurgicalReportImage.report_id == SurgicalReport.id)
        .filter(
            SurgicalReportImage.image_url == image_url,
            SurgicalReport.status != ReportStatus.DRAFT.value,
        )
        .first()
        is not None
    )


def _in_snapshots(rows, image_url: str) -> bool:
    return any(
        entry.get("image_url") == image_url
        for (snapshot,) in rows
        for entry in (snapshot or [])
    )


def gyne_image_still_in_report(db: Session, case_id: int, image_url: str) -> bool:
    """True if any report of the case was published with this image. Every
    gyne publish inserts a new report row and never rewrites an older one's
    images, so unlike surgical no status is excluded."""
    rows = db.query(GyneCytoReport.images_snapshot).filter(GyneCytoReport.case_id == case_id).all()
    return _in_snapshots(rows, image_url)


def nongyne_image_still_in_report(db: Session, case_id: int, image_url: str) -> bool:
    """Non-gyne counterpart of gyne_image_still_in_report()."""
    rows = db.query(NongyneCytoReport.images_snapshot).filter(NongyneCytoReport.case_id == case_id).all()
    return _in_snapshots(rows, image_url)
