from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.wsi_slide_link import WsiSlideLink
from app.schemas.wsi_slide_link import WsiSlideLinkCreate, WsiSlideLinkUpdate


def get_links(
    db: Session,
    status: Optional[str] = None,
    wsi_file_id: Optional[int] = None,
    surgical_block_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[WsiSlideLink]:
    q = db.query(WsiSlideLink).options(joinedload(WsiSlideLink.wsi_file))
    if status:
        q = q.filter(WsiSlideLink.status == status)
    if wsi_file_id:
        q = q.filter(WsiSlideLink.wsi_file_id == wsi_file_id)
    if surgical_block_id:
        q = q.filter(WsiSlideLink.surgical_block_id == surgical_block_id)
    return q.order_by(WsiSlideLink.linked_at.desc()).offset(skip).limit(limit).all()


def get_link_by_id(db: Session, link_id: int) -> Optional[WsiSlideLink]:
    return db.query(WsiSlideLink).filter(WsiSlideLink.id == link_id).first()


def create_link(
    db: Session,
    data: WsiSlideLinkCreate,
    linked_by_id: Optional[int] = None,
    method: str = "manual",
) -> WsiSlideLink:
    link = WsiSlideLink(
        **data.model_dump(),
        link_method=method,
        link_confidence=1.0,
        linked_by_id=linked_by_id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def update_link(
    db: Session,
    link: WsiSlideLink,
    data: WsiSlideLinkUpdate,
    confirmed_by_id: Optional[int] = None,
) -> WsiSlideLink:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(link, field, value)

    if data.status == "confirmed":
        link.confirmed_by_id = confirmed_by_id
        link.confirmed_at = datetime.utcnow()

    db.commit()
    db.refresh(link)
    return link


def delete_link(db: Session, link: WsiSlideLink) -> None:
    db.delete(link)
    db.commit()
