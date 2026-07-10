"""Tests for app/services/barcode_service.py — pure Code 39 barcode image
generation, kept lean."""

import base64

from app.services.barcode_service import generate_code39_base64_img


class TestGenerateCode39Base64Img:
    def test_blank_input_returns_empty_string_and_zero_size(self):
        assert generate_code39_base64_img("") == ("", 0.0, 0.0)
        assert generate_code39_base64_img("   ") == ("", 0.0, 0.0)

    def test_returns_a_valid_svg_data_uri_with_true_physical_size(self):
        # Rendered as vector SVG rects (not a raster PNG) so bar edges are
        # never softened by image scaling/interpolation - matching how the
        # old system's mPDF <barcode> tag drew it natively as vectors too.
        data_uri, width_mm, height_mm = generate_code39_base64_img("S26-00001")

        assert data_uri.startswith("data:image/svg+xml;base64,")
        svg_text = base64.b64decode(data_uri.split(",", 1)[1]).decode("utf-8")
        assert svg_text.startswith("<?xml")
        assert "<rect" in svg_text
        # width/height must be real, positive mm sizes so callers can render
        # the barcode at its calibrated, scanner-safe physical size.
        assert width_mm > 0
        assert height_mm > 0

    def test_lowercase_input_is_normalised_to_uppercase(self):
        # Code 39 only supports uppercase; different-case input for the
        # same value should still produce a well-formed barcode, not fail.
        data_uri, _, _ = generate_code39_base64_img("s26-00001")

        assert data_uri.startswith("data:image/svg+xml;base64,")

    def test_longer_value_produces_wider_image_at_fixed_module_width(self):
        # The physical width must scale with barcode value length so a long
        # VN/AN doesn't silently get compressed below the calibrated X-dimension.
        _, short_width_mm, short_height_mm = generate_code39_base64_img("208312345")
        _, long_width_mm, long_height_mm = generate_code39_base64_img("208312345678901")

        assert long_width_mm > short_width_mm
        assert long_height_mm == short_height_mm
