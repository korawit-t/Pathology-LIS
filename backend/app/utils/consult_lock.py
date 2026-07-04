from fastapi import HTTPException


def assert_consult_not_locked(case) -> None:
    """Raise 423 if `case` was dispatched for out-lab consult and the result
    hasn't come back yet. Shared by Surgical/NonGyne draft-save paths."""
    if case and case.is_out_lab_consult and case.consult_status == "processing" and not case.consult_pdf_path:
        raise HTTPException(
            status_code=423,
            detail="Case is locked: slides have been dispatched for external consultation. "
                   "Upload the consult PDF to unlock.",
        )
