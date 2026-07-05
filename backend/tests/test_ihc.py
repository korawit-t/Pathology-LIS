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
    create_extra_field,
    create_extra_field_option,
    update_extra_field_option,
    delete_extra_field,
    upsert_extra_value,
)
from app.crud.nongyne_ihc import (
    upsert_nongyne_result,
    delete_nongyne_result,
    get_ihc_panel_for_nongyne_case,
)
from app.schemas.ihc import (
    IHCResultUpsert,
    NongyneIHCResultUpsert,
    IHCMarkerOptionCreate,
    IHCMarkerExtraFieldCreate,
    IHCMarkerExtraFieldOptionCreate,
    IHCMarkerExtraFieldOptionUpdate,
    IHCResultExtraValueUpsert,
)
from app.models.ihc_result import IHCResult
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


class TestIHCMarkerExtraFields:
    """Extra fields let a marker capture more than one independent structured value
    at once (e.g. ER: Positive/Negative primary pick + an independent Intensity
    pick) — additive, on top of the existing selected_option/numeric_value."""

    def test_update_extra_field_option_edits_in_place(self, db, admin_user):
        registrar, _ = admin_user
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-edit")
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        option = create_extra_field_option(db, field.id, IHCMarkerExtraFieldOptionCreate(
            option_label="3+", option_value="3+",
        ))

        updated = update_extra_field_option(db, option.id, IHCMarkerExtraFieldOptionUpdate(
            option_label="3+ (Strong)",
        ))

        assert updated.id == option.id
        assert updated.option_label == "3+ (Strong)"
        assert updated.option_value == "3+"  # untouched field stays as-is

    def test_update_extra_field_option_missing_returns_none(self, db):
        assert update_extra_field_option(db, 999999, IHCMarkerExtraFieldOptionUpdate(option_label="x")) is None

    def test_upsert_extra_value_creates_parent_result_row_if_missing(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER")
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        create_extra_field_option(db, field.id, IHCMarkerExtraFieldOptionCreate(
            option_label="3+ (Strong)", option_value="3+",
        ))

        value = upsert_extra_value(db, IHCResultExtraValueUpsert(
            surgical_specimen_id=specimen.id, field_id=field.id, value="3+",
        ))

        assert value is not None
        assert value.value == "3+"
        result = db.query(IHCResult).filter(
            IHCResult.surgical_specimen_id == specimen.id, IHCResult.ap_test_id == ihc_test.id,
        ).first()
        assert result is not None
        assert result.selected_option is None  # primary pick untouched

    def test_upsert_extra_value_does_not_touch_stain_status(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER2")
        stain = make_block_stain(db, block.id, test_id=ihc_test.id, status="stained")
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))

        upsert_extra_value(db, IHCResultExtraValueUpsert(
            surgical_specimen_id=specimen.id, field_id=field.id, value="3+",
        ))

        db.refresh(stain)
        assert stain.status == "stained"  # not flipped to "completed" by an extra-only value

    def test_upsert_extra_value_with_empty_value_and_no_row_is_a_noop(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER3")
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))

        result = upsert_extra_value(db, IHCResultExtraValueUpsert(
            surgical_specimen_id=specimen.id, field_id=field.id, value=None,
        ))

        assert result is None
        assert db.query(IHCResult).filter(IHCResult.surgical_specimen_id == specimen.id).first() is None

    def test_upsert_extra_value_clears_without_deleting_parent_result(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER4")
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        upsert_result(db, IHCResultUpsert(surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive"))
        upsert_extra_value(db, IHCResultExtraValueUpsert(surgical_specimen_id=specimen.id, field_id=field.id, value="3+"))

        cleared = upsert_extra_value(db, IHCResultExtraValueUpsert(
            surgical_specimen_id=specimen.id, field_id=field.id, value=None,
        ))

        assert cleared is None
        result = db.query(IHCResult).filter(IHCResult.surgical_specimen_id == specimen.id).first()
        assert result is not None
        assert result.selected_option == "positive"  # parent untouched by clearing the extra value

    def test_upsert_extra_value_unknown_field_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        result = upsert_extra_value(db, IHCResultExtraValueUpsert(
            surgical_specimen_id=specimen.id, field_id=999999, value="3+",
        ))

        assert result is None

    def test_panel_includes_extra_fields_with_current_value(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER5")
        make_block_stain(db, block.id, test_id=ihc_test.id)
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select", display_order=1,
        ))
        create_extra_field_option(db, field.id, IHCMarkerExtraFieldOptionCreate(
            option_label="3+ (Strong)", option_value="3+",
        ))
        upsert_extra_value(db, IHCResultExtraValueUpsert(surgical_specimen_id=specimen.id, field_id=field.id, value="3+"))

        panel = get_ihc_panel_for_specimen(db, specimen.id)

        marker = next(p for p in panel if p["ap_test_id"] == ihc_test.id)
        assert len(marker["extra_fields"]) == 1
        ef = marker["extra_fields"][0]
        assert ef["field_key"] == "intensity"
        assert ef["value"] == "3+"
        assert ef["options"][0]["option_value"] == "3+"

    def test_panel_extra_field_disappears_after_field_deleted(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER6")
        make_block_stain(db, block.id, test_id=ihc_test.id)
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        upsert_extra_value(db, IHCResultExtraValueUpsert(surgical_specimen_id=specimen.id, field_id=field.id, value="3+"))

        assert delete_extra_field(db, field.id) is True
        panel = get_ihc_panel_for_specimen(db, specimen.id)

        marker = next(p for p in panel if p["ap_test_id"] == ihc_test.id)
        assert marker["extra_fields"] == []

    def test_generate_ihc_text_composes_primary_percentage_and_extra_intensity_field(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER")
        make_block_stain(db, block.id, test_id=ihc_test.id)
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive", numeric_unit="%",
        ))
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        create_extra_field_option(db, field.id, IHCMarkerExtraFieldOptionCreate(
            option_label="Strong (3+)", option_value="3+",
        ))
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive", numeric_value=95,
        ))
        upsert_extra_value(db, IHCResultExtraValueUpsert(surgical_specimen_id=specimen.id, field_id=field.id, value="3+"))

        panel = get_ihc_panel_for_specimen(db, specimen.id)
        text = generate_ihc_text(panel)

        assert "ER: Positive, 95%, Strong (3+)" in text


class TestIHCExtraFieldsRouter:
    """Full HTTP-level smoke test through routing/auth/response_model, complementing
    the crud-level tests above (which bypass FastAPI's request/response layer)."""

    def test_full_admin_and_pathologist_flow(self, db, admin_client, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-HTTP")
        make_block_stain(db, block.id, test_id=ihc_test.id)

        # Admin creates the primary option and an extra field with its own option
        opt_res = admin_client.post(
            f"/ihc/markers/{ihc_test.id}/options",
            json={"ap_test_id": ihc_test.id, "option_label": "Positive", "option_value": "positive", "numeric_unit": "%"},
        )
        assert opt_res.status_code == 201, opt_res.text

        field_res = admin_client.post(
            f"/ihc/markers/{ihc_test.id}/extra-fields",
            json={"ap_test_id": ihc_test.id, "field_key": "intensity", "label": "Intensity", "field_type": "select"},
        )
        assert field_res.status_code == 201, field_res.text
        field_id = field_res.json()["id"]

        option_res = admin_client.post(
            f"/ihc/extra-fields/{field_id}/options",
            json={"option_label": "Strong (3+)", "option_value": "3+"},
        )
        assert option_res.status_code == 201, option_res.text

        list_res = admin_client.get(f"/ihc/markers/{ihc_test.id}/extra-fields")
        assert list_res.status_code == 200
        assert list_res.json()[0]["options"][0]["option_value"] == "3+"

        # Pathologist fills in the primary pick + percentage + the extra intensity field
        primary_res = pathologist_client.put(
            "/ihc/results",
            json={"surgical_specimen_id": specimen.id, "ap_test_id": ihc_test.id, "selected_option": "positive", "numeric_value": 95},
        )
        assert primary_res.status_code == 200, primary_res.text

        extra_res = pathologist_client.put(
            "/ihc/result-extra-values",
            json={"surgical_specimen_id": specimen.id, "field_id": field_id, "value": "3+"},
        )
        assert extra_res.status_code == 200, extra_res.text
        assert extra_res.json()["value"] == "3+"

        # Panel reflects both the primary pick and the extra field's value
        panel_res = pathologist_client.get(f"/ihc/specimens/{specimen.id}/panel")
        assert panel_res.status_code == 200
        marker = next(m for m in panel_res.json() if m["ap_test_id"] == ihc_test.id)
        assert marker["result"]["selected_option"] == "positive"
        assert marker["extra_fields"][0]["value"] == "3+"

    def test_extra_field_endpoints_reject_clinician_role(self, clinician_client, admin_user, db):
        """CAN_MANAGE_SETTINGS (admin/lab_manager/pathologist/senior_pathologist) mirrors the
        existing option endpoints exactly — clinicians are outside that set either way."""
        registrar, _ = admin_user
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-HTTP-2")

        res = clinician_client.post(
            f"/ihc/markers/{ihc_test.id}/extra-fields",
            json={"ap_test_id": ihc_test.id, "field_key": "intensity", "label": "Intensity", "field_type": "select"},
        )

        assert res.status_code == 403

    def test_patch_extra_field_option_over_http(self, admin_client, db):
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-HTTP-3")
        field_res = admin_client.post(
            f"/ihc/markers/{ihc_test.id}/extra-fields",
            json={"ap_test_id": ihc_test.id, "field_key": "intensity", "label": "Intensity", "field_type": "select"},
        )
        field_id = field_res.json()["id"]
        option_res = admin_client.post(
            f"/ihc/extra-fields/{field_id}/options",
            json={"option_label": "3+", "option_value": "3+"},
        )
        option_id = option_res.json()["id"]

        patch_res = admin_client.patch(
            f"/ihc/extra-field-options/{option_id}",
            json={"option_label": "3+ (Strong)"},
        )

        assert patch_res.status_code == 200, patch_res.text
        assert patch_res.json()["option_label"] == "3+ (Strong)"


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
