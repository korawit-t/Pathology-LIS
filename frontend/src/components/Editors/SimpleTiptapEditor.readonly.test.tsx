import React, { useRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import SimpleTiptapEditor, { type TiptapEditorRef } from "./SimpleTiptapEditor";
import { ThemeProvider } from "../../contexts/ThemeContext";

// A "disabled" editor used to be set to contenteditable="false", which made
// it unfocusable by click in every browser — clicking it left focus on
// <body>, so Ctrl/Cmd+A fell back to selecting the entire page instead of
// just the field, and copying that anywhere dumped unrelated page content in
// as extra lines. Confirmed against real Chromium (Playwright) before this
// fix; jsdom can't replicate real click-to-focus/selection browser quirks,
// so these tests instead pin the two things that actually make the browser
// behavior possible: contenteditable stays "true" while disabled, and edits
// are still blocked via the transaction-level guard instead.
describe("SimpleTiptapEditor read-only (disabled) behavior", () => {
  it("keeps contenteditable=true while disabled, so the field stays focusable/selectable", () => {
    const { container } = render(
      <ThemeProvider>
        <SimpleTiptapEditor value="<p>Locked gross description text.</p>" disabled />
      </ThemeProvider>,
    );
    const editable = container.querySelector(".ProseMirror") as HTMLElement;
    expect(editable.getAttribute("contenteditable")).toBe("true");
  });

  it("blocks content-changing edits while disabled, even via the imperative insertText ref", () => {
    const handleChange = vi.fn();
    function Harness() {
      const ref = useRef<TiptapEditorRef>(null);
      return (
        <ThemeProvider>
          <SimpleTiptapEditor
            ref={ref}
            value="<p>Locked gross description text.</p>"
            disabled
            onChange={handleChange}
          />
          <button onClick={() => ref.current?.insertText("HACKED")}>inject</button>
        </ThemeProvider>
      );
    }
    const { container, getByText } = render(<Harness />);
    act(() => getByText("inject").click());

    const editable = container.querySelector(".ProseMirror") as HTMLElement;
    expect(editable.textContent).not.toContain("HACKED");
    expect(editable.textContent).toContain("Locked gross description text.");
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("still allows edits through the same imperative ref when not disabled", () => {
    const handleChange = vi.fn();
    function Harness() {
      const ref = useRef<TiptapEditorRef>(null);
      return (
        <ThemeProvider>
          <SimpleTiptapEditor ref={ref} value="<p>Editable text.</p>" onChange={handleChange} />
          <button onClick={() => ref.current?.insertText("added")}>inject</button>
        </ThemeProvider>
      );
    }
    const { getByText } = render(<Harness />);
    act(() => getByText("inject").click());

    expect(handleChange).toHaveBeenCalled();
    const lastHtml = handleChange.mock.calls.at(-1)?.[0] as string;
    expect(lastHtml).toContain("added");
  });
});
