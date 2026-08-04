from app.utils.html_text import html_or_plain_text_to_lines, text_to_escaped_html_br


class TestHtmlOrPlainTextToLines:
    def test_plain_text_passes_through_unchanged(self):
        assert html_or_plain_text_to_lines("Just some prose.") == "Just some prose."

    def test_none_and_empty_return_empty_string(self):
        assert html_or_plain_text_to_lines(None) == ""
        assert html_or_plain_text_to_lines("") == ""

    def test_multiple_paragraphs_become_separate_lines(self):
        assert html_or_plain_text_to_lines("<p>A</p><p>B</p>") == "A\nB"

    def test_decodes_html_entities(self):
        assert html_or_plain_text_to_lines("<p>&amp;</p>") == "&"

    def test_leading_and_trailing_empty_paragraphs_collapse_away(self):
        assert html_or_plain_text_to_lines("<p></p><p>A</p><p></p>") == "A"

    def test_a_string_with_no_angle_bracket_is_never_treated_as_html(self):
        # No '<' anywhere -> fast path, returned verbatim (just trimmed).
        assert html_or_plain_text_to_lines("  margin > 1mm, tumor & stroma  ") == "margin > 1mm, tumor & stroma"


class TestTextToEscapedHtmlBr:
    def test_escapes_ampersand(self):
        assert text_to_escaped_html_br("a & b") == "a &amp; b"

    def test_converts_newlines_to_br(self):
        assert text_to_escaped_html_br("line1\nline2") == "line1<br/>line2"

    def test_escapes_angle_brackets(self):
        assert text_to_escaped_html_br("<script>") == "&lt;script&gt;"
