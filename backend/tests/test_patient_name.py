"""Tests for app/utils/patient_name.py.

Patient.name is the first name only, so the title and surname have to be
joined back on for anything a human reads. Regression cover for two
notification paths that were dropping the title.
"""

import pytest

from app.models.organization import Title
from app.utils.patient_name import full_patient_name, short_person_name

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


class TestShortPersonName:
    """{name_short}/{clinician_short}: title and first name kept, surname cut
    to its first letter (the format the user picked for group-chat alerts)."""

    @pytest.mark.parametrize("full, short", [
        ("นาย สมชาย ใจดี", "นาย สมชาย ใ."),
        ("นางสาว สมหญิง รักไทย", "นางสาว สมหญิง ร."),
        ("ด.ช. ต้นกล้า มีสุข", "ด.ช. ต้นกล้า ม."),
        ("นพ. ประเสริฐ รักษาดี", "นพ. ประเสริฐ ร."),
        # Clinician names are often typed with the title glued on.
        ("พญ.สุดา ใจงาม", "พญ. สุดา ใ."),
        ("น.ส.สมหญิง เอกชัย", "น.ส. สมหญิง เ."),
        ("สมชาย ใจดี", "สมชาย ใ."),
        ("Dr. John Michael Smith", "Dr. John Michael S."),
        ("  นาง   มาลี   แก้วตา  ", "นาง มาลี แ."),
    ])
    def test_surname_is_cut_to_its_first_letter(self, full, short):
        assert short_person_name(full) == short

    @pytest.mark.parametrize("full", ["นาย สมชาย", "นพ.ประเสริฐ", "สมชาย"])
    def test_name_without_a_surname_comes_back_whole(self, full):
        assert short_person_name(full).replace(" ", "") == full.replace(" ", "")

    @pytest.mark.parametrize("empty", [None, "", "   ", "-"])
    def test_missing_name_gives_the_default(self, empty):
        assert short_person_name(empty) == "-"
        assert short_person_name(empty, default="") == ""
