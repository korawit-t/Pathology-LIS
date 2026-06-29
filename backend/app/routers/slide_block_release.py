from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.schemas.slide_block_release import (
    CaseVerifyResponse,
    SlideBlockReleaseCreate,
    SlideBlockReleaseResponse,
    SlideBlockReleasePagination,
)
from app.crud import slide_block_release as crud
from app.models.user import User
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/slide-block-releases", tags=["Slide Block Release"])


@router.get("/verify/{accession_no}", response_model=CaseVerifyResponse)
async def verify_accession(
    accession_no: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.verify_accession_for_release(db, accession_no=accession_no)


@router.post("", response_model=SlideBlockReleaseResponse, status_code=status.HTTP_201_CREATED)
async def create_release(
    obj_in: SlideBlockReleaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.create_release(db, obj_in=obj_in, released_by_id=current_user.id)


@router.get("", response_model=SlideBlockReleasePagination)
async def list_releases(
    skip: int = 0,
    limit: int = 15,
    case_type: Optional[str] = None,
    release_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.get_releases(db, skip=skip, limit=limit, case_type=case_type, release_type=release_type)


@router.delete("/{release_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_release(
    release_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    success = crud.delete_release(db, release_id)
    if not success:
        raise HTTPException(status_code=404, detail="Release record not found")
    return None


@router.get("/{release_id}/form-pdf")
async def download_release_form(
    release_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.pdf_service import generate_pdf_blob

    data = crud.build_release_form_data(db, release_id)
    pdf_bytes = generate_pdf_blob(data, template_name="reports/slide_block_release_form.html")
    filename = f"release_form_{data['release_no']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
