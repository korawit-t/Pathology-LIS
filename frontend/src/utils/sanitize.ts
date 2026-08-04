import DOMPurify from "dompurify";

// Parser-based tag stripping for plain-text contexts (CSV export cells,
// etc.) — unlike a `.replace(/<[^>]+>/g, "")` regex, DOMPurify parses the
// markup properly so malformed/nested tags can't leave residual `<script`
// fragments behind (CodeQL: incomplete multi-character sanitization).
export function stripHtmlToText(html: string | null | undefined): string {
  return DOMPurify.sanitize(html || "", { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

export function sanitizeHtml(html: string | null | undefined): string {
  return DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS: [
      "p", "br", "b", "strong", "i", "em", "u", "s", "del",
      "ul", "ol", "li", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tr", "th", "td", "blockquote", "pre", "code",
    ],
    ALLOWED_ATTR: ["style", "class"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "href", "src"],
  });
}

// Converts either legacy Tiptap/ProseMirror HTML or already-plain text (the
// current save format for SurgicalSpecimen.gross_description — no DB
// migration means both shapes exist forever) into readable, decoded plain
// text with paragraph/line breaks preserved as real '\n' characters, for
// display via `white-space: pre-wrap` instead of dangerouslySetInnerHTML.
// stripHtmlToText() alone isn't enough here for two reasons:
//  1. DOMPurify unwraps disallowed tags without inserting anything in their
//     place, so "<p>A</p><p>B</p>" collapses to "AB", not "A\nB" — multi-
//     paragraph/list legacy content runs onto one line with no separator.
//  2. stripHtmlToText()'s return value is still markup-serialized (entities
//     like "&amp;" are NOT decoded back to "&"), because DOMPurify.sanitize()
//     always returns a string safe for innerHTML re-injection — correct for
//     its existing callers, but wrong here since this value is rendered as
//     literal JSX text, not via dangerouslySetInnerHTML.
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  if (!html.includes("<")) return html.trim(); // already-plain text: nothing to do

  const withBreaks = html
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const stripped = stripHtmlToText(withBreaks);
  const decoded = decodeHtmlEntities(stripped);

  return decoded
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// Safely decodes HTML entities (e.g. "&amp;" -> "&") without any script/
// handler execution risk. <textarea>'s content model is RCDATA per the HTML
// spec: setting .innerHTML on it decodes character references but never
// parses embedded markup into real elements (unlike a <div>), so this can't
// be used to smuggle in an XSS payload even for untrusted input.
function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}
