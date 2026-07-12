from app.his_export import HisExportAdapterBase, DeliveryResult


class CustomExportAdapter(HisExportAdapterBase):
    """Escape hatch for a hospital-specific export integration that doesn't
    fit `generic_webhook` (e.g. HL7v2/MLLP, SOAP, a vendor SDK).

    Edit send() below directly for a private/single-hospital deployment. If
    you're building something reusable that other hospitals could use,
    consider copying this file to a new named adapter (e.g. hl7v2_mllp.py)
    and registering it as its own HIS_EXPORT_TYPE branch in
    app/his_export/__init__.py instead — see README.md.
    """

    @property
    def adapter_name(self) -> str:
        return "Custom"

    async def send(self, payload: dict) -> DeliveryResult:
        # TODO: implement your hospital's export logic here.
        raise NotImplementedError(
            "HIS_EXPORT_TYPE=custom requires implementing "
            "CustomExportAdapter.send() in app/his_export/custom_adapter.py"
        )
