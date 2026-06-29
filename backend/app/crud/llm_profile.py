from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.llm_profile import LlmProfile
from app.schemas.llm_profile import LlmProfileCreate, LlmProfileUpdate


def get_all(db: Session) -> List[LlmProfile]:
    return db.query(LlmProfile).order_by(LlmProfile.id).all()


def get_by_id(db: Session, profile_id: int) -> Optional[LlmProfile]:
    return db.query(LlmProfile).filter(LlmProfile.id == profile_id).first()


def create(db: Session, data: LlmProfileCreate) -> LlmProfile:
    profile = LlmProfile(**data.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update(db: Session, profile: LlmProfile, data: LlmProfileUpdate) -> LlmProfile:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


def delete(db: Session, profile: LlmProfile) -> None:
    db.delete(profile)
    db.commit()
