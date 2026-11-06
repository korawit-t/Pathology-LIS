import { describe, it, expect } from "vitest";
import { richTextToEditable, editableToRichText } from "./richTextField";

describe("richTextToEditable", () => {
  it("shows Tiptap HTML as plain lines without tags", () => {
    expect(richTextToEditable("<p>Breast mass</p><p>R/O <strong>CA</strong> &amp; FA</p>")).toBe(
      "Breast mass\nR/O CA & FA",
    );
  });

  it("passes plain text through exactly as stored", () => {
    expect(richTextToEditable("  Mass, size < 2 cm\nCA-125 <35  ")).toBe(
      "  Mass, size < 2 cm\nCA-125 <35  ",
    );
  });

  it("keeps null/undefined as-is", () => {
    expect(richTextToEditable(null)).toBeNull();
    expect(richTextToEditable(undefined)).toBeUndefined();
  });
});

describe("editableToRichText", () => {
  const html = "<p>Breast mass</p><p>R/O <strong>CA</strong></p>";

  it("returns the original HTML untouched when the text wasn't edited", () => {
    expect(editableToRichText(richTextToEditable(html), html)).toBe(html);
  });

  it("re-wraps edited text as one escaped <p> per line when the original was HTML", () => {
    expect(editableToRichText("Breast mass, left\nsize < 2 cm & firm", html)).toBe(
      "<p>Breast mass, left</p><p>size &lt; 2 cm &amp; firm</p>",
    );
  });

  it("lets the field be cleared", () => {
    expect(editableToRichText("", html)).toBe("");
  });

  it("leaves plain text alone when the original was plain or empty", () => {
    expect(editableToRichText("new text", "old text")).toBe("new text");
    expect(editableToRichText("new text", null)).toBe("new text");
    expect(editableToRichText(undefined, undefined)).toBeUndefined();
  });
});
