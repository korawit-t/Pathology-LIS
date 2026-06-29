from sqlalchemy.orm import Session, selectinload
from app.models.surgical_specimen_ap_test import SurgicalSpecimenAPTest
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.surgical_specimen_ap_test import SpecimenAPTestCreate

_TERMINAL_STATUSES = {"published", "cancelled", "completed"}


def create_specimen_test(db: Session, data: SpecimenAPTestCreate):
    new_item = SurgicalSpecimenAPTest(
        surgical_specimen_id=data.surgical_specimen_id,
        ap_test_id=data.ap_test_id
    )
    db.add(new_item)
    db.flush()

    # Auto-update case status based on AP test category
    ap_test = db.get(AnatomicalPathologyTest, data.ap_test_id)
    specimen = db.get(SurgicalSpecimen, data.surgical_specimen_id)
    if ap_test and specimen:
        case = db.get(SurgicalCase, specimen.case_id)
        if case and case.status not in _TERMINAL_STATUSES:
            if ap_test.category == "IHC":
                case.status = "pending immuno"
            elif ap_test.category == "Histochem":
                case.status = "pending special stains"

    db.commit()
    db.refresh(new_item)
    return new_item


def get_specimen_tests(db: Session, specimen_id: int):
    return (
        db.query(SurgicalSpecimenAPTest)
        .options(selectinload(SurgicalSpecimenAPTest.ap_test))   # ← โหลด AP Test
        .filter(SurgicalSpecimenAPTest.surgical_specimen_id == specimen_id)
        .all()
    )


def delete_specimen_test(db: Session, item_id: int):
    item = db.query(SurgicalSpecimenAPTest).filter(SurgicalSpecimenAPTest.id == item_id).first()
    if not item:
        return None

    specimen_id = item.surgical_specimen_id
    db.delete(item)
    db.flush()

    # Recalculate case status after removal
    specimen = db.get(SurgicalSpecimen, specimen_id)
    if specimen:
        case = db.get(SurgicalCase, specimen.case_id)
        if case and case.status not in _TERMINAL_STATUSES:
            # Re-check all remaining AP tests across all specimens in the case
            remaining = (
                db.query(AnatomicalPathologyTest.category)
                .join(SurgicalSpecimenAPTest, SurgicalSpecimenAPTest.ap_test_id == AnatomicalPathologyTest.id)
                .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalSpecimenAPTest.surgical_specimen_id)
                .filter(SurgicalSpecimen.case_id == case.id)
                .all()
            )
            categories = {r.category for r in remaining}
            if "IHC" in categories:
                case.status = "pending immuno"
            elif "Histochem" in categories:
                case.status = "pending special stains"
            else:
                case.status = "pending diagnosis"

    db.commit()
    return True
