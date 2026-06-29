from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.core.roles import CAN_MANAGE_SYSTEM_SETTINGS
from app.schemas.wsi_setting import (
    WsiScannerProfileCreate,
    WsiScannerProfileResponse,
    WsiScannerProfileUpdate,
    WsiSettingResponse,
    WsiSettingUpdate,
)
from app.crud import wsi_setting as crud

router = APIRouter(prefix="/wsi-settings", tags=["WSI Settings"])


@router.get("", response_model=WsiSettingResponse, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def get_settings(db: Session = Depends(get_db)):
    return crud.get_wsi_settings(db)


@router.patch("", response_model=WsiSettingResponse, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def update_settings(obj_in: WsiSettingUpdate, db: Session = Depends(get_db)):
    return crud.update_wsi_settings(db, obj_in)


@router.get("/profiles", response_model=List[WsiScannerProfileResponse], dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def list_profiles(db: Session = Depends(get_db)):
    return crud.get_all_profiles(db)


@router.post("/profiles", response_model=WsiScannerProfileResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def create_profile(data: WsiScannerProfileCreate, db: Session = Depends(get_db)):
    return crud.create_profile(db, data)


@router.put("/profiles/{profile_id}", response_model=WsiScannerProfileResponse, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def update_profile(profile_id: int, data: WsiScannerProfileUpdate, db: Session = Depends(get_db)):
    profile = crud.get_profile_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Scanner profile not found")
    return crud.update_profile(db, profile, data)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = crud.get_profile_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Scanner profile not found")
    crud.delete_profile(db, profile)
