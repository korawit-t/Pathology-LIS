from sqlalchemy.orm import Session
from app.models.stain_panel import StainPanel, StainPanelItem
from app.schemas.stain_panel import StainPanelCreate, StainPanelUpdate


def get_stain_panel(db: Session, panel_id: int):
    return db.query(StainPanel).filter(StainPanel.id == panel_id).first()


def get_stain_panels(
    db: Session,
    skip: int = 0,
    limit: int = 200,
    category: str = None,
    is_active: bool = None,
):
    query = db.query(StainPanel)
    if category:
        query = query.filter(StainPanel.category == category)
    if is_active is not None:
        query = query.filter(StainPanel.is_active == is_active)
    return query.order_by(StainPanel.name).offset(skip).limit(limit).all()


def create_stain_panel(db: Session, panel: StainPanelCreate, user_id: int = None):
    test_ids = panel.test_ids
    data = panel.model_dump(exclude={"test_ids"})
    db_panel = StainPanel(**data, created_by_id=user_id)
    db.add(db_panel)
    db.flush()

    for order, test_id in enumerate(test_ids):
        db.add(StainPanelItem(stain_panel_id=db_panel.id, test_id=test_id, sort_order=order))

    db.commit()
    db.refresh(db_panel)
    return db_panel


def update_stain_panel(db: Session, panel_id: int, panel: StainPanelUpdate):
    db_panel = db.query(StainPanel).filter(StainPanel.id == panel_id).first()
    if not db_panel:
        return None

    update_data = panel.model_dump(exclude_unset=True)
    test_ids = update_data.pop("test_ids", None)

    for key, value in update_data.items():
        setattr(db_panel, key, value)

    if test_ids is not None:
        db.query(StainPanelItem).filter(StainPanelItem.stain_panel_id == panel_id).delete()
        for order, test_id in enumerate(test_ids):
            db.add(StainPanelItem(stain_panel_id=panel_id, test_id=test_id, sort_order=order))

    db.commit()
    db.refresh(db_panel)
    return db_panel


def delete_stain_panel(db: Session, panel_id: int):
    db_panel = db.query(StainPanel).filter(StainPanel.id == panel_id).first()
    if db_panel:
        db.delete(db_panel)
        db.commit()
    return db_panel
