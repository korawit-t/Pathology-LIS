"""
Regression coverage for seed_data.py's admin-user seeding.

Guards against reintroducing the bug where seed_admin() passed a
`hospital_id` kwarg to User() after the user_hosp001 migration replaced
that column with the `hospitals` many-to-many relationship — which raised
"'hospital_id' is an invalid keyword argument for User" on a fresh DB.
"""
import uuid

from app.models.organization import Hospital
from app.models.user import User
from seed_data import seed_admin


def _delete_seeded_admin(db):
    db.query(User).filter(User.username == "admin").delete()
    db.commit()


class TestSeedAdmin:
    def test_creates_admin_when_no_hospital_exists(self, db):
        try:
            seed_admin(db)
            user = db.query(User).filter(User.username == "admin").first()
            assert user is not None
            assert user.hospitals == []
        finally:
            _delete_seeded_admin(db)

    def test_links_admin_to_first_hospital(self, db):
        hospital = Hospital(name=f"Test Hospital {uuid.uuid4().hex[:6]}")
        db.add(hospital)
        db.commit()
        try:
            seed_admin(db)
            user = db.query(User).filter(User.username == "admin").first()
            assert user is not None
            assert hospital in user.hospitals
        finally:
            _delete_seeded_admin(db)

    def test_is_idempotent_when_admin_already_exists(self, db):
        seed_admin(db)
        try:
            seed_admin(db)  # must not raise or create a duplicate
            count = db.query(User).filter(User.username == "admin").count()
            assert count == 1
        finally:
            _delete_seeded_admin(db)
