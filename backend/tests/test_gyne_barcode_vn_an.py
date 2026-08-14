"""
Gyne label barcodes key off the case's VN/AN like surgical and non-gyne.

gyne_cytology_cases had no vn/an columns until revision cbf87c42dd0b, so the
gyne barcode had to key off the HN. That fallback is kept deliberately: cases
registered before the columns existed have NULL vn/an and must keep producing
exactly the barcode they did before.

These call build_gyne_barcode_value directly rather than decoding the rendered
PDF — decoding would mean adding a barcode reader to the production image for
the sake of a test, and the value is the whole of what changed here. The
surrounding PDF path is already covered by the router tests.
"""

from app.routers.gyne_cyto_report import build_gyne_barcode_value

OPD, IPD, TYPE = "2", "3", "09"


class _Case:
    def __init__(self, vn=None, an=None):
        self.vn, self.an = vn, an


class _Report:
    def __init__(self, patient_hn="0086209", accession_no="C26-00123"):
        self.patient_hn, self.accession_no = patient_hn, accession_no


def _value(case, report=None):
    return build_gyne_barcode_value(case, report or _Report(), OPD, IPD, TYPE)


class TestGyneBarcodeValue:
    def test_outpatient_visit_uses_the_opd_prefix_and_vn(self):
        assert _value(_Case(vn="690807084156")) == "209690807084156"

    def test_inpatient_admission_uses_the_ipd_prefix_and_an(self):
        assert _value(_Case(an="690008352")) == "309690008352"

    def test_vn_wins_when_both_are_set(self):
        assert _value(_Case(vn="690807084156", an="690008352")) == "209690807084156"

    def test_blank_strings_are_treated_as_absent(self):
        assert _value(_Case(vn="   ", an="")) == "2090086209"

    def test_falls_back_to_hn_when_the_case_has_no_visit_data(self):
        """Pre-migration cases have NULL vn/an — their barcode must not change."""
        assert _value(_Case()) == "2090086209"

    def test_falls_back_to_hn_when_the_report_has_no_case(self):
        """report.case_id is nullable, so the case lookup can legitimately miss."""
        assert _value(None) == "2090086209"

    def test_falls_back_to_accession_when_even_the_hn_is_missing(self):
        assert _value(_Case(), _Report(patient_hn=None)) == "209C26-00123"
