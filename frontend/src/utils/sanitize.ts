import DOMPurify from "dompurify";

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
