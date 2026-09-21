import { describe, it, expect, vi } from "vitest";
import { render, act, fireEvent, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "prosemirror-state";
import SimpleTiptapEditor from "./SimpleTiptapEditor";
import { ThemeProvider } from "../../contexts/ThemeContext";

// Tiptap hangs the Editor instance off its root DOM node.
const getEditor = (container: HTMLElement) =>
  (container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor }).editor;

const renderEditor = (value: string, onChange = vi.fn()) => {
  const utils = render(
    <ThemeProvider>
      <SimpleTiptapEditor value={value} onChange={onChange} />
    </ThemeProvider>,
  );
  return { ...utils, editor: getEditor(utils.container), onChange };
};

// Put the caret inside the paragraph whose text is `text`.
const placeCaretIn = (editor: Editor, text: string) => {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.isTextblock && node.textContent === text) pos = p + 1;
  });
  if (pos === -1) throw new Error(`no paragraph "${text}"`);
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    );
  });
};

// What a real toolbar click does in the browser: the button takes focus on
// mousedown (blurring the editor), then the click runs the command.
const clickToolbar = (editor: Editor, title: string) => {
  const button = screen.getByRole("img", { name: new RegExp(title.replace(" ", "-"), "i") })
    .closest("button") as HTMLButtonElement;
  const mouseDown = fireEvent.mouseDown(button);
  // fireEvent returns false when the handler called preventDefault — i.e. the
  // browser would *not* move focus off the editor.
  if (mouseDown) act(() => { editor.view.dom.dispatchEvent(new FocusEvent("blur")); });
  fireEvent.click(button);
};

describe("SimpleTiptapEditor toolbar keeps the caret where the user put it", () => {
  // Text of every paragraph that sits inside a bullet list.
  const bulleted = (editor: Editor) => {
    const out: string[] = [];
    editor.state.doc.descendants((node, _pos, parent) => {
      if (node.type.name === "paragraph" && parent?.type.name === "listItem") out.push(node.textContent);
    });
    return out;
  };

  it.each([
    ["ends", "<p>first line</p><p>second line</p><p></p>"],
    ["starts", "<p></p><p>first line</p><p>second line</p>"],
  ])("bullets the clicked line when the text %s with a blank line", (_edge, html) => {
    const { editor } = renderEditor(html);
    placeCaretIn(editor, "first line");

    clickToolbar(editor, "unordered list");

    expect(bulleted(editor)).toEqual(["first line"]);
  });

  it("bullets the clicked line even after the editor blurred in between", () => {
    const { editor } = renderEditor("<p></p><p>first line</p><p>second line</p><p></p>");
    placeCaretIn(editor, "first line");
    // e.g. the user clicked elsewhere on the page before reaching the toolbar
    act(() => { editor.view.dom.dispatchEvent(new FocusEvent("blur")); });

    clickToolbar(editor, "unordered list");

    expect(bulleted(editor)).toEqual(["first line"]);
    expect(editor.getHTML()).toBe("<ul><li><p>first line</p></li></ul><p>second line</p>");
  });

  it("does not steal focus from the editor on toolbar mousedown", () => {
    renderEditor("<p>text</p>");
    const button = screen.getByRole("img", { name: /bold/i }).closest("button")!;
    // false = preventDefault was called, so focus stays in the editor
    expect(fireEvent.mouseDown(button)).toBe(false);
  });
});

describe("SimpleTiptapEditor blur trimming", () => {
  it("still trims blank edge lines on a real blur, keeping the caret on its line", () => {
    const { editor, onChange } = renderEditor("<p></p><p>first line</p><p>second line</p><p></p>");
    placeCaretIn(editor, "first line");

    act(() => { editor.view.dom.dispatchEvent(new FocusEvent("blur")); });

    expect(editor.getHTML()).toBe("<p>first line</p><p>second line</p>");
    expect(onChange).toHaveBeenLastCalledWith("<p>first line</p><p>second line</p>");
    expect(editor.state.selection.$from.parent.textContent).toBe("first line");
  });

  it("emits an empty string for an editor left blank, as before", () => {
    const { editor, onChange } = renderEditor("<p>x</p>");
    act(() => { editor.commands.setContent("<p></p><p></p>"); });

    act(() => { editor.view.dom.dispatchEvent(new FocusEvent("blur")); });

    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("leaves text without blank edges alone on blur", () => {
    const { editor, onChange } = renderEditor("<p>a</p><p></p><p>b</p>");
    act(() => { editor.view.dom.dispatchEvent(new FocusEvent("blur")); });

    expect(editor.getHTML()).toBe("<p>a</p><p></p><p>b</p>");
    expect(onChange).not.toHaveBeenCalled();
  });
});
