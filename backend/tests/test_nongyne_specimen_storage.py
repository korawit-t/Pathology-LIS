"""Tests for non-gyne cytology specimen storage
(the /nongyne-cytology/storage/* endpoints + the storage crud functions).

Storage was added after disposal shipped, and disposal now depends on it: a
specimen with no recorded location cannot go on a disposal sheet. So these
tests care about the handoff between the two as much as about storage itself.
"""

import uuid
from datetime import timedelta

import pytest
from passlib.context import CryptContext

from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.specimen_template import SpecimenTemplate
from app.models.user import User
from app.utils.time import local_now
from tests.factories import make_hospital, make_patient

_pwd = CryptContext(schemes=["argon2"], deprecated="auto")

UNSTORED = "/nongyne-cytology/storage/unstored"
STORED = "/nongyne-cytology/storage/stored"
BULK = "/nongyne-cytology/storage/bulk-update"


def _make_user(db, roles: list[str], prefix: str) -> tuple[User, str]:
    password = "StoragePass1!"
    user = User(
        username=f"{prefix}_{uuid.uuid4().hex[:12]}",
        hashed_password=_pwd.hash(password),
        full_name=f"คุณ{prefix} ทดสอบ",
        roles=roles,
        status=True,
        is_temporary_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, password


@pytest.fixture
def cyto_user(db):
    return _make_user(db, ["cytotechnologist"], "ngstore")


@pytest.fixture
def cyto_client(client, cyto_user):
    user, pwd = cyto_user
    r = client.post("/auth/login", data={"username": user.username, "password": pwd})
    assert r.status_code == 200, r.text
    return client


def _case(
    db,
    registrar_id: int,
    *,
    stored: bool = False,
    container: str = "NG-01",
    is_cancelled: bool = False,
    is_out_lab: bool = False,
    is_out_lab_consult: bool = False,
    discard_status: bool = False,
    days_ago: int | None = None,
    specimen_type: str = "Fluid",
) -> NongyneCytologyCase:
    case = NongyneCytologyCase(
        accession_no=f"N26-{uuid.uuid4().hex[:12]}",
        patient_id=make_patient(db, name=f"ST{uuid.uuid4().hex[:8]}").id,
        hospital_id=make_hospital(db).id,
        registrar_id=registrar_id,
        status="published" if days_ago is not None else "registered",
        specimen_type=specimen_type,
        collection_site="Pleural fluid",
        is_cancelled=is_cancelled,
        is_out_lab=is_out_lab,
        is_out_lab_consult=is_out_lab_consult,
        discard_status=discard_status,
        report_at=None if days_ago is None else local_now() - timedelta(days=days_ago),
        specimen_storage_status="Stored" if stored else None,
        specimen_storage_container=container if stored else None,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def _specimen_type(db, category: str = "nongyne_cyto", **flags) -> SpecimenTemplate:
    """A uniquely named type — rows persist across tests in the same run, so a
    shared name like "FNA" would leak one test's flags into another's cases."""
    template = SpecimenTemplate(
        name=f"Type {uuid.uuid4().hex[:8]}", category=category, **flags
    )
    db.add(template)
    db.commit()
    return template


def _accessions(resp):
    body = resp.json()
    items = body["items"] if isinstance(body, dict) else body
    return {i["accession_no"] for i in items}


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get(UNSTORED).status_code == 401

    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get(UNSTORED).status_code == 403

    def test_gross_cannot_list(self, client, db):
        """gross runs the surgical specimen room, not the cytology fridge."""
        user, pwd = _make_user(db, ["gross"], "grossstore")
        client.post("/auth/login", data={"username": user.username, "password": pwd})
        assert client.get(UNSTORED).status_code == 403

    def test_cytotech_can_list(self, cyto_client):
        assert cyto_client.get(UNSTORED).status_code == 200

    def test_clinician_cannot_bulk_update(self, clinician_client):
        r = clinician_client.post(
            BULK, json={"case_ids": [1], "container_number": "NG-01"}
        )
        assert r.status_code == 403


class TestUnstoredList:
    def test_lists_cases_with_no_location(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id)
        assert case.accession_no in _accessions(cyto_client.get(UNSTORED))

    def test_excludes_already_stored(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id, stored=True)
        assert case.accession_no not in _accessions(cyto_client.get(UNSTORED))

    def test_excludes_cancelled(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id, is_cancelled=True)
        assert case.accession_no not in _accessions(cyto_client.get(UNSTORED))

    def test_excludes_out_lab(self, cyto_client, cyto_user, db):
        """The specimen went to another lab — it is not in our fridge to locate."""
        sent_out = _case(db, cyto_user[0].id, is_out_lab=True)
        consulted = _case(db, cyto_user[0].id, is_out_lab_consult=True)
        accs = _accessions(cyto_client.get(UNSTORED))
        assert sent_out.accession_no not in accs
        assert consulted.accession_no not in accs

    def test_search_by_accession(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id)
        r = cyto_client.get(f"{UNSTORED}?search={case.accession_no}")
        assert _accessions(r) == {case.accession_no}


class TestBulkUpdate:
    def test_records_location_and_who_did_it(self, cyto_client, cyto_user, db):
        cases = [_case(db, cyto_user[0].id) for _ in range(3)]
        r = cyto_client.post(
            BULK,
            json={"case_ids": [c.id for c in cases], "container_number": "NG-12"},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) == 3

        for c in cases:
            db.refresh(c)
            assert c.specimen_storage_status == "Stored"
            assert c.specimen_storage_container == "NG-12"
            assert c.specimen_storage_at is not None
            assert c.specimen_storage_by_id == cyto_user[0].id

    def test_stored_case_leaves_the_unstored_queue(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id)
        assert case.accession_no in _accessions(cyto_client.get(UNSTORED))

        cyto_client.post(BULK, json={"case_ids": [case.id], "container_number": "NG-03"})
        assert case.accession_no not in _accessions(cyto_client.get(UNSTORED))
        assert case.accession_no in _accessions(
            cyto_client.get(f"{STORED}?search={case.accession_no}")
        )

    def test_relocating_overwrites_the_container(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id, stored=True, container="NG-01")
        cyto_client.post(BULK, json={"case_ids": [case.id], "container_number": "NG-99"})
        db.refresh(case)
        assert case.specimen_storage_container == "NG-99"

    def test_empty_case_ids_rejected(self, cyto_client):
        r = cyto_client.post(BULK, json={"case_ids": [], "container_number": "NG-01"})
        assert r.status_code == 422

    def test_blank_container_rejected(self, cyto_client, cyto_user, db):
        """A blank box number is worse than none — it reads as located when it isn't."""
        case = _case(db, cyto_user[0].id)
        r = cyto_client.post(BULK, json={"case_ids": [case.id], "container_number": ""})
        assert r.status_code == 422


class TestStoredList:
    def test_lists_located_specimens_with_the_storer(self, cyto_client, cyto_user, db):
        case = _case(db, cyto_user[0].id)
        cyto_client.post(BULK, json={"case_ids": [case.id], "container_number": "NG-05"})

        r = cyto_client.get(f"{STORED}?search={case.accession_no}")
        assert r.status_code == 200
        row = r.json()["items"][0]
        assert row["specimen_storage_container"] == "NG-05"
        assert row["specimen_storer"]["full_name"] == cyto_user[0].full_name

    def test_excludes_discarded(self, cyto_client, cyto_user, db):
        """Once thrown away it belongs on the disposed list, not the shelf."""
        case = _case(db, cyto_user[0].id, stored=True, discard_status=True)
        assert case.accession_no not in _accessions(
            cyto_client.get(f"{STORED}?search={case.accession_no}")
        )

    def test_search_by_container(self, cyto_client, cyto_user, db):
        box = f"NG-{uuid.uuid4().hex[:6]}"
        cases = [_case(db, cyto_user[0].id) for _ in range(2)]
        cyto_client.post(
            BULK, json={"case_ids": [c.id for c in cases], "container_number": box}
        )
        r = cyto_client.get(f"{STORED}?search={box}")
        assert _accessions(r) == {c.accession_no for c in cases}

    def test_reports_the_retention_rule(self, cyto_client):
        assert cyto_client.get(STORED).json()["retention_days"] > 0


class TestStorageUnblocksDisposal:
    def test_recording_a_location_makes_a_due_case_disposable(
        self, cyto_client, cyto_user, db
    ):
        """The whole point of wiring the two together."""
        retention = cyto_client.get(STORED).json()["retention_days"]
        case = _case(db, cyto_user[0].id, days_ago=retention + 5)

        blocked = cyto_client.get("/nongyne-cytology/disposal/candidates?bucket=blocked&limit=200")
        assert case.accession_no in _accessions(blocked)

        cyto_client.post(BULK, json={"case_ids": [case.id], "container_number": "NG-08"})

        due = cyto_client.get(
            f"/nongyne-cytology/disposal/candidates?bucket=due&search={case.accession_no}"
        )
        assert _accessions(due) == {case.accession_no}


class TestSlidesOnlySpecimenTypes:
    """A type ticked "slides only" leaves nothing in the fridge, so its cases
    have no place in storage (or disposal — see test_nongyne_specimen_disposal)."""

    def test_left_out_of_the_unstored_queue(self, cyto_client, cyto_user, db):
        slides = _specimen_type(db, slides_only=True)
        fluid = _specimen_type(db)
        hidden = _case(db, cyto_user[0].id, specimen_type=slides.name)
        shown = _case(db, cyto_user[0].id, specimen_type=fluid.name)

        accs = _accessions(cyto_client.get(UNSTORED))
        assert hidden.accession_no not in accs
        assert shown.accession_no in accs

    def test_left_out_of_the_stored_list(self, cyto_client, cyto_user, db):
        """The storage migration backfilled "Stored" onto every reported case,
        slide-only ones included — they are not actually on the shelf."""
        slides = _specimen_type(db, slides_only=True)
        case = _case(db, cyto_user[0].id, specimen_type=slides.name, stored=True)
        assert case.accession_no not in _accessions(
            cyto_client.get(f"{STORED}?search={case.accession_no}")
        )

    def test_the_slide_count_warning_alone_hides_nothing(self, cyto_client, cyto_user, db):
        """requires_slide_count only nags at registration; a fluid type can
        carry it and still have a jar in the fridge."""
        nag_only = _specimen_type(db, requires_slide_count=True)
        case = _case(db, cyto_user[0].id, specimen_type=nag_only.name)
        assert case.accession_no in _accessions(cyto_client.get(UNSTORED))

    def test_same_name_in_another_category_hides_nothing(self, cyto_client, cyto_user, db):
        gyne = _specimen_type(db, category="gyne_cyto", slides_only=True)
        case = _case(db, cyto_user[0].id, specimen_type=gyne.name)
        assert case.accession_no in _accessions(cyto_client.get(UNSTORED))

    def test_case_with_no_specimen_type_still_listed(self, cyto_client, cyto_user, db):
        """NULL NOT IN (...) is NULL, not true — without the explicit check a
        case with no type would silently drop out of the queue."""
        _specimen_type(db, slides_only=True)  # the subquery must be non-empty
        case = _case(db, cyto_user[0].id)
        # Set after the INSERT: passing None to the constructor gets the ORM's
        # "Fluid" default instead. Rows written outside the ORM can be NULL.
        case.specimen_type = None
        db.commit()
        assert case.accession_no in _accessions(cyto_client.get(UNSTORED))

    def test_unticking_the_type_brings_its_cases_back(self, cyto_client, cyto_user, db):
        slides = _specimen_type(db, slides_only=True)
        case = _case(db, cyto_user[0].id, specimen_type=slides.name)
        assert case.accession_no not in _accessions(cyto_client.get(UNSTORED))

        slides.slides_only = False
        db.commit()
        assert case.accession_no in _accessions(cyto_client.get(UNSTORED))
