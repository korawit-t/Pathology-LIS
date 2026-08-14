"""
HOSxP lab_head.vn carries either an OPD visit number or an inpatient admission
number, and HOSxPAdapter._map_row tells them apart by length. That rule was
inverted, so every OUTPATIENT case stored its VN in `an`; _build_barcode_value
then stamped the IPD prefix onto it and HOSxP could not resolve the barcode.
Inpatients were unaffected, which is why it went unnoticed.

Lengths verified against the live HOSxP database:
    SELECT LENGTH(vn), COUNT(*) FROM vn_stat GROUP BY 1;  -> 12: 5,124,506  (11: 5)
    SELECT LENGTH(an), COUNT(*) FROM an_stat GROUP BY 1;  ->  9:   331,364
"""

import pytest

from app.his_adapters.hosxp import HOSxPAdapter
from app.routers.surgical_report import _build_barcode_value


def _row(raw: str) -> dict:
    # the SQL aliases lab_head.vn AS an, so both kinds arrive under "an"
    return {"an": raw, "hn": "0086209"}


class TestVnAnSplit:
    def test_twelve_digit_value_is_a_vn(self):
        r = HOSxPAdapter._map_row(_row("690807084156"))
        assert r.vn == "690807084156"
        assert r.an == ""

    def test_nine_digit_value_is_an_an(self):
        r = HOSxPAdapter._map_row(_row("690008352"))
        assert r.an == "690008352"
        assert r.vn == ""

    def test_eleven_digit_legacy_value_is_still_a_vn(self):
        """vn_stat has a handful of 11-digit rows; they belong on the VN side."""
        r = HOSxPAdapter._map_row(_row("69080708415"))
        assert r.vn == "69080708415"
        assert r.an == ""

    def test_blank_value_yields_neither(self):
        r = HOSxPAdapter._map_row(_row(""))
        assert not r.an
        assert not r.vn

    def test_whitespace_is_stripped(self):
        r = HOSxPAdapter._map_row(_row("  690807084156  "))
        assert r.vn == "690807084156"


class _Case:
    def __init__(self, vn="", an="", accession_no="S26-02047"):
        self.vn, self.an, self.accession_no = vn, an, accession_no


class _Setting:
    barcode_opd_prefix = "2"
    barcode_ipd_prefix = "3"


class TestBarcodeValueFollowsTheSplit:
    """End-to-end consequence: the split decides which prefix the barcode gets."""

    def test_outpatient_visit_gets_the_opd_prefix(self):
        mapped = HOSxPAdapter._map_row(_row("690807084156"))
        value, label = _build_barcode_value(
            _Case(vn=mapped.vn, an=mapped.an), _Setting(), "08"
        )
        assert value == "208690807084156"
        assert label.startswith("OPD VN")

    def test_inpatient_admission_gets_the_ipd_prefix(self):
        """The value from the known-good barcode.pdf, which HOSxP read fine."""
        mapped = HOSxPAdapter._map_row(_row("690008352"))
        value, label = _build_barcode_value(
            _Case(vn=mapped.vn, an=mapped.an), _Setting(), "08"
        )
        assert value == "308690008352"
        assert label.startswith("IPD AN")

    def test_falls_back_to_accession_when_neither_is_present(self):
        value, label = _build_barcode_value(_Case(), _Setting(), "08")
        assert value == "S26-02047"
        assert label == "Accession No."
