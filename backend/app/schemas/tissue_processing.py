from pydantic import BaseModel, ConfigDict, Field
from app.schemas.surgical_block import SurgicalBlockResponse
# มั่นใจว่ามี UserResponse ใน schemas/user.py
from app.schemas.user import UserResponse 
from datetime import datetime
from typing import List, Optional

class ProcessorMachineBase(BaseModel):
    name: str
    is_active: bool = True

class ProcessorMachineCreate(ProcessorMachineBase):
    pass

class ProcessorMachineUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class ProcessorMachineResponse(ProcessorMachineBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class ProcessingProgramBase(BaseModel):
    name: str
    duration_hours: Optional[int] = None
    is_active: bool = True

class ProcessingProgramCreate(ProcessingProgramBase):
    pass

class ProcessingProgramUpdate(BaseModel):
    name: Optional[str] = None
    duration_hours: Optional[int] = None
    is_active: Optional[bool] = None

class ProcessingProgramResponse(ProcessingProgramBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

# --- Item Schemas ---
class TissueProcessingItemBase(BaseModel):
    block_id: int
    status: Optional[str] = "in_machine"

class TissueProcessingItemCreate(TissueProcessingItemBase):
    pass

class TissueProcessingItem(TissueProcessingItemBase):
    id: int
    run_id: int
    block: Optional[SurgicalBlockResponse] = None
    # --- เพิ่มฟิลด์สำหรับ Process Out ---
    processed_out_at: Optional[datetime] = None  # เวลาที่สแกนออกจริงรายชิ้น
    out_remark: Optional[str] = None             # หมายเหตุหากตลับมีปัญหาตอนออก
    # ----------------------------------
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Run Schemas ---
class TissueProcessingRunBase(BaseModel):
    run_number: Optional[str] = None 
    processor_name: str
    program_name: str
    start_at: datetime
    remark: Optional[str] = None
    status: Optional[str] = "processing"

class TissueProcessingRunCreate(TissueProcessingRunBase):
    block_ids: List[int] = Field(..., min_length=1, description="ต้องมีอย่างน้อย 1 ตลับเนื้อ")
    created_by_id: int

class TissueProcessingRunEdit(BaseModel):
    processor_name: Optional[str] = None
    program_name: Optional[str] = None
    start_at: Optional[datetime] = None
    remark: Optional[str] = None
    block_ids: Optional[List[int]] = None

class TissueProcessingRunUpdate(BaseModel):
    status: Optional[str] = None
    remark: Optional[str] = None
    block_out_total: Optional[int] = None 
    completed_by_id: Optional[int] = None
    
    # ✅ เพิ่มฟิลด์นี้เพื่อให้รองรับ "บันทึกละเอียด"
    # รับรายการ ID ของ Block ที่เจ้าหน้าที่สแกนออกจริง (เพื่อเช็ค Missing)
    confirmed_block_ids: Optional[List[int]] = None

class TissueProcessingRun(TissueProcessingRunBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    # ข้อมูลการนำเข้า (In)
    created_by_id: int
    block_in_total: int = 0
    creator: Optional[UserResponse] = None # ข้อมูล User ผู้นำเข้า
    
    # ข้อมูลการนำออก (Out)
    completed_at: Optional[datetime] = None
    completed_by_id: Optional[int] = None
    block_out_total: Optional[int] = 0
    completer: Optional[UserResponse] = None # ข้อมูล User ผู้นำออก
    
    run_number: str 
    items: List[TissueProcessingItem] = []
    
    model_config = ConfigDict(from_attributes=True)