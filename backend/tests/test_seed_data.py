"""
Regression coverage for seed_data.py's admin-user seeding.

Guards against reintroducing the bug where seed_admin() passed a
`hospital_id` kwarg to User() after the user_hosp001 migration replaced
that column with the `hospitals` many-to-many relationship — which raised
"'hospital_id' is an invalid keyword argument for User" on a fresh DB.
"""
from app.models.organization import Hospital
from app.models.user import User
from seed_data import seed_admin


def _delete_seeded_admin(db):
    db.query(User).filter(User.username == "admin").delete()
    db.commit()


class TestSeedAdmin:
    def test_creates_admin_and_links_first_hospital_if_any_exist(self, db):
        # Whether any Hospital row already exists depends on what other test
        # files committed earlier in this run (commits persist for the whole
        # pytest session here, not just this test) — so this can't assume a
        # clean table. Instead, capture whatever seed_admin()'s own
        # `Hospital.query.first()` would see right before calling it, and
        # assert seed_admin() links to that same row (or none, if there
        # truly isn't one yet).
        expected_hospital = db.query(Hospital).first()
        try:
            seed_admin(db)
            user = db.query(User).filter(User.username == "admin").first()
            assert user is not None
            if expected_hospital is None:
                assert user.hospitals == []
            else:
                assert user.hospitals == [expected_hospital]
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
