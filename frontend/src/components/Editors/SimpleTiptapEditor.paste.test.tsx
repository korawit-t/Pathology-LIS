import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import SimpleTiptapEditor from "./SimpleTiptapEditor";
import { ThemeProvider } from "../../contexts/ThemeContext";

// Builds a realistic clipboard payload the way a real browser would when a
// user drag-selects a line inside another Tiptap editor in this app (e.g.
// gross description) and grazes the blank spacer paragraphs around it.
function copyLineWithSurroundingBlanks(sourceHtml: string, matchText: string) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const source = new Editor({ element: el, extensions: [StarterKit], content: sourceHtml });
  const { state, view } = source;
  let paraStart = -1;
  let paraEnd = -1;
  state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent.includes(matchText)) {
      paraStart = pos + 1;
      paraEnd = pos + node.nodeSize - 1;
    }
    return true;
  });
  const TextSelection = source.state.selection.constructor as unknown as {
    create: (doc: typeof state.doc, from: number, to: number) => typeof state.selection;
  };
  // A natural mouse drag typically overshoots the target line by a
  // character or two into the neighboring (blank) paragraphs, clamped to
  // the document bounds (a drag can't select past the start/end).
  const from = Math.max(1, paraStart - 2);
  const to = Math.min(state.doc.content.size - 1, paraEnd + 2);
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  const { dom, text } = view.serializeForClipboard(source.state.selection.content());
  source.destroy();
  el.remove();
  return { html: dom.innerHTML, text };
}

function firePaste(target: Element, html: string, text: string) {
  const data = new Map([
    ["text/html", html],
    ["text/plain", text],
  ]);
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => data.get(type) ?? "",
      types: Array.from(data.keys()),
      files: [],
    },
  });
  target.dispatchEvent(event);
}

describe("SimpleTiptapEditor paste sanitization", () => {
  it("strips the blank spacer paragraphs carried in from copying a mid-document line in another editor", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <SimpleTiptapEditor value="<p>Invasive ductal carcinoma.</p>" onChange={handleChange} />
      </ThemeProvider>,
    );
    const editable = container.querySelector(".ProseMirror") as HTMLElement;

    const { html, text } = copyLineWithSurroundingBlanks(
      "<p>Received in formalin, a specimen.</p><p></p><p>ขนาด 10 x 3 x 4 cm</p><p></p><p>Cut surface tan-white.</p>",
      "ขนาด",
    );
    act(() => firePaste(editable, html, text));

    const lastHtml = handleChange.mock.calls.at(-1)?.[0] as string;
    expect(lastHtml).not.toMatch(/<p>\s*<\/p>/);
    expect(lastHtml).toContain("ขนาด 10 x 3 x 4 cm");
  });

  it("still merges a verbatim inline-text paste with no surrounding blanks correctly", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <SimpleTiptapEditor value="<p></p>" onChange={handleChange} />
      </ThemeProvider>,
    );
    const editable = container.querySelector(".ProseMirror") as HTMLElement;

    const { html, text } = copyLineWithSurroundingBlanks("<p>ขนาด 10 x 3 x 4 cm</p>", "ขนาด");
    act(() => firePaste(editable, html, text));

    const lastHtml = handleChange.mock.calls.at(-1)?.[0] as string;
    expect(lastHtml).toBe("<p>ขนาด 10 x 3 x 4 cm</p>");
  });
});
