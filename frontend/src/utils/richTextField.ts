import { htmlToPlainText } from "./sanitize";

// Some case columns (surgical clinical_diagnosis, non-gyne clinical_history)
// are saved as HTML by the Tiptap editors on the gross / pathologist screens,
// but registration edits them in a plain TextArea. These helpers let that
// TextArea show the text without raw tags, and save it back without wiping
// the HTML formatting when the registrar didn't change the field.

// Only a real tag counts as HTML — clinical text like "CA-125 <35" or
// "size < 2 cm" contains "<" but is plain text.
const HTML_TAG = /<\/?[a-z][^>]*>/i;

function isHtml(text: string | null | undefined): text is string {
  return !!text && HTML_TAG.test(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Value to load into the TextArea: HTML becomes one line per paragraph;
// plain text (and null) passes through exactly as stored.
export function richTextToEditable(
  stored: string | null | undefined,
): string | null | undefined {
  return isHtml(stored) ? htmlToPlainText(stored) : stored;
}

// Value to save from the TextArea. A plain/empty original keeps the
// TextArea's plain text as before. An HTML original comes back unchanged if
// the text wasn't edited; if it was, each line is re-wrapped in <p> so the
// rich editors and the PDF keep the line breaks (bold/lists can't survive a
// plain-text edit).
export function editableToRichText(
  edited: string | null | undefined,
  original: string | null | undefined,
): string | null | undefined {
  if (!isHtml(original)) return edited;
  if (edited === richTextToEditable(original)) return original;
  if (!edited?.trim()) return edited;
  return edited
    .trim()
    .split("\n")
    .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
    .join("");
}
