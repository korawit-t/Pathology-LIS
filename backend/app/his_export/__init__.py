"""
Outbound HIS Export — Pluggable Adapter Base Class and Factory
Mirrors app/his_adapters/'s ABC+factory shape, for the opposite direction:
pushing finalized reports out to an external HIS instead of pulling patient
data in. Kept as a sibling package (not nested under his_adapters/) since
inbound and outbound are independent concerns with their own env vars and
contracts.

See README.md in this directory for the full adapter contract and how to
add a new one (e.g. HL7v2/MLLP, FHIR — not implemented here, see README).
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import os

from dotenv import load_dotenv
load_dotenv()

HIS_EXPORT_TYPE = os.getenv("HIS_EXPORT_TYPE", "none").lower().strip()

# Worker-tuning knobs (read here, used by worker.py) — not adapter-specific,
# so they live at the package level rather than in any one adapter file.
HIS_EXPORT_INCLUDE_PDF = os.getenv("HIS_EXPORT_INCLUDE_PDF", "false").lower().strip() == "true"
HIS_EXPORT_POLL_INTERVAL_SECONDS = int(os.getenv("HIS_EXPORT_POLL_INTERVAL_SECONDS", "15"))
HIS_EXPORT_BATCH_SIZE = int(os.getenv("HIS_EXPORT_BATCH_SIZE", "10"))
HIS_EXPORT_MAX_ATTEMPTS = int(os.getenv("HIS_EXPORT_MAX_ATTEMPTS", "8"))
HIS_EXPORT_BACKOFF_BASE_SECONDS = int(os.getenv("HIS_EXPORT_BACKOFF_BASE_SECONDS", "60"))
HIS_EXPORT_BACKOFF_MAX_SECONDS = int(os.getenv("HIS_EXPORT_BACKOFF_MAX_SECONDS", "3600"))
HIS_EXPORT_STALE_PROCESSING_SECONDS = int(os.getenv("HIS_EXPORT_STALE_PROCESSING_SECONDS", "300"))


@dataclass
class DeliveryResult:
    success: bool
    reference_id: Optional[str] = None
    response_snapshot: Optional[dict] = None
    error_message: Optional[str] = None


class HisExportAdapterBase(ABC):
    """Abstract base class for all outbound HIS export adapters."""

    @property
    @abstractmethod
    def adapter_name(self) -> str:
        """Display name of this export adapter."""
        pass

    @abstractmethod
    async def send(self, payload: dict) -> DeliveryResult:
        """Deliver one report's export payload to the external HIS.

        payload: the report's structured export payload (see the
        build_*_export_payload() functions in app/crud/), optionally with a
        "pdf_base64" key if HIS_EXPORT_INCLUDE_PDF is enabled.
        """
        pass


def get_his_export_adapter() -> HisExportAdapterBase:
    """
    Factory function: returns the correct export adapter based on the
    HIS_EXPORT_TYPE env var. Defaults to "none" so the app works with zero
    config (mirrors HIS_DATABASE_URL being unset ⇒ inbound HIS disabled).
    """
    if HIS_EXPORT_TYPE == "none":
        from app.his_export.none_adapter import NoneExportAdapter
        return NoneExportAdapter()
    elif HIS_EXPORT_TYPE == "generic_webhook":
        from app.his_export.generic_webhook import GenericWebhookAdapter
        return GenericWebhookAdapter()
    elif HIS_EXPORT_TYPE == "custom":
        from app.his_export.custom_adapter import CustomExportAdapter
        return CustomExportAdapter()
    else:
        raise ValueError(
            f"Unknown HIS_EXPORT_TYPE: '{HIS_EXPORT_TYPE}'. "
            f"Supported types: none, generic_webhook, custom\n"
            f"HL7v2 (MLLP) and FHIR are documented extension points, not yet "
            f"implemented — see app/his_export/README.md to add one."
        )
