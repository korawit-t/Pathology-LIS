"""Schema-level tests for the MFA factor table.

Nothing reads these tables yet — enrolment and verification come later. What is
worth locking down now is the shape, because the guarantees here are enforced
by database constraints that are easy to lose in a later migration: one primary
factor per user, credential IDs unique across the whole installation, and rows
that disappear with their user rather than dangling.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.user import User
from app.models.user_mfa import UserMfaMethod


def _totp(user_id, **overrides):
    row = {
        "user_id": user_id,
        "method_type": "totp",
        "label": "Authenticator",
        "secret_enc": "gAAAAA-not-a-real-fernet-token",
    }
    row.update(overrides)
    return UserMfaMethod(**row)


class TestUserMfaMethod:
    def test_a_totp_factor_round_trips(self, db, admin_user):
        user, _ = admin_user
        db.add(_totp(user.id))
        db.commit()

        stored = db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).one()
        assert stored.method_type == "totp"
        assert stored.secret_enc == "gAAAAA-not-a-real-fernet-token"
        assert stored.created_at is not None
        # Server-side defaults, not Python ones.
        assert stored.is_primary is False
        # Unconfirmed until a code from the new factor is entered; a row in this
        # state must never be accepted at login.
        assert stored.confirmed_at is None

    def test_a_user_may_hold_several_factors(self, db, admin_user):
        """The whole reason this is a table and not columns on `users`."""
        user, _ = admin_user
        db.add_all([
            _totp(user.id, label="phone"),
            UserMfaMethod(
                user_id=user.id,
                method_type="webauthn",
                label="laptop",
                credential_id=uuid.uuid4().bytes,
                public_key=b"\x04not-a-real-key",
                sign_count=0,
            ),
        ])
        db.commit()

        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count() == 2

    def test_only_one_factor_may_be_primary_per_user(self, db, admin_user):
        user, _ = admin_user
        db.add(_totp(user.id, is_primary=True))
        db.commit()

        db.add(_totp(user.id, label="second", is_primary=True))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_the_primary_index_does_not_restrict_the_others(self, db, admin_user):
        """It is partial — without that, a user could hold only one factor at
        all, which would defeat the point of the table."""
        user, _ = admin_user
        db.add_all([_totp(user.id, is_primary=True)] + [
            _totp(user.id, label=f"spare-{i}") for i in range(3)
        ])
        db.commit()

        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == user.id).count() == 4

    def test_credential_ids_are_unique_across_users(self, db, two_pathologists):
        one, two = two_pathologists
        shared = uuid.uuid4().bytes
        db.add(UserMfaMethod(user_id=one.id, method_type="webauthn", credential_id=shared))
        db.commit()

        db.add(UserMfaMethod(user_id=two.id, method_type="webauthn", credential_id=shared))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_totp_rows_do_not_collide_on_the_credential_id_index(self, db, two_pathologists):
        """Postgres does not treat NULLs as equal, so the unique index on
        credential_id leaves TOTP rows alone."""
        one, two = two_pathologists
        db.add_all([_totp(one.id), _totp(two.id)])
        db.commit()  # would raise if NULLs collided

        assert db.query(UserMfaMethod).filter(
            UserMfaMethod.user_id.in_([one.id, two.id])
        ).count() == 2

    def test_factors_are_deleted_with_their_user(self, db):
        doomed = User(
            username=f"mfa_cascade_{uuid.uuid4().hex[:12]}",
            hashed_password="x",
            roles=["register"],
        )
        db.add(doomed)
        db.commit()
        db.add(_totp(doomed.id))
        db.commit()

        db.delete(doomed)
        db.commit()

        assert db.query(UserMfaMethod).filter(UserMfaMethod.user_id == doomed.id).count() == 0
