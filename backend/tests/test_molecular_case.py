import re

from tests.factories import (
    make_signable_case,
    make_block,
    make_anatomical_pathology_test,
    make_patient,
    make_hospital,
)


def _order_molecular_test(db, pathologist_client, admin_user, is_external=False):
    registrar, _ = admin_user
    case, specimen = make_signable_case(db, registrar_id=registrar.id)
    block = make_block(db, specimen.id)
    ap_test = make_anatomical_pathology_test(
        db, category="Molecular", system_code=None, name="EGFR Mutation Analysis"
    )
    ap_test.is_external = is_external
    db.commit()

    resp = pathologist_client.post(
        "/surgical-block-stains",
        json={"block_id": block.id, "test_id": ap_test.id, "slide_no": 1},
    )
    assert resp.status_code == 200, resp.text
    return case, resp.json()


class TestMolecularCaseAutoCreation:
    def test_ordering_molecular_test_creates_molecular_case(self, db, pathologist_client, admin_user):
        case, stain = _order_molecular_test(db, pathologist_client, admin_user, is_external=False)

        listed = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id})
        assert listed.status_code == 200, listed.text
        items = listed.json()
        assert len(items) == 1

        mcase = items[0]
        assert re.match(r"^M\d{2}-\d{5}$", mcase["accession_no"])
        assert mcase["parent_case_id"] == case.id
        assert mcase["parent_case_accession_no"] == case.accession_no
        assert mcase["status"] == "pending"
        assert mcase["is_outlab"] is False

    def test_ordering_non_molecular_test_does_not_create_molecular_case(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", system_code=None, name="ER")

        resp = pathologist_client.post(
            "/surgical-block-stains",
            json={"block_id": block.id, "test_id": ihc_test.id, "slide_no": 1},
        )
        assert resp.status_code == 200, resp.text

        listed = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id})
        assert listed.status_code == 200
        assert listed.json() == []


class TestMolecularCaseFinalize:
    def test_finalize_with_free_text_result(self, db, pathologist_client, admin_user):
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/finalize",
            json={"result_text": "EGFR exon 19 deletion detected, VAF 12%"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "reported"
        assert body["reported_at"] is not None
        assert body["result_text"] == "EGFR exon 19 deletion detected, VAF 12%"

    def test_finalize_without_result_or_pdf_fails(self, db, pathologist_client, admin_user):
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.post(f"/molecular-cases/{mcase['id']}/finalize", json={})
        assert resp.status_code == 400

    def test_outlab_pdf_upload_allows_finalize_without_free_text(self, db, pathologist_client, admin_user):
        case, _ = _order_molecular_test(db, pathologist_client, admin_user, is_external=True)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]
        assert mcase["is_outlab"] is True

        pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        upload = pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/outlab-pdf",
            files={"file": ("result.pdf", pdf_bytes, "application/pdf")},
        )
        assert upload.status_code == 200, upload.text
        assert upload.json()["outlab_pdf_path"]

        resp = pathologist_client.post(f"/molecular-cases/{mcase['id']}/finalize", json={})
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "reported"


class TestMolecularCaseStandaloneRegistration:
    def test_create_standalone_case_has_no_parent(self, db, pathologist_client, admin_user):
        patient = make_patient(db, name="Standalone Patient")
        ap_test = make_anatomical_pathology_test(
            db, category="Molecular", system_code=None, name="BRAF Mutation Analysis"
        )

        resp = pathologist_client.post(
            "/molecular-cases",
            json={"patient_id": patient.id, "ap_test_id": ap_test.id, "hn": "HN-STANDALONE-1"},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert re.match(r"^M\d{2}-\d{5}$", body["accession_no"])
        assert body["parent_case_id"] is None
        assert body["parent_case_accession_no"] is None
        assert body["hn"] == "HN-STANDALONE-1"
        assert "Standalone Patient" in (body["patient_name"] or "")
        assert body["status"] == "pending"

        listed = pathologist_client.get("/molecular-cases", params={"status": "pending"})
        assert any(c["id"] == body["id"] for c in listed.json())

    def test_standalone_case_can_be_finalized(self, db, pathologist_client, admin_user):
        patient = make_patient(db, name="Standalone Patient 2")
        ap_test = make_anatomical_pathology_test(
            db, category="Molecular", system_code=None, name="KRAS Mutation Analysis"
        )
        create = pathologist_client.post(
            "/molecular-cases", json={"patient_id": patient.id, "ap_test_id": ap_test.id}
        )
        case_id = create.json()["id"]

        resp = pathologist_client.post(
            f"/molecular-cases/{case_id}/finalize", json={"result_text": "KRAS G12D detected"}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "reported"


def _make_valid_pdf_bytes() -> bytes:
    """A minimal but genuinely parseable one-page PDF — the earlier
    hand-rolled `%PDF...trailer...%%EOF` stub is enough to satisfy the
    upload's magic-byte check but PyMuPDF can't rasterize it, so it can't
    exercise the cover-sheet merge path."""
    import io as _io
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = _io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


class TestMolecularCaseOutlabPdfCoverSheet:
    def test_download_prepends_cover_sheet_with_case_info(self, db, pathologist_client, admin_user):
        import io as _io
        from pypdf import PdfReader

        case, _ = _order_molecular_test(db, pathologist_client, admin_user, is_external=True)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        upload = pathologist_client.post(
            f"/molecular-cases/{mcase['id']}/outlab-pdf",
            files={"file": ("result.pdf", _make_valid_pdf_bytes(), "application/pdf")},
        )
        assert upload.status_code == 200, upload.text

        resp = pathologist_client.get(f"/molecular-cases/{mcase['id']}/outlab-pdf")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        merged_bytes = resp.content
        assert merged_bytes.startswith(b"%PDF")

        reader = PdfReader(_io.BytesIO(merged_bytes))
        # Cover sheet is prepended as its own page(s) in front of the 1-page upload.
        assert len(reader.pages) >= 2
        cover_text = reader.pages[0].extract_text() or ""
        # The cover shows the Molecular case's OWN accession (M26-...), not the
        # parent Surgical case's — but patient/hospital resolve through the parent
        # (letter-spacing CSS on the header splits "CONSULT" in extracted text,
        # so match on "EXTERNAL" rather than the exact heading string).
        assert mcase["accession_no"] in cover_text
        assert "EXTERNAL" in cover_text
        assert case.hospital.name in cover_text

    def test_standalone_case_cover_uses_own_accession(self, db, pathologist_client, admin_user):
        import io as _io
        from pypdf import PdfReader

        patient = make_patient(db, name="Cover Sheet Patient")
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="ROS1 FISH")
        ap_test.is_external = True
        db.commit()
        created = pathologist_client.post(
            "/molecular-cases", json={"patient_id": patient.id, "ap_test_id": ap_test.id}
        ).json()

        upload = pathologist_client.post(
            f"/molecular-cases/{created['id']}/outlab-pdf",
            files={"file": ("result.pdf", _make_valid_pdf_bytes(), "application/pdf")},
        )
        assert upload.status_code == 200, upload.text

        resp = pathologist_client.get(f"/molecular-cases/{created['id']}/outlab-pdf")
        assert resp.status_code == 200
        reader = PdfReader(_io.BytesIO(resp.content))
        cover_text = reader.pages[0].extract_text() or ""
        assert created["accession_no"] in cover_text


class TestMolecularCaseDemographicUpdate:
    def test_update_standalone_case_demographics(self, db, pathologist_client, admin_user):
        patient = make_patient(db, name="Editable Patient")
        hospital = make_hospital(db)
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="NRAS")
        created = pathologist_client.post(
            "/molecular-cases", json={"patient_id": patient.id, "ap_test_id": ap_test.id}
        ).json()

        resp = pathologist_client.patch(
            f"/molecular-cases/{created['id']}",
            json={
                "hospital_id": hospital.id,
                "hn": "HN-EDITED-1",
                "clinical_diagnosis": "Lung adenocarcinoma, R/O EGFR mutation",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["hospital_id"] == hospital.id
        assert body["hn"] == "HN-EDITED-1"
        assert body["clinical_diagnosis"] == "Lung adenocarcinoma, R/O EGFR mutation"

        refetched = pathologist_client.get(f"/molecular-cases/{created['id']}").json()
        assert refetched["hospital_id"] == hospital.id
        assert refetched["hn"] == "HN-EDITED-1"

    def test_update_rejects_demographic_fields_on_parent_linked_case(self, db, pathologist_client, admin_user):
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.patch(f"/molecular-cases/{mcase['id']}", json={"hn": "HN-SHOULD-FAIL"})
        assert resp.status_code == 400

    def test_update_still_allows_result_fields_on_parent_linked_case(self, db, pathologist_client, admin_user):
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.patch(
            f"/molecular-cases/{mcase['id']}", json={"result_text": "Draft note", "is_outlab": True}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["result_text"] == "Draft note"
        assert resp.json()["is_outlab"] is True


class TestMolecularCaseSearch:
    def test_search_matches_own_accession_no(self, db, pathologist_client, admin_user):
        patient = make_patient(db, name="Searchable Patient")
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="ALK FISH")
        created = pathologist_client.post(
            "/molecular-cases", json={"patient_id": patient.id, "ap_test_id": ap_test.id}
        ).json()

        resp = pathologist_client.get("/molecular-cases", params={"search": created["accession_no"]})
        assert resp.status_code == 200
        assert any(c["id"] == created["id"] for c in resp.json())

        resp_miss = pathologist_client.get("/molecular-cases", params={"search": "no-such-accession-xyz"})
        assert all(c["id"] != created["id"] for c in resp_miss.json())

    def test_search_matches_parent_case_accession_no(self, db, pathologist_client, admin_user):
        case, stain = _order_molecular_test(db, pathologist_client, admin_user)

        resp = pathologist_client.get("/molecular-cases", params={"search": case.accession_no})
        assert resp.status_code == 200
        items = resp.json()
        assert any(c["parent_case_id"] == case.id for c in items)

    def test_stain_id_filter_finds_the_case_spawned_from_that_order(self, db, pathologist_client, admin_user):
        """Lets StainManagementPage look up the accession of the Molecular
        case just spawned from a specific order, using only the created
        stain's own id (no need to know the Surgical case's numeric id)."""
        case, stain = _order_molecular_test(db, pathologist_client, admin_user)

        resp = pathologist_client.get("/molecular-cases", params={"stain_id": stain["id"]})
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["stain_id"] == stain["id"]
        assert items[0]["parent_case_id"] == case.id

    def test_search_matches_patient_name(self, db, pathologist_client, admin_user):
        patient = make_patient(db, name="UniqueFirstNameXyz")
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="EGFR")
        created = pathologist_client.post(
            "/molecular-cases", json={"patient_id": patient.id, "ap_test_id": ap_test.id}
        ).json()

        resp = pathologist_client.get("/molecular-cases", params={"search": "UniqueFirstNameXyz"})
        assert any(c["id"] == created["id"] for c in resp.json())


class TestMolecularCaseCancel:
    def test_cancel_removes_case_from_default_listing(self, db, pathologist_client, admin_user):
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.post(f"/molecular-cases/{mcase['id']}/cancel", json={"cancel_reason": "duplicate order"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_cancelled"] is True

        listed = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id})
        assert listed.json() == []


class TestMolecularCaseCascadeOnStainDeletion:
    def test_deleting_stain_hard_deletes_untouched_molecular_case(self, db, pathologist_client, admin_user):
        case, stain = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.delete(f"/surgical-block-stains/{stain['id']}")
        assert resp.status_code == 200, resp.text

        assert pathologist_client.get(f"/molecular-cases/{mcase['id']}").status_code == 404
        assert pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json() == []

    def test_deleting_stain_soft_cancels_molecular_case_with_a_result(self, db, pathologist_client, admin_user):
        case, stain = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]
        pathologist_client.patch(f"/molecular-cases/{mcase['id']}", json={"result_text": "draft finding"})

        resp = pathologist_client.delete(f"/surgical-block-stains/{stain['id']}")
        assert resp.status_code == 200, resp.text

        refetched = pathologist_client.get(f"/molecular-cases/{mcase['id']}")
        assert refetched.status_code == 200
        body = refetched.json()
        assert body["is_cancelled"] is True
        assert body["cancel_reason"] == "Parent stain order was deleted"
        assert body["result_text"] == "draft finding"

    def test_deleting_stain_soft_cancels_already_reported_molecular_case(self, db, pathologist_client, admin_user):
        case, stain = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]
        pathologist_client.post(f"/molecular-cases/{mcase['id']}/finalize", json={"result_text": "EGFR wild-type"})

        resp = pathologist_client.delete(f"/surgical-block-stains/{stain['id']}")
        assert resp.status_code == 200, resp.text

        refetched = pathologist_client.get(f"/molecular-cases/{mcase['id']}").json()
        assert refetched["is_cancelled"] is True
        assert refetched["status"] == "reported"

    def test_deleting_stain_with_no_molecular_case_is_unaffected(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", system_code=None, name="ER Cascade")
        stain = pathologist_client.post(
            "/surgical-block-stains", json={"block_id": block.id, "test_id": ihc_test.id, "slide_no": 1}
        ).json()

        resp = pathologist_client.delete(f"/surgical-block-stains/{stain['id']}")
        assert resp.status_code == 200, resp.text


class TestMolecularCaseAssistPathologist:
    def test_ordering_from_stain_defaults_assist_pathologist_to_the_ordering_pathologist(
        self, db, pathologist_client, pathologist_user, admin_user
    ):
        ordering_pathologist, _ = pathologist_user
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)

        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]
        assert mcase["assist_pathologist_id"] == ordering_pathologist.id
        assert mcase["assist_pathologist_name"]

    def test_ordering_from_stain_accepts_explicit_assist_pathologist_override(
        self, db, pathologist_client, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        _, other_pathologist = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ap_test = make_anatomical_pathology_test(
            db, category="Molecular", system_code=None, name="ALK Rearrangement"
        )

        resp = pathologist_client.post(
            "/surgical-block-stains",
            json={
                "block_id": block.id,
                "test_id": ap_test.id,
                "slide_no": 1,
                "assist_pathologist_id": other_pathologist.id,
            },
        )
        assert resp.status_code == 200, resp.text

        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]
        assert mcase["assist_pathologist_id"] == other_pathologist.id

    def test_standalone_registration_accepts_explicit_assist_pathologist(
        self, db, pathologist_client, two_pathologists
    ):
        assist_pathologist, _ = two_pathologists
        patient = make_patient(db, name="Assist Pathologist Patient")
        ap_test = make_anatomical_pathology_test(
            db, category="Molecular", system_code=None, name="NRAS Mutation Analysis"
        )

        resp = pathologist_client.post(
            "/molecular-cases",
            json={
                "patient_id": patient.id,
                "ap_test_id": ap_test.id,
                "assist_pathologist_id": assist_pathologist.id,
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["assist_pathologist_id"] == assist_pathologist.id

    def test_assist_pathologist_is_editable_on_a_parent_linked_case(
        self, db, pathologist_client, admin_user, two_pathologists
    ):
        _, new_assist_pathologist = two_pathologists
        case, _ = _order_molecular_test(db, pathologist_client, admin_user)
        mcase = pathologist_client.get("/molecular-cases", params={"parent_case_id": case.id}).json()[0]

        resp = pathologist_client.patch(
            f"/molecular-cases/{mcase['id']}",
            json={"assist_pathologist_id": new_assist_pathologist.id},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["assist_pathologist_id"] == new_assist_pathologist.id
