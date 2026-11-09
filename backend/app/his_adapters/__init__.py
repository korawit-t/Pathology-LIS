"""
HIS Adapter Base Class and Factory
Pluggable adapter pattern for different Hospital Information Systems.

Every adapter can search patients. Everything else a HIS might offer
(appointments, who visited today, current admission) is an optional feature:
an adapter lists what it implements in `supported_features`, and callers ask
`adapter.supports(...)` before using it. That keeps HOSxP-only queries from
being run against another vendor's database, where they could only fail.
"""
from abc import ABC, abstractmethod
from typing import Dict, FrozenSet, List, Optional
from sqlalchemy.orm import Session
from app.schemas.his import HisPatientResult
import os

from dotenv import load_dotenv
load_dotenv()

HIS_TYPE = os.getenv("HIS_TYPE", "hosxp").lower().strip()

# What staff see on the "pull from HIS" button and in messages — the name of
# the program they actually use (e.g. "SSB", "Hospital OS"). Optional: when
# unset, the adapter's own default name is used.
HIS_DISPLAY_NAME = os.getenv("HIS_DISPLAY_NAME", "").strip()


class HisFeature:
    """Feature keys an adapter may support. Also the keys of
    `features` in GET /his/info, so the frontend can hide what won't work."""

    PATIENT_SEARCH = "patient_search"  # search_patients — the HIS button on case registration
    APPOINTMENTS = "appointments"      # get_appointments / get_future_appointments
    VISITS_TODAY = "visits_today"      # get_hns_with_visit_today
    ADMISSION = "admission"            # get_active_admission


ALL_HIS_FEATURES = (
    HisFeature.PATIENT_SEARCH,
    HisFeature.APPOINTMENTS,
    HisFeature.VISITS_TODAY,
    HisFeature.ADMISSION,
)


class HisFeatureNotSupported(Exception):
    """Raised when a caller uses a feature the configured HIS doesn't have."""


class HisAdapterBase(ABC):
    """Abstract base class for all HIS adapters."""

    @property
    @abstractmethod
    def his_name(self) -> str:
        """Default display name of this HIS system."""
        pass

    @property
    def display_name(self) -> str:
        """Name shown to users: HIS_DISPLAY_NAME if set, else his_name."""
        return HIS_DISPLAY_NAME or self.his_name

    @property
    def supported_features(self) -> FrozenSet[str]:
        """Features this adapter implements. Override to add optional ones."""
        return frozenset({HisFeature.PATIENT_SEARCH})

    def supports(self, feature: str) -> bool:
        return feature in self.supported_features

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

    # ── Optional features ────────────────────────────────────────────────
    # Adapters that implement one of these must also list it in
    # supported_features.

    def get_appointments(self, db: Session, hn: str) -> List[Dict]:
        """A patient's most recent appointments (any date)."""
        raise HisFeatureNotSupported(HisFeature.APPOINTMENTS)

    def get_future_appointments(self, db: Session, hn: str, limit: int = 10) -> List[Dict]:
        """Appointments still to come, soonest first."""
        raise HisFeatureNotSupported(HisFeature.APPOINTMENTS)

    def get_hns_with_visit_today(self, db: Session, hns: Optional[List[str]] = None) -> List[str]:
        """HNs with a visit actually recorded today."""
        raise HisFeatureNotSupported(HisFeature.VISITS_TODAY)

    def get_active_admission(self, db: Session, hn: str) -> Optional[Dict]:
        """The patient's current admission, or None when not an inpatient."""
        raise HisFeatureNotSupported(HisFeature.ADMISSION)


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


def get_his_adapter_or_none() -> Optional[HisAdapterBase]:
    """The configured adapter, or None when HIS_TYPE names no working one
    (an unknown value, or the retired `ssb`, whose constructor raises).

    For best-effort callers — /his/info, background workers, notification
    enrichment — that should degrade to "no HIS" rather than error."""
    try:
        return get_his_adapter()
    except (ValueError, NotImplementedError):
        return None
