"""Tests for /ihc/stats and /ihc/case-list — the two report/study endpoints
that read IHCResult (surgical, numeric_value now String) and NongyneIHCResult
(numeric_value still Float) side by side. These are the one place a future
change to either column's type could silently break formatting (the surgical
side had `:g`-formatted a plain string until this was fixed), so these tests
pin down both the surgical and non-gyne branches independently."""

from datetime import date, timedelta

from app.crud.ihc import (
    upsert_result,
    create_option,
    create_extra_field,
    create_extra_field_option,
    upsert_extra_value,
)
from app.crud.nongyne_ihc import upsert_nongyne_result
from app.schemas.ihc import (
    IHCResultUpsert,
    NongyneIHCResultUpsert,
    IHCMarkerOptionCreate,
    IHCMarkerExtraFieldCreate,
    IHCMarkerExtraFieldOptionCreate,
    IHCResultExtraValueUpsert,
)

from tests.factories import (
    make_signable_case,
    make_anatomical_pathology_test,
    make_bare_nongyne_case,
)

YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()


class TestIHCStats:
    def test_surgical_counts_resolve_option_labels(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-Stats")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive",
        ))
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive",
        ))

        res = admin_client.get("/ihc/stats", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        assert res.status_code == 200
        surgical = res.json()["surgical"]
        marker = next(m for m in surgical if m["ap_test_id"] == ihc_test.id)
        assert marker["total"] == 1
        assert marker["results"] == [{"option_value": "positive", "option_label": "Positive", "count": 1}]

    def test_falls_back_to_raw_value_when_no_option_configured(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-Stats-2")
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="unlisted_value",
        ))

        res = admin_client.get("/ihc/stats", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        marker = next(m for m in res.json()["surgical"] if m["ap_test_id"] == ihc_test.id)
        assert marker["results"][0]["option_label"] == "unlisted_value"

    def test_nongyne_counts_are_independent_of_surgical(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="p16-Stats")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive",
        ))
        upsert_nongyne_result(db, NongyneIHCResultUpsert(
            case_id=case.id, ap_test_id=ihc_test.id, selected_option="positive",
        ))

        res = admin_client.get("/ihc/stats", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        body = res.json()
        assert not any(m["ap_test_id"] == ihc_test.id for m in body["surgical"])
        nongyne_marker = next(m for m in body["nongyne"] if m["ap_test_id"] == ihc_test.id)
        assert nongyne_marker["results"] == [{"option_value": "positive", "option_label": "Positive", "count": 1}]

    def test_excludes_results_outside_the_date_range(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-Stats-3")
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive",
        ))
        long_ago = (date.today() - timedelta(days=365)).isoformat()
        long_ago_end = (date.today() - timedelta(days=364)).isoformat()

        res = admin_client.get("/ihc/stats", params={"start_date": long_ago, "end_date": long_ago_end})

        assert not any(m["ap_test_id"] == ihc_test.id for m in res.json()["surgical"])


class TestIHCCaseList:
    def test_surgical_numeric_value_range_is_not_reformatted_as_a_float(self, db, admin_client, admin_user):
        """Regression: IHCResult.numeric_value is a String now (supports ranges
        like "31-40"); the case-list endpoint must interpolate it verbatim,
        not run it through a `:g` float-format spec (which would crash)."""
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-CaseList")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive",
        ))
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id,
            selected_option="positive", numeric_value="31-40",
        ))

        res = admin_client.get("/ihc/case-list", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        assert res.status_code == 200
        surgical = res.json()["surgical"]
        assert "ER-CaseList" in surgical["columns"]
        row = next(r for r in surgical["rows"] if r["accession_no"] == case.accession_no)
        assert row["ihc"]["ER-CaseList"] == "Positive (31-40)"

    def test_surgical_cell_composes_extra_field_values_alongside_the_primary_pick(self, db, admin_client, admin_user):
        """Case-list should read the same way generate_ihc_text's report line does:
        primary pick + percentage + each extra field's resolved value."""
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-Extra-CaseList")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive",
        ))
        field = create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        create_extra_field_option(db, field.id, IHCMarkerExtraFieldOptionCreate(
            option_label="Strong (3+)", option_value="3+",
        ))
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id,
            selected_option="positive", numeric_value="91-100",
        ))
        upsert_extra_value(db, IHCResultExtraValueUpsert(
            surgical_specimen_id=specimen.id, field_id=field.id, value="3+",
        ))

        res = admin_client.get("/ihc/case-list", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        row = next(r for r in res.json()["surgical"]["rows"] if r["accession_no"] == case.accession_no)
        assert row["ihc"]["ER-Extra-CaseList"] == "Positive (91-100), Intensity: Strong (3+)"

    def test_surgical_cell_ignores_unset_extra_fields(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="ER-NoExtra-CaseList")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive",
        ))
        create_extra_field(db, IHCMarkerExtraFieldCreate(
            ap_test_id=ihc_test.id, field_key="intensity", label="Intensity", field_type="select",
        ))
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive",
        ))

        res = admin_client.get("/ihc/case-list", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        row = next(r for r in res.json()["surgical"]["rows"] if r["accession_no"] == case.accession_no)
        assert row["ihc"]["ER-NoExtra-CaseList"] == "Positive"

    def test_nongyne_numeric_value_still_uses_float_g_formatting(self, db, admin_client, admin_user):
        """Nongyne's numeric_value column was intentionally left as Float (out
        of scope for the surgical-only range-support change) — this pins down
        that its `:g` formatting still strips a trailing .0."""
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="Ki67-CaseList")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="Positive", option_value="positive",
        ))
        upsert_nongyne_result(db, NongyneIHCResultUpsert(
            case_id=case.id, ap_test_id=ihc_test.id, selected_option="positive", numeric_value=40.0,
        ))

        res = admin_client.get("/ihc/case-list", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        nongyne = res.json()["nongyne"]
        row = next(r for r in nongyne["rows"] if r["accession_no"] == case.accession_no)
        assert row["ihc"]["Ki67-CaseList"] == "Positive (40)"

    def test_omits_numeric_suffix_when_no_numeric_value_recorded(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="HER2-CaseList")
        create_option(db, IHCMarkerOptionCreate(
            ap_test_id=ihc_test.id, option_label="3+", option_value="3+",
        ))
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="3+",
        ))

        res = admin_client.get("/ihc/case-list", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        row = next(r for r in res.json()["surgical"]["rows"] if r["accession_no"] == case.accession_no)
        assert row["ihc"]["HER2-CaseList"] == "3+"

    def test_diagnosis_defaults_to_empty_string_when_none_signed(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name="PR-CaseList")
        upsert_result(db, IHCResultUpsert(
            surgical_specimen_id=specimen.id, ap_test_id=ihc_test.id, selected_option="positive",
        ))

        res = admin_client.get("/ihc/case-list", params={"start_date": YESTERDAY, "end_date": TOMORROW})

        row = next(r for r in res.json()["surgical"]["rows"] if r["accession_no"] == case.accession_no)
        assert row["diagnosis"] == ""
