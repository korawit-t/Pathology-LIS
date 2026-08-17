"""
Non-gyne barcodes key off the case's VN/AN like surgical and gyne.

Non-gyne registration did not capture VN/AN until commit 33a1b04, so cases
registered before it have neither. That fallback is kept deliberately: those
cases must keep producing exactly the barcode they did before — the accession
number, unprefixed, since there is no visit for HOSxP to resolve.

The label sheet and the report footer both go through this one builder, so a
divergence between what the sticker and the report carry can't be introduced
without one of these failing.
"""

from app.routers.nongyne_cyto_report import build_nongyne_barcode_value

OPD, IPD, TYPE = "2", "3", "10"


class _Case:
    def __init__(self, vn=None, an=None):
        self.vn, self.an = vn, an


class _Report:
    def __init__(self, patient_hn="0086209", accession_no="N26-00456"):
        self.patient_hn, self.accession_no = patient_hn, accession_no


def _value(case, report=None):
    return build_nongyne_barcode_value(case, report or _Report(), OPD, IPD, TYPE)


class TestNongyneBarcodeValue:
    def test_outpatient_visit_uses_the_opd_prefix_and_vn(self):
        assert _value(_Case(vn="690807084156")) == ("210690807084156", "OPD VN: 690807084156")

    def test_inpatient_admission_uses_the_ipd_prefix_and_an(self):
        assert _value(_Case(an="690008352")) == ("310690008352", "IPD AN: 690008352")

    def test_vn_wins_when_both_are_set(self):
        value, _ = _value(_Case(vn="690807084156", an="690008352"))
        assert value == "210690807084156"

    def test_blank_strings_are_treated_as_absent(self):
        assert _value(_Case(vn="   ", an="")) == ("N26-00456", "Accession No.")

    def test_falls_back_to_the_unprefixed_accession_without_visit_data(self):
        """Pre-33a1b04 cases have NULL vn/an — their barcode must not change."""
        assert _value(_Case()) == ("N26-00456", "Accession No.")

    def test_falls_back_to_accession_when_the_report_has_no_case(self):
        """report.case_id is nullable, so the case lookup can legitimately miss."""
        assert _value(None) == ("N26-00456", "Accession No.")

    def test_falls_back_to_hn_when_even_the_accession_is_missing(self):
        assert _value(_Case(), _Report(accession_no=None)) == ("0086209", "Accession No.")
