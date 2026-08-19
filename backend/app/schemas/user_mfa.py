from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class MfaPasswordConfirm(BaseModel):
    """Re-authentication for the actions that change a user's second factor.

    Starting, removing or re-issuing a factor all require the current password
    even though the caller already holds a session. A stolen session is exactly
    the situation MFA is meant to survive: without this, whoever took it could
    enrol their own authenticator and lock the real owner out of their account.
    """

    password: str = Field(min_length=1)


class MfaSetupResponse(BaseModel):
    """Returned once, when enrolment starts. Nothing is enabled yet."""

    # otpauth:// URI for the QR code. Carries the secret — the frontend renders
    # it and must not log it or send it anywhere else.
    provisioning_uri: str
    # The same secret in base32, for typing in by hand when a camera is not
    # available or the workstation has no webcam.
    secret: str
    issuer: str
    account_name: str


class MfaConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class MfaConfirmResponse(BaseModel):
    enabled: bool


class MfaMethodRead(BaseModel):
    id: int
    method_type: str
    label: Optional[str] = None
    is_primary: bool
    confirmed_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MfaStatusResponse(BaseModel):
    """What the profile screen needs, and nothing that would help an attacker."""

    enabled: bool
    # A started-but-unconfirmed enrolment, so the UI can offer to resume it.
    pending_setup: bool
    methods: List[MfaMethodRead]
    # Whether this user's roles put them in mfa_required_roles: drives whether
    # the UI offers a "turn off" button at all.
    required_for_this_user: bool
    # Whether the installation has MFA switched on at all.
    system_enabled: bool


class MfaLoginRequest(BaseModel):
    """Second step of a two-step login.

    The code comes from the authenticator app. There is no self-service
    recovery code: the lab chose administrator-verified reset instead, on the
    grounds that printed codes end up somewhere unsafe.
    """

    mfa_token: str = Field(min_length=1)
    code: str = Field(min_length=6, max_length=10)
    # Opt-in, and only ever offered on the second step: trusting a browser is
    # a choice the user makes after proving they hold the factor, not a default
    # applied on their behalf.
    remember_device: bool = False


class TrustedDeviceRead(BaseModel):
    id: int
    label: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MfaStepUpRequest(BaseModel):
    """One field, two acceptable answers: a TOTP code or the account password.

    Making the client decide which it is only moves the guesswork somewhere it
    has less information.
    """

    code: str = Field(min_length=1, max_length=200)
