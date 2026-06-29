"""
HIS Adapter Base Class and Factory
Pluggable adapter pattern for different Hospital Information Systems.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from sqlalchemy.orm import Session
from app.schemas.his import HisPatientResult
import os

from dotenv import load_dotenv
load_dotenv()

HIS_TYPE = os.getenv("HIS_TYPE", "hosxp").lower().strip()


class HisAdapterBase(ABC):
    """Abstract base class for all HIS adapters."""

    @property
    @abstractmethod
    def his_name(self) -> str:
        """Display name of this HIS system."""
        pass

    @abstractmethod
    def search_patients(
        self,
        db: Session,
        hn: Optional[str],
        date_start: str,
        date_end: str,
        case_type: str = "surgical",
    ) -> List[HisPatientResult]:
        """
        Search patients from the HIS database.
        Must return a list of HisPatientResult regardless of HIS schema.
        
        case_type: 'surgical', 'gyne', or 'nongyne'
        """
        pass


def get_his_adapter() -> HisAdapterBase:
    """
    Factory function: returns the correct HIS adapter based on HIS_TYPE env var.
    """
    if HIS_TYPE == "hosxp":
        from app.his_adapters.hosxp import HOSxPAdapter
        return HOSxPAdapter()
    elif HIS_TYPE == "custom":
        from app.his_adapters.custom import CustomSQLAdapter
        return CustomSQLAdapter()
    elif HIS_TYPE == "ssb":
        # SSB is no longer maintained as a tracked Python template.
        # Use HIS_TYPE=custom with data/his_surgical.sql instead.
        from app.his_adapters.ssb import SSBAdapter
        return SSBAdapter()
    else:
        raise ValueError(
            f"Unknown HIS_TYPE: '{HIS_TYPE}'. "
            f"Supported types: hosxp, custom\n"
            f"For other HIS systems (SSB etc.) use HIS_TYPE=custom "
            f"with hospital-specific SQL files in backend/data/"
        )
