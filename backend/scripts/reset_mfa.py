#!/usr/bin/env python
"""Clear a user's second factor from the server console. Break-glass only.

The admin API can do this too, and should be the normal route. This exists for
the case the API cannot cover: the last remaining administrator loses their
phone. Without it that account is unreachable permanently, because turning MFA
off requires signing in and signing in requires the factor.

Authorisation here is shell access to the server and credentials for the
database. That is the point — it has to work when nobody can log in — and it is
why it writes an audit row rather than doing its work silently.

    python scripts/reset_mfa.py --list
    python scripts/reset_mfa.py alice
    python scripts/reset_mfa.py alice --yes     # skip the confirmation

Run it from the backend directory with the virtualenv active, so DATABASE_URL
is read the same way the application reads it.
"""

import argparse
import os
import sys
from datetime import datetime, timezone

# Make `python scripts/reset_mfa.py` work from the backend directory without
# needing the package installed.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.models.audit_log import AuditLog  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_mfa import UserMfaMethod  # noqa: E402
from app.models.user_trusted_device import UserTrustedDevice  # noqa: E402


def _session():
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set. Run this from the backend directory, with the .env in place.")
    return sessionmaker(bind=create_engine(url))()


def _list_enrolled(db) -> int:
    rows = db.query(User).filter(User.mfa_enabled.is_(True)).order_by(User.username).all()
    if not rows:
        print("No accounts currently have a second factor enrolled.")
        return 0

    print(f"{'username':24} {'roles':34} factors  devices")
    print("-" * 74)
    for user in rows:
        factors = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count()
        devices = (
            db.query(UserTrustedDevice)
            .filter(
                UserTrustedDevice.user_id == user.id,
                UserTrustedDevice.revoked_at.is_(None),
            )
            .count()
        )
        roles = ",".join(user.roles or [])[:32]
        print(f"{user.username:24} {roles:34} {factors:^7}  {devices:^7}")
    return len(rows)


def reset(db, username: str, assume_yes: bool) -> int:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        print(f"No such user: {username}", file=sys.stderr)
        return 1

    factors = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count()
    devices = (
        db.query(UserTrustedDevice)
        .filter(
            UserTrustedDevice.user_id == user.id,
            UserTrustedDevice.revoked_at.is_(None),
        )
        .count()
    )

    if not (user.mfa_enabled or factors or devices):
        print(f"{username} has no second factor enrolled — nothing to do.")
        return 0

    print(f"About to reset multi-factor authentication for: {username}")
    print(f"  roles                  : {','.join(user.roles or []) or '(none)'}")
    print(f"  authenticator factors  : {factors}")
    print(f"  trusted devices        : {devices}")
    print()
    print("After this the account signs in with its password alone until the user")
    print("enrols again. Make sure you have verified who asked for it.")

    if not assume_yes:
        if input(f"\nType the username to confirm ({username}): ").strip() != username:
            print("Aborted.")
            return 1

    db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(UserTrustedDevice).filter(
        UserTrustedDevice.user_id == user.id,
        UserTrustedDevice.revoked_at.is_(None),
    ).update({UserTrustedDevice.revoked_at: datetime.now(timezone.utc)}, synchronize_session=False)
    user.mfa_enabled = False
    db.add(user)

    # Recorded against the target, with no actor: nobody authenticated to do
    # this. An entry with user_id NULL and this action is the signal that
    # someone went in through the console, which is exactly what an audit
    # reviewer should be able to notice.
    db.add(
        AuditLog(
            user_id=None,
            action="MFA_RESET_VIA_CONSOLE",
            resource_type="User",
            resource_id=user.id,
            new_values={
                "target_username": user.username,
                "factors_removed": factors,
                "trusted_devices_revoked": devices,
                "run_by_os_user": os.getenv("USER") or os.getenv("USERNAME"),
            },
        )
    )
    db.commit()

    print(f"\nDone. {username} can now sign in with a password alone.")
    print("Ask them to enrol a new authenticator immediately.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Break-glass reset of a user's MFA. Prefer the admin UI where possible.",
    )
    parser.add_argument("username", nargs="?", help="account to reset")
    parser.add_argument("--list", action="store_true", help="show accounts with a factor enrolled")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()

    if not args.list and not args.username:
        parser.print_help()
        return 2

    db = _session()
    try:
        if args.list:
            _list_enrolled(db)
            return 0
        return reset(db, args.username, args.yes)
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
