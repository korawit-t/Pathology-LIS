"""
Molecular joins the print queue, and its PDFs carry the same footer barcode
the other three case types print.

Two things are specific to Molecular and are what these tests pin down:

1. A parent-linked Molecular case carries no VN/AN of its own — those live on
   the originating Surgical case, exactly like HN does. The barcode therefore
   has to resolve through the parent, or every case ordered off a block would
   silently print without one.

2. The out-lab PDF is two documents merged: cover pages we render (one per page
   of the upload) plus the external lab's own file appended byte-for-byte. The
   barcode goes on the cover only — we do not stamp the lab's document.
"""

import io

from pypdf import PdfReader, PdfWriter

from app.crud.molecular_case import build_molecular_barcode_value
from app.models.molecular_case import MolecularCase
from app.models.system_setting import SystemSetting
from tests.factories import (
    make_signable_case,
    make_block,
    make_anatomical_pathology_test,
    make_patient,
)


def _valid_pdf_bytes(pages: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _accession_hits(pdf_bytes: bytes, accession: str, page: int = 0) -> int:
    """How many times the accession number is drawn on `page`.

    The footer barcode prints the accession as its caption, so a page that
    carries one shows the accession twice (info bar + caption) and a page
    without it once. That is the observable difference, and unlike comparing
    the two PDFs byte-for-byte it does not depend on the renders happening in
    the same second — WeasyPrint stamps a creation timestamp, and the
    compressed stream around it can differ by a byte between two calls.

    The barcode symbol itself is vector rects with no extractable text, which
    is why the caption is what gets counted.
    """
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return len(doc[page].search_for(accession))


def _order_molecular(db, pathologist_client, admin_user, is_external=True):
    registrar, _ = admin_user
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id)
    ap_test = make_anatomical_pathology_test(
        db, category="Molecular", system_code=None, name="Barcode Test Panel"
    )
    ap_test.is_external = is_external
    db.commit()

    resp = pathologist_client.post(
        "/surgical-block-stains",
        json={"block_id": block.id, "test_id": ap_test.id, "slide_no": 1},
    )
    assert resp.status_code == 200, resp.text
    mcase = pathologist_client.get(
        "/molecular-cases", params={"parent_case_id": case.id}
    ).json()[0]
    return case, mcase


class _Setting:
    barcode_opd_prefix = "2"
    barcode_ipd_prefix = "3"
    barcode_molecular_type_code = "11"


class TestMolecularBarcodeValue:
    def test_outpatient_visit_uses_the_opd_prefix_and_vn(self):
        assert build_molecular_barcode_value(
            {"vn": "690807084156"}, "M26-00001", _Setting()
        ) == ("211690807084156", "OPD VN: 690807084156")

    def test_inpatient_admission_uses_the_ipd_prefix_and_an(self):
        assert build_molecular_barcode_value(
            {"an": "690008352"}, "M26-00001", _Setting()
        ) == ("311690008352", "IPD AN: 690008352")

    def test_vn_wins_when_both_are_set(self):
        value, _ = build_molecular_barcode_value(
            {"vn": "690807084156", "an": "690008352"}, "M26-00001", _Setting()
        )
        assert value == "211690807084156"

    def test_blank_strings_are_treated_as_absent(self):
        assert build_molecular_barcode_value(
            {"vn": "   ", "an": ""}, "M26-00001", _Setting()
        ) == ("M26-00001", "Accession No.")

    def test_falls_back_to_the_unprefixed_accession_without_visit_data(self):
        assert build_molecular_barcode_value({}, "M26-00001", _Setting()) == (
            "M26-00001",
            "Accession No.",
        )

    def test_defaults_to_11_when_no_setting_row_exists(self):
        value, _ = build_molecular_barcode_value({"vn": "999"}, "M26-00001", None)
        assert value == "211999"


class TestOutlabPdfFooterBarcode:
    def test_parent_linked_case_takes_its_vn_from_the_parent_surgical_case(
        self, db, pathologist_client, admin_user
    ):
        """The case row's own vn is NULL — only the parent has one. Without the
        parent fallback this prints no barcode at all."""
        case, mcase = _order_molecular(db, pathologist_client, admin_user)
        case.vn = "690807084156"
        db.commit()

        row = db.query(MolecularCase).filter(MolecularCase.id == mcase["id"]).first()
        assert row.vn is None, "precondition: the Molecular row carries no VN of its own"

        pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/outlab-pdf",
            files={"file": ("result.pdf", _valid_pdf_bytes(), "application/pdf")},
        )

        with_bc = pathologist_client.get(
            f"/molecular-cases/{mcase['id']}/outlab-pdf", params={"with_barcode": True}
        )
        without_bc = pathologist_client.get(f"/molecular-cases/{mcase['id']}/outlab-pdf")
        assert with_bc.status_code == 200
        assert without_bc.status_code == 200
        assert _accession_hits(with_bc.content, mcase["accession_no"]) == 2
        assert _accession_hits(without_bc.content, mcase["accession_no"]) == 1

    def test_case_without_vn_or_an_prints_no_barcode(
        self, db, pathologist_client, admin_user
    ):
        """Same rule the other three follow: a barcode the HIS cannot resolve is
        worse than no barcode, so the footer is left off entirely."""
        _, mcase = _order_molecular(db, pathologist_client, admin_user)
        pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/outlab-pdf",
            files={"file": ("result.pdf", _valid_pdf_bytes(), "application/pdf")},
        )

        with_bc = pathologist_client.get(
            f"/molecular-cases/{mcase['id']}/outlab-pdf", params={"with_barcode": True}
        )
        without_bc = pathologist_client.get(f"/molecular-cases/{mcase['id']}/outlab-pdf")
        # No caption, so the accession appears once either way — asking for the
        # barcode changed nothing.
        assert _accession_hits(with_bc.content, mcase["accession_no"]) == 1
        assert _accession_hits(without_bc.content, mcase["accession_no"]) == 1

    def test_appended_outlab_pdf_is_passed_through_untouched(
        self, db, pathologist_client, admin_user
    ):
        """We stamp our own cover, never the external lab's document."""
        case, mcase = _order_molecular(db, pathologist_client, admin_user)
        case.vn = "690807084156"
        db.commit()

        uploaded = _valid_pdf_bytes(pages=2)
        pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/outlab-pdf",
            files={"file": ("result.pdf", uploaded, "application/pdf")},
        )

        resp = pathologist_client.get(
            f"/molecular-cases/{mcase['id']}/outlab-pdf", params={"with_barcode": True}
        )
        merged = PdfReader(io.BytesIO(resp.content))
        source = PdfReader(io.BytesIO(uploaded))
        # 2 cover pages (one per source page) + the 2 original pages.
        assert len(merged.pages) == len(source.pages) + 2
        assert _accession_hits(resp.content, mcase["accession_no"], page=1) == 2, (
            "the cover repeats the barcode on every page"
        )
        for offset, original in enumerate(source.pages):
            appended = merged.pages[2 + offset]
            assert appended.mediabox == original.mediabox
            assert (appended.extract_text() or "") == (original.extract_text() or "")

    def test_in_house_result_pdf_also_takes_the_barcode(
        self, db, pathologist_client, admin_user
    ):
        """A Molecular case with no out-lab upload prints the free-text result
        template instead, and that goes to paper from the same queue."""
        case, mcase = _order_molecular(db, pathologist_client, admin_user, is_external=False)
        case.vn = "690807084156"
        db.commit()

        with_bc = pathologist_client.get(
            f"/molecular-cases/{mcase['id']}/result-pdf", params={"with_barcode": True}
        )
        without_bc = pathologist_client.get(f"/molecular-cases/{mcase['id']}/result-pdf")
        assert with_bc.status_code == 200
        assert _accession_hits(with_bc.content, mcase["accession_no"]) == 2
        assert _accession_hits(without_bc.content, mcase["accession_no"]) == 1


class TestMolecularPrintQueue:
    def _reported_case(self, db, pathologist_client, admin_user):
        case, mcase = _order_molecular(db, pathologist_client, admin_user, is_external=False)
        # make_bare_case leaves hn unset; real registration always fills it, and
        # the queue row reads it through the parent.
        case.hn = "0086209"
        db.commit()
        finalize = pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/finalize",
            json={"result_text": "<p>No mutation detected.</p>"},
        )
        assert finalize.status_code == 200, finalize.text
        return mcase

    def test_queue_lists_only_reported_cases(self, db, pathologist_client, admin_user):
        _, pending = _order_molecular(db, pathologist_client, admin_user)
        reported = self._reported_case(db, pathologist_client, admin_user)

        resp = pathologist_client.get("/molecular-cases/print-queue", params={"size": 100})
        assert resp.status_code == 200, resp.text
        ids = [i["id"] for i in resp.json()["items"]]
        assert reported["id"] in ids
        assert pending["id"] not in ids

    def test_new_case_starts_unprinted_and_the_flag_round_trips(
        self, db, pathologist_client, admin_user
    ):
        mcase = self._reported_case(db, pathologist_client, admin_user)
        assert pathologist_client.get(f"/molecular-cases/{mcase['id']}").json()["is_print"] is False

        marked = pathologist_client.patch(
            f"/molecular-cases/{mcase['id']}/print-status", json={"is_print": True}
        )
        assert marked.status_code == 200, marked.text
        assert marked.json()["is_print"] is True

        unmarked = pathologist_client.patch(
            f"/molecular-cases/{mcase['id']}/print-status", json={"is_print": False}
        )
        assert unmarked.json()["is_print"] is False

    def test_is_print_filter_narrows_the_queue(self, db, pathologist_client, admin_user):
        mcase = self._reported_case(db, pathologist_client, admin_user)
        pathologist_client.patch(
            f"/molecular-cases/{mcase['id']}/print-status", json={"is_print": True}
        )

        unprinted = pathologist_client.get(
            "/molecular-cases/print-queue", params={"is_print": False, "size": 100}
        ).json()
        assert mcase["id"] not in [i["id"] for i in unprinted["items"]]

        printed = pathologist_client.get(
            "/molecular-cases/print-queue", params={"is_print": True, "size": 100}
        ).json()
        assert mcase["id"] in [i["id"] for i in printed["items"]]

    def test_unprinted_first_sorts_the_work_still_to_do_to_the_top(
        self, db, pathologist_client, admin_user
    ):
        older = self._reported_case(db, pathologist_client, admin_user)
        newer = self._reported_case(db, pathologist_client, admin_user)
        # Mark the newer one printed — without unprinted_first it would still
        # lead, since the queue is otherwise newest-reported-first.
        pathologist_client.patch(
            f"/molecular-cases/{newer['id']}/print-status", json={"is_print": True}
        )

        items = pathologist_client.get(
            "/molecular-cases/print-queue",
            params={"unprinted_first": True, "size": 100},
        ).json()["items"]
        ids = [i["id"] for i in items]
        assert ids.index(older["id"]) < ids.index(newer["id"])

    def test_queue_row_carries_what_the_screen_renders(
        self, db, pathologist_client, admin_user
    ):
        mcase = self._reported_case(db, pathologist_client, admin_user)
        row = next(
            i
            for i in pathologist_client.get(
                "/molecular-cases/print-queue", params={"size": 100}
            ).json()["items"]
            if i["id"] == mcase["id"]
        )
        assert row["accession_no"] == mcase["accession_no"]
        assert row["patient_name"]
        assert row["hn"]
        assert row["reported_at"]
        assert row["is_print"] is False

    def test_search_reaches_through_to_the_parent_case_accession(
        self, db, pathologist_client, admin_user
    ):
        case, mcase = _order_molecular(db, pathologist_client, admin_user, is_external=False)
        pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/finalize",
            json={"result_text": "<p>Result.</p>"},
        )

        found = pathologist_client.get(
            "/molecular-cases/print-queue", params={"search": case.accession_no}
        ).json()
        assert [i["id"] for i in found["items"]] == [mcase["id"]]

    def test_cancelled_cases_never_appear(self, db, pathologist_client, admin_user):
        mcase = self._reported_case(db, pathologist_client, admin_user)
        pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/cancel", json={"cancel_reason": "duplicate"}
        )

        ids = [
            i["id"]
            for i in pathologist_client.get(
                "/molecular-cases/print-queue", params={"size": 100}
            ).json()["items"]
        ]
        assert mcase["id"] not in ids


class TestMolecularBarcodeLabelSheet:
    def test_label_sheet_renders_for_the_selected_cases(
        self, db, pathologist_client, admin_user
    ):
        case, mcase = _order_molecular(db, pathologist_client, admin_user)
        case.vn = "690807084156"
        db.commit()

        resp = pathologist_client.post(
            "/molecular-cases/barcode-pdf", json={"case_ids": [mcase["id"]]}
        )
        assert resp.status_code == 200, resp.text
        assert resp.content.startswith(b"%PDF")
        text = PdfReader(io.BytesIO(resp.content)).pages[0].extract_text() or ""
        assert mcase["accession_no"] in text

    def test_label_sheet_is_not_gated_on_visit_data(
        self, db, pathologist_client, admin_user
    ):
        """Unlike the report footer, the sticker falls back to the accession
        number — it is scanned for in-lab tracking, not by the HIS."""
        _, mcase = _order_molecular(db, pathologist_client, admin_user)
        resp = pathologist_client.post(
            "/molecular-cases/barcode-pdf", json={"case_ids": [mcase["id"]]}
        )
        assert resp.status_code == 200, resp.text
        assert resp.content.startswith(b"%PDF")

    def test_standalone_case_uses_its_own_vn(self, db, pathologist_client, admin_user):
        patient = make_patient(db, name="Label Sheet Patient")
        ap_test = make_anatomical_pathology_test(
            db, category="Molecular", system_code=None, name="BRAF"
        )
        created = pathologist_client.post(
            "/molecular-cases",
            json={"patient_id": patient.id, "ap_test_id": ap_test.id, "vn": "111222333"},
        ).json()

        resp = pathologist_client.post(
            "/molecular-cases/barcode-pdf", json={"case_ids": [created["id"]]}
        )
        assert resp.status_code == 200, resp.text
        text = PdfReader(io.BytesIO(resp.content)).pages[0].extract_text() or ""
        assert "OPD VN: 111222333" in text

    def test_empty_selection_is_rejected(self, pathologist_client):
        assert pathologist_client.post("/molecular-cases/barcode-pdf", json={"case_ids": []}).status_code == 400

    def test_unknown_case_ids_produce_no_sheet(self, pathologist_client):
        assert pathologist_client.post(
            "/molecular-cases/barcode-pdf", json={"case_ids": [99999999]}
        ).status_code == 404


class TestMolecularBarcodeTypeCodeSetting:
    def test_the_configured_type_code_is_used(self, db):
        setting = db.query(SystemSetting).first()
        if not setting:
            setting = SystemSetting()
            db.add(setting)
        setting.barcode_opd_prefix = "2"
        setting.barcode_molecular_type_code = "77"
        db.commit()

        value, _ = build_molecular_barcode_value({"vn": "123"}, "M26-00001", setting)
        assert value == "277123"
