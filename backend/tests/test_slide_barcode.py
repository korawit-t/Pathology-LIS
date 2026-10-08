"""Tests for app/utils/slide_barcode.py — the single owner of what a slide
sticker's QR holds. Printing is deliberately strict (one form) and scanning
deliberately liberal (every form a sticker in the drawers could carry)."""

from app.utils.slide_barcode import (
    KIND_GYNE,
    KIND_SURGICAL,
    legacy_slide_qr_payload,
    pad_block_code,
    slide_label_code,
    slide_scan_codes,
)


class TestPadBlockCode:
    def test_pads_a_single_digit(self):
        assert pad_block_code("A1") == "A01"

    def test_leaves_two_digits_alone(self):
        assert pad_block_code("A11") == "A11"

    def test_returns_anything_it_cannot_parse_unchanged(self):
        # Cytology stickers pass "#2" here, and it must survive untouched.
        assert pad_block_code("#2") == "#2"
        assert pad_block_code("") == ""


class TestSlideLabelCode:
    def test_namespaces_the_id_when_a_lab_code_is_set(self):
        assert slide_label_code(KIND_SURGICAL, 48215, "BKK01") == "BKK01-SBS-48215"

    def test_prints_the_bare_id_without_a_lab_code(self):
        assert slide_label_code(KIND_SURGICAL, 48215) == "SBS-48215"
        assert slide_label_code(KIND_SURGICAL, 48215, "") == "SBS-48215"
        assert slide_label_code(KIND_SURGICAL, 48215, "   ") == "SBS-48215"

    def test_the_kind_distinguishes_the_table_the_id_belongs_to(self):
        # Ids collide across case types; the prefix is what resolves them.
        assert slide_label_code(KIND_SURGICAL, 7) != slide_label_code(KIND_GYNE, 7)

    def test_stays_inside_qr_version_1(self):
        """21x21 modules is 0.37mm each on the 2cm sticker. A longer payload
        prints denser for no gain, which is the whole reason the QR carries an
        id instead of the readable label."""
        from reportlab.graphics.barcode.qr import QrCodeWidget

        widget = QrCodeWidget(slide_label_code(KIND_SURGICAL, 999999, "BKK01"))
        widget.draw()
        assert len(widget.qr.modules) == 21


class TestSlideScanCodes:
    def test_accepts_the_namespaced_code_it_prints(self):
        codes = slide_scan_codes(KIND_SURGICAL, 48215, lab_code="BKK01")
        assert codes[0] == "BKK01-SBS-48215"

    def test_accepts_the_bare_id_even_when_namespaced(self):
        # Renaming the lab must not orphan the stickers already printed.
        codes = slide_scan_codes(KIND_SURGICAL, 48215, lab_code="BKK01")
        assert "SBS-48215" in codes

    def test_accepts_the_accession_block_composite_padded_and_unpadded(self):
        codes = slide_scan_codes(
            KIND_SURGICAL,
            48215,
            legacy_accession_no="S26-00123",
            legacy_block_code="A1",
        )
        assert "S26-00123A01" in codes  # what the sticker printer padded to
        assert "S26-00123A1" in codes  # what older stickers went out with

    def test_a_cytology_slides_legacy_code_uses_its_slide_number(self):
        codes = slide_scan_codes(
            KIND_GYNE, 991, legacy_accession_no="C26-00045", legacy_block_code="#1"
        )
        assert legacy_slide_qr_payload("C26-00045", "#1") in codes

    def test_omits_the_legacy_form_when_there_is_no_accession(self):
        assert slide_scan_codes(KIND_SURGICAL, 1) == ["SBS-1"]

    def test_never_repeats_a_code(self):
        # An unpadded block code already two digits wide collapses onto the
        # padded one, and a blank lab_code onto the bare id.
        codes = slide_scan_codes(
            KIND_SURGICAL,
            1,
            lab_code="",
            legacy_accession_no="S26-00123",
            legacy_block_code="A11",
        )
        assert len(codes) == len(set(codes))
