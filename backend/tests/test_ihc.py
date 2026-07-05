"""Tests for app/crud/ihc.py (Surgical, specimen-level) and
app/crud/nongyne_ihc.py (NonGyne, case-level) — parallel implementations of
the same IHC-result-upsert + stain-status-sync pattern. Both revert their
matching stains from "completed" back to "stained" when a result's
selected_option is cleared, and only ever touch stains already in
{"stained", "completed"} (never "pending"). Also covers generate_ihc_text's
option-label lookup and numeric-unit formatting."""

from app.crud.ihc import (
    upsert_result,
    delete_result,
    get_ihc_panel_for_specimen,
    generate_ihc_text,
    create_option,
)
from app.crud.nongyne_ihc import (
    upsert_nongyne_result,
    delete_nongyne_result,
    get_ihc_panel_for_nongyne_case,
)
from app.schemas.ihc import IHCResultUpsert, NongyneIHCResultUpsert, IHCMarkerOptionCreate
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.nongyne_cyto_stain import NongyneCytologyStain

from tests.factories import (
    make_signable_case,
    make_block,
    make_block_stain,
    make_anatomical_pathology_test,
    make_bare_nongyne_case,
)


class TestSurgicalIHCResult:
    def test_upsert_marks_stains_completed_when_result_selected(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Ki67")
        stain = make_block_stain(db, block.id, test_id=ihc_test.id, status="stained")

        upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive"))

        db.refresh(stain)
        assert stain.status == "completed"

    def test_clearing_result_reverts_stains_to_stained(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="p53")
        stain = make_block_stain(db, block.id, test_id=ihc_test.id, status="stained")
        upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive"))

        upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option=None))

        db.refresh(stain)
        assert stain.status == "stained"

    def test_upsert_updates_existing_row_instead_of_duplicating(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER")

        first = upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive"))
        second = upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="negative"))

        assert first.id == second.id
        assert second.selected_option == "negative"

    def test_pending_stains_not_touched(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Her2")
        pending_stain = make_block_stain(db, block.id, test_id=ihc_test.id, status="pending")

        upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive"))

        db.refresh(pending_stain)
        assert pending_stain.status == "pending"

    def test_delete_result(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="CK7")
        result = upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive"))

        assert delete_result(db, result.id) is True
        assert delete_result(db, result.id) is False


class TestSurgicalIHCPanel:
    def test_panel_only_includes_ihc_category_markers(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="GATA3")
        he_test = make_anatomical_pathology_test(db, category="Histology", name="Routine HE")
        make_block_stain(db, block.id, test_id=ihc_test.id, slide_no=1)
        make_block_stain(db, block.id, test_id=he_test.id, slide_no=2)

        panel = get_ihc_panel_for_specimen(db, specimen.id)

        marker_ids = [p["ap_test_id"] for p in panel]
        assert ihc_test.id in marker_ids
        assert he_test.id not in marker_ids

    def test_panel_deduplicates_marker_stained_on_multiple_slides(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="TTF1")
        make_block_stain(db, block.id, test_id=ihc_test.id, slide_no=1)
        make_block_stain(db, block.id, test_id=ihc_test.id, slide_no=2)

        panel = get_ihc_panel_for_specimen(db, specimen.id)

        assert len([p for p in panel if p["ap_test_id"] == ihc_test.id]) == 1


class TestGenerateIhcText:
    def test_empty_panel_returns_empty_string(self):
        assert generate_ihc_text([]) == ""

    def test_skips_markers_without_a_result(self):
        panel = [{"ap_test_id": 1, "marker_name": "Ki67", "options": [], "result": None}]
        assert generate_ihc_text(panel) == ""

    def test_resolves_option_label_and_appends_numeric_unit_and_note(self, db):
        from app.schemas.ihc import IHCResultResponse
        from datetime import datetime, timezone

        option = create_option(db, IHCMarkerOptionCreate(
            ap_test_id=1, option_label="Positive", option_value="pos", numeric_unit="%",
        ))
        result = IHCResultResponse(
            id=1, surgical_specimen_id=1, ap_test_id=1,
            selected_option="pos", numeric_value=40.0, note="Focal", updated_at=datetime.now(timezone.utc),
        )
        panel = [{"ap_test_id": 1, "marker_name": "Ki67", "options": [option], "result": result}]

        text = generate_ihc_text(panel)

        assert "Ki67: Positive, 40%, (Focal)" in text
        assert text.startswith("Immunohistochemical staining reveals:")


class TestNongyneIHCResult:
    def test_upsert_marks_stains_completed_and_clearing_reverts(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="p16")
        stain = NongyneCytologyStain(case_id=case.id, test_id=ihc_test.id, status="stained")
        db.add(stain)
        db.commit()

        upsert_nongyne_result(db, NongyneIHCResultUpsert(case_id=case.id, ap_test_id=ihc_test.id, selected_option="positive"))
        db.refresh(stain)
        assert stain.status == "completed"

        upsert_nongyne_result(db, NongyneIHCResultUpsert(case_id=case.id, ap_test_id=ihc_test.id, selected_option=None))
        db.refresh(stain)
        assert stain.status == "stained"

    def test_upsert_updates_existing_row_instead_of_duplicating(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="p40")

        first = upsert_nongyne_result(db, NongyneIHCResultUpsert(case_id=case.id, ap_test_id=ihc_test.id, selected_option="positive"))
        second = upsert_nongyne_result(db, NongyneIHCResultUpsert(case_id=case.id, ap_test_id=ihc_test.id, selected_option="negative"))

        assert first.id == second.id
        assert second.selected_option == "negative"

    def test_delete_result(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Napsin A")
        result = upsert_nongyne_result(db, NongyneIHCResultUpsert(case_id=case.id, ap_test_id=ihc_test.id, selected_option="positive"))

        assert delete_nongyne_result(db, result.id) is True
        assert delete_nongyne_result(db, result.id) is False


class TestNongyneIHCPanel:
    def test_panel_only_includes_ihc_category_markers(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Vimentin")
        pap_test = make_anatomical_pathology_test(db, category="Cytology", name="Pap Stain")
        db.add_all([
            NongyneCytologyStain(case_id=case.id, test_id=ihc_test.id),
            NongyneCytologyStain(case_id=case.id, test_id=pap_test.id),
        ])
        db.commit()

        panel = get_ihc_panel_for_nongyne_case(db, case.id)

        marker_ids = [p["ap_test_id"] for p in panel]
        assert ihc_test.id in marker_ids
        assert pap_test.id not in marker_ids
