from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.core.roles import CAN_MANAGE_SYSTEM_SETTINGS
from app.crud import llm_profile as crud
from app.schemas.llm_profile import LlmProfileCreate, LlmProfileUpdate, LlmProfileResponse

router = APIRouter(prefix="/llm-profiles", tags=["LLM Profiles"])


@router.get("", response_model=List[LlmProfileResponse], dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def list_profiles(db: Session = Depends(get_db)):
    return crud.get_all(db)


@router.post("", response_model=LlmProfileResponse, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def create_profile(data: LlmProfileCreate, db: Session = Depends(get_db)):
    return crud.create(db, data)


@router.put("/{profile_id}", response_model=LlmProfileResponse, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def update_profile(profile_id: int, data: LlmProfileUpdate, db: Session = Depends(get_db)):
    profile = crud.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return crud.update(db, profile, data)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = crud.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    crud.delete(db, profile)
