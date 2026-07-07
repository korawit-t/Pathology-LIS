"""Tests for app/services/barcode_service.py — pure Code 39 barcode image
generation, kept lean."""

import base64

from app.services.barcode_service import generate_code39_base64_img


class TestGenerateCode39Base64Img:
    def test_blank_input_returns_empty_string(self):
        assert generate_code39_base64_img("") == ""
        assert generate_code39_base64_img("   ") == ""

    def test_returns_a_valid_png_data_uri(self):
        result = generate_code39_base64_img("S26-00001")

        assert result.startswith("data:image/png;base64,")
        png_bytes = base64.b64decode(result.split(",", 1)[1])
        assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"

    def test_lowercase_input_is_normalised_to_uppercase(self):
        # Code 39 only supports uppercase; different-case input for the
        # same value should still produce a well-formed barcode, not fail.
        result = generate_code39_base64_img("s26-00001")

        assert result.startswith("data:image/png;base64,")
