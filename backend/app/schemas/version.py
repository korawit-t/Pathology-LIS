from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class UpdateStatus(BaseModel):
    """GET /version/update-status — this install against the latest release."""

    # False when UPDATE_CHECK_REPO is off; nothing below is then looked up.
    enabled: bool
    repo: Optional[str] = None
    current_version: str
    latest_version: Optional[str] = None
    update_available: bool = False
    # The newer release changes the MAJOR number: read its upgrade notes
    # before deploying (CHANGELOG.md).
    major_update: bool = False
    release_url: Optional[str] = None
    published_at: Optional[datetime] = None
    checked_at: Optional[datetime] = None
    error: Optional[Literal["unreachable", "no_release", "rate_limited", "bad_response"]] = None
