from app.his_export import HisExportAdapterBase, DeliveryResult


class NoneExportAdapter(HisExportAdapterBase):
    """No-op adapter — the safe default when HIS export isn't configured.

    In practice this never runs delivery: enqueue() (app/crud/his_export_log.py)
    short-circuits and inserts no row at all when HIS_EXPORT_TYPE=none, so
    there is nothing for the worker to ever claim. Implemented anyway for
    interface completeness and so explicitly setting HIS_EXPORT_TYPE=none
    behaves identically to leaving it unset.
    """

    @property
    def adapter_name(self) -> str:
        return "None"

    async def send(self, payload: dict) -> DeliveryResult:
        return DeliveryResult(success=True, response_snapshot=None)
