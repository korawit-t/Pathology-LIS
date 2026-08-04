import { describe, it, expect } from "vitest";
import { htmlToPlainText } from "./sanitize";

describe("htmlToPlainText", () => {
  it("passes plain text through unchanged (trimmed)", () => {
    expect(htmlToPlainText("  Just some prose.  ")).toBe("Just some prose.");
  });

  it("returns empty string for null/undefined/empty input", () => {
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
    expect(htmlToPlainText("")).toBe("");
  });

  it("converts multiple legacy paragraphs into separate lines", () => {
    expect(htmlToPlainText("<p>Line one</p><p>Line two</p>")).toBe("Line one\nLine two");
  });

  it("decodes HTML entities instead of leaving them markup-encoded", () => {
    expect(htmlToPlainText("<p>A &amp; B</p>")).toBe("A & B");
  });

  it("degrades a legacy list to one item per line", () => {
    expect(htmlToPlainText("<ul><li>First</li><li>Second</li></ul>")).toBe("First\nSecond");
  });

  it("converts <br> to a line break", () => {
    expect(htmlToPlainText("<p>Line one<br>Line two</p>")).toBe("Line one\nLine two");
  });

  it("drops leading/trailing/duplicate blank lines from legacy artifacts", () => {
    expect(htmlToPlainText("<p></p><p>Content</p><p></p>")).toBe("Content");
  });
});
