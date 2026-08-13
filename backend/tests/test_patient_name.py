"""Tests for app/utils/patient_name.py.

Patient.name is the first name only, so the title and surname have to be
joined back on for anything a human reads. Regression cover for two
notification paths that were dropping the title.
"""

from app.models.organization import Title
from app.utils.patient_name import full_patient_name

from tests.factories import make_patient


class _Bare:
    """Stand-in for a Patient that has no title relationship loaded."""

    def __init__(self, name=None, ln=None):
        self.name = name
        self.ln = ln


class TestFullPatientName:
    def test_joins_title_name_and_surname(self, db):
        title = Title(title="นาย")
        db.add(title)
        db.commit()
        patient = make_patient(db, name="สมชาย")
        patient.title_id = title.id
        patient.ln = "ใจดี"
        db.commit()
        db.refresh(patient)

        assert full_patient_name(patient) == "นาย สมชาย ใจดี"

    def test_skips_a_missing_title(self, db):
        patient = make_patient(db, name="สมชาย")
        patient.ln = "ใจดี"
        db.commit()

        assert full_patient_name(patient) == "สมชาย ใจดี"

    def test_skips_a_missing_surname(self):
        assert full_patient_name(_Bare(name="NOY")) == "NOY"

    def test_no_patient_returns_the_default(self):
        assert full_patient_name(None) == ""
        assert full_patient_name(None, default="-") == "-"

    def test_entirely_blank_patient_returns_the_default(self):
        assert full_patient_name(_Bare(), default="-") == "-"


class TestNotificationPathsCarryTheTitle:
    def test_critical_notification_lookup_includes_the_title(self, db, admin_user):
        from app.routers.critical_notification_log import _lookup_case_data
        from tests.factories import make_signable_case

        registrar, _ = admin_user
        title = Title(title="นางสาว")
        db.add(title)
        db.commit()
        patient = make_patient(db, name="สมหญิง")
        patient.title_id = title.id
        patient.ln = "รักดี"
        db.commit()
        case, _ = make_signable_case(db, registrar_id=registrar.id, patient=patient)

        data = _lookup_case_data(db, case.id, "SURGICAL")

        assert data["name"] == "นางสาว สมหญิง รักดี"
