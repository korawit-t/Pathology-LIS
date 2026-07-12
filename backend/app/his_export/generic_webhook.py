import os
import httpx

from app.his_export import HisExportAdapterBase, DeliveryResult

HIS_EXPORT_WEBHOOK_URL = os.getenv("HIS_EXPORT_WEBHOOK_URL", "").strip()
HIS_EXPORT_WEBHOOK_AUTH_HEADER = os.getenv("HIS_EXPORT_WEBHOOK_AUTH_HEADER", "Authorization").strip()
HIS_EXPORT_WEBHOOK_AUTH_TOKEN = os.getenv("HIS_EXPORT_WEBHOOK_AUTH_TOKEN", "").strip()
HIS_EXPORT_WEBHOOK_TIMEOUT_SECONDS = float(os.getenv("HIS_EXPORT_WEBHOOK_TIMEOUT_SECONDS", "15"))

_RESPONSE_BODY_SNAPSHOT_LIMIT = 2000


class GenericWebhookAdapter(HisExportAdapterBase):
    """POSTs the export payload as JSON to a single configured URL.

    This is the simplest, most universally-compatible adapter: nearly every
    interface engine (Mirth, Rhapsody, or a hospital's own script) can accept
    a plain HTTP POST, so this requires no HL7/FHIR knowledge on either side.
    """

    @property
    def adapter_name(self) -> str:
        return "Generic Webhook"

    async def send(self, payload: dict) -> DeliveryResult:
        # No SSRF/public-IP guard here (deliberately, unlike the Slack/LINE
        # webhook path in notification_service.py): HIS_EXPORT_WEBHOOK_URL is
        # an env-var set by whoever deploys the server — the same trust tier
        # as HIS_DATABASE_URL — not a value any authenticated application
        # user can influence via an API. The expected target for this
        # LAN-only project is usually an on-LAN interface engine (Mirth,
        # Rhapsody, ...), which a public-IP-only check would wrongly block.
        if not HIS_EXPORT_WEBHOOK_URL:
            return DeliveryResult(
                success=False,
                error_message="HIS_EXPORT_WEBHOOK_URL is not configured",
            )

        headers = {}
        if HIS_EXPORT_WEBHOOK_AUTH_TOKEN:
            headers[HIS_EXPORT_WEBHOOK_AUTH_HEADER] = HIS_EXPORT_WEBHOOK_AUTH_TOKEN

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    HIS_EXPORT_WEBHOOK_URL,
                    json=payload,
                    headers=headers,
                    timeout=HIS_EXPORT_WEBHOOK_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as e:
            return DeliveryResult(success=False, error_message=f"Request failed: {e}")

        response_snapshot = {
            "status_code": resp.status_code,
            "body": resp.text[:_RESPONSE_BODY_SNAPSHOT_LIMIT],
        }
        if resp.status_code // 100 != 2:
            return DeliveryResult(
                success=False,
                response_snapshot=response_snapshot,
                error_message=f"Webhook returned HTTP {resp.status_code}",
            )

        return DeliveryResult(
            success=True,
            reference_id=resp.headers.get("X-Reference-Id"),
            response_snapshot=response_snapshot,
        )
