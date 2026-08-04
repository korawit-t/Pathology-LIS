import html as html_module
from html.parser import HTMLParser

_BLOCK_TAGS = {"p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6"}


class _BlockAwareHTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data):
        self._parts.append(data)


def html_or_plain_text_to_lines(raw: str | None) -> str:
    """Normalize a value that may be either already-plain text or legacy
    Tiptap/ProseMirror HTML into plain text with real '\\n' line breaks,
    decoded of HTML entities. No-op on genuinely plain text (fast path keyed
    on the absence of '<'), so callers don't need to track which format a
    given record happens to be in.
    """
    if not raw:
        return ""
    if "<" not in raw:
        return raw.strip()
    stripper = _BlockAwareHTMLStripper()
    stripper.feed(raw)
    text = html_module.unescape("".join(stripper._parts))
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines)


def text_to_escaped_html_br(text: str) -> str:
    """Escape a plain-text string for safe interpolation into a `| safe`
    Jinja2/WeasyPrint HTML context, converting real line breaks to <br/>.
    """
    return html_module.escape(text, quote=False).replace("\n", "<br/>")
