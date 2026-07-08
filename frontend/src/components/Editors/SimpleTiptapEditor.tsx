import React, { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button, Space, Divider, Tooltip } from "antd";
import {
  BoldOutlined,
  ItalicOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  StrikethroughOutlined,
  UndoOutlined,
  RedoOutlined,
} from "@ant-design/icons";
import type { Editor } from "@tiptap/core";
import { useTheme } from "../../contexts/ThemeContext";

/* =======================
   Props
======================= */
interface SimpleTiptapEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean; // 🚩 เพิ่ม
  style?: React.CSSProperties; // 🚩 เพิ่ม
}

// 🚩 เพิ่ม Interface สำหรับ Ref
export interface TiptapEditorRef {
  insertText: (content: string) => void;
}

/* =======================
   Styles (typed)
======================= */
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    border: "1px solid #d9d9d9",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "#fff",
    display: "flex",
    flexDirection: "column",
  },
  toolbar: {
    padding: "8px 12px",
    borderBottom: "1px solid #f0f0f0",
    backgroundColor: "#fafafa",
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  content: {
    padding: "8px 12px",
    minHeight: "auto",
    cursor: "text",
  },
};

/* =======================
   Empty-paragraph trimming
======================= */
const EMPTY_P_SOURCE = "<p>(?:\\s|&nbsp;)*</p>";
const LEADING_EMPTY_P = new RegExp(`^(?:${EMPTY_P_SOURCE})+`, "i");
const TRAILING_EMPTY_P = new RegExp(`(?:${EMPTY_P_SOURCE})+$`, "i");

// Strips runs of empty <p></p> left behind by repeated Enter presses at the
// start/end of the content. Only edges are trimmed — blank paragraphs in the
// middle of the text are intentional formatting and are left alone.
function trimEdgeEmptyParagraphs(html: string): string {
  return html.replace(LEADING_EMPTY_P, "").replace(TRAILING_EMPTY_P, "");
}

/* =======================
   Tab Keymap Extension
======================= */
const TabKeymap = Extension.create({
  name: "tabKeymap",

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive("orderedList")) {
          return this.editor
            .chain()
            .sinkListItem("listItem")
            .toggleBulletList()
            .run();
        }
        return this.editor.commands.sinkListItem("listItem");
      },
      "Shift-Tab": () => {
        return this.editor.commands.liftListItem("listItem");
      },
    };
  },
});

/* =======================
   Component
======================= */
const SimpleTiptapEditor = forwardRef<TiptapEditorRef, SimpleTiptapEditorProps>(
  (props, ref) => {
    const {
      value,
      onChange,
      placeholder = "Enter text...",
      disabled = false,
      style,
    } = props;

    const { isDarkMode } = useTheme();

    // Tracks the HTML this editor itself last emitted via onChange, so the
    // value-sync effect below can tell "form echoed my own edit back" apart
    // from "value changed externally" — without that distinction, every
    // keystroke round-trips through Form.Item and forces a full
    // editor.getHTML() + destructive setContent() on each character typed,
    // which is what made typing feel laggy (especially with several
    // instances mounted at once, one per specimen).
    const lastEmittedHtml = useRef<string | null>(value ?? null);

    // 🚩 3. กำหนดสีตามโหมด
    const themeColors = {
      border: isDarkMode ? "#434343" : "#d9d9d9",
      toolbarBg: isDarkMode ? "#1d1d1d" : "#fafafa",
      contentBg: isDarkMode
        ? disabled
          ? "#141414"
          : "#1f1f1f"
        : disabled
          ? "#f5f5f5"
          : "#fff",
      activeBtnBg: isDarkMode ? "#111b26" : "#e6f7ff",
      activeBtnColor: isDarkMode ? "#1677ff" : "#1890ff",
      textColor: isDarkMode ? "rgba(255, 255, 255, 0.85)" : "inherit",
      placeholder: isDarkMode ? "rgba(255, 255, 255, 0.3)" : "#bfbfbf",
    };

    const editor = useEditor({
      extensions: [
        StarterKit,
        TabKeymap,
        Placeholder.configure({
          placeholder,
          emptyEditorClass: "is-editor-empty",
        }),
      ],
      content: value ?? "",
      editable: !disabled, // 🚩 ตั้งค่าเริ่มต้นตามค่า disabled
      editorProps: {
        attributes: {
          class: "prose prose-sm focus:outline-none",
          style: `min-height: ${props.style?.minHeight || "60px"}; outline: none; color: ${themeColors.textColor}; font-size: var(--editor-font-size, inherit);`,
        },
        handleKeyDown: (_view, event: KeyboardEvent) => {
          if (event.key === "Tab") {
            event.preventDefault();
          }
        },
      },
      onUpdate: ({ editor }: { editor: Editor }) => {
        const html = editor.getHTML();
        lastEmittedHtml.current = html;
        onChange?.(html);
      },
      onBlur: ({ editor }: { editor: Editor }) => {
        const html = editor.getHTML();
        const trimmed = trimEdgeEmptyParagraphs(html);
        if (trimmed !== html) {
          editor.commands.setContent(trimmed, { emitUpdate: false });
          lastEmittedHtml.current = trimmed;
          onChange?.(trimmed);
        }
      },
    });

    // 🚩 แก้ไขจุดนี้: ใช้ ref ที่ได้รับมาจาก forwardRef
    useImperativeHandle(ref, () => ({
      insertText: (content: string) => {
        if (editor) {
          // คำสั่งของ Tiptap เพื่อแทรกข้อความตรงจุดที่เคอร์เซอร์อยู่
          editor.chain().focus().insertContent(content).run();
        }
      },
    }));

    // 🚩 เพิ่ม Effect เพื่อคอย Update สถานะ Read-only เมื่อมีการเปลี่ยนค่า disabled
    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [disabled, editor]);

    useEffect(() => {
      if (!editor || value === undefined) return;
      // Skip if this is just the form echoing back what we ourselves typed —
      // avoids calling the (expensive) editor.getHTML() and resetting the
      // document / cursor position on every keystroke.
      if (value === lastEmittedHtml.current) return;
      const isSameContent = editor.getHTML() === value;
      if (!isSameContent) {
        // 🚩 สำคัญ: ต้องลบเงื่อนไข editor.getText() === '' ออกด้วย
        editor.commands.setContent(value, { emitUpdate: false });
      }
      lastEmittedHtml.current = value;
    }, [value, editor]);

    if (!editor) return null;

    return (
      <div
        style={{
          border: `1px solid ${themeColors.border}`,
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: themeColors.contentBg,
          display: "flex",
          flexDirection: "column",
          cursor: disabled ? "not-allowed" : "text",
          transition: "all 0.3s ease",
          ...style,
        }}
      >
        {!disabled && (
          <div
            style={{
              padding: "8px 12px",
              borderBottom: `1px solid ${themeColors.border}`,
              backgroundColor: themeColors.toolbarBg,
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <Space wrap>
              {/* ปุ่มต่างๆ - ปรับสี Active ตามโหมด */}
              {[
                {
                  title: "Bullet List",
                  icon: <UnorderedListOutlined />,
                  active: "bulletList",
                  action: () => editor.chain().focus().toggleBulletList().run(),
                },
                {
                  title: "Ordered List",
                  icon: <OrderedListOutlined />,
                  active: "orderedList",
                  action: () =>
                    editor.chain().focus().toggleOrderedList().run(),
                },
              ].map((item) => (
                <Tooltip title={item.title} key={item.title}>
                  <Button
                    type="text"
                    size="small"
                    icon={item.icon}
                    style={{
                      background: editor.isActive(item.active)
                        ? themeColors.activeBtnBg
                        : undefined,
                      color: editor.isActive(item.active)
                        ? themeColors.activeBtnColor
                        : isDarkMode
                          ? "rgba(255,255,255,0.65)"
                          : undefined,
                    }}
                    onClick={item.action}
                  />
                </Tooltip>
              ))}

              <Divider
                type="vertical"
                style={{ borderColor: themeColors.border }}
              />

              {[
                {
                  title: "Bold",
                  icon: <BoldOutlined />,
                  active: "bold",
                  action: () => editor.chain().focus().toggleBold().run(),
                },
                {
                  title: "Italic",
                  icon: <ItalicOutlined />,
                  active: "italic",
                  action: () => editor.chain().focus().toggleItalic().run(),
                },
                {
                  title: "Strike",
                  icon: <StrikethroughOutlined />,
                  active: "strike",
                  action: () => editor.chain().focus().toggleStrike().run(),
                },
              ].map((item) => (
                <Tooltip title={item.title} key={item.title}>
                  <Button
                    type="text"
                    size="small"
                    icon={item.icon}
                    style={{
                      background: editor.isActive(item.active)
                        ? themeColors.activeBtnBg
                        : undefined,
                      color: editor.isActive(item.active)
                        ? themeColors.activeBtnColor
                        : isDarkMode
                          ? "rgba(255,255,255,0.65)"
                          : undefined,
                    }}
                    onClick={item.action}
                  />
                </Tooltip>
              ))}

              <Divider
                type="vertical"
                style={{ borderColor: themeColors.border }}
              />

              <Tooltip title="Undo">
                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={!editor.can().undo()}
                  onClick={() => editor.chain().focus().undo().run()}
                  style={{
                    color:
                      isDarkMode && editor.can().undo()
                        ? "rgba(255,255,255,0.65)"
                        : undefined,
                  }}
                />
              </Tooltip>

              <Tooltip title="Redo">
                <Button
                  type="text"
                  size="small"
                  icon={<RedoOutlined />}
                  disabled={!editor.can().redo()}
                  onClick={() => editor.chain().focus().redo().run()}
                  style={{
                    color:
                      isDarkMode && editor.can().redo()
                        ? "rgba(255,255,255,0.65)"
                        : undefined,
                  }}
                />
              </Tooltip>
            </Space>
          </div>
        )}

        <div
          style={{
            padding: "8px 12px",
            flex: 1, // 🚩 สั่งให้พื้นที่พิมพ์ยืดจนเต็ม
            display: "flex",
            flexDirection: "column",
          }}
          onClick={() => editor.chain().focus().run()}
        >
          <EditorContent
            editor={editor}
            style={{ flex: 1, display: "flex", flexDirection: "column" }} // 🚩 บังคับ EditorContent ให้ยืดด้วย
          />
        </div>

        <style>{`
          /* 🚩 บังคับให้พื้นที่พิมพ์ด้านในสุดยืดเต็มความสูงเป้าหมาย */
          .tiptap.ProseMirror {
            flex: 1;
            outline: none;
          }
          .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            color: ${themeColors.placeholder};
            pointer-events: none;
            height: 0;
            float: left;
          }
          .ProseMirror ul { list-style-type: disc; padding-left: 1.5em; color: ${themeColors.textColor}; }
          .ProseMirror ol { list-style-type: decimal; padding-left: 1.5em; color: ${themeColors.textColor}; }
          .ProseMirror p { margin-bottom: 0.5em; color: ${themeColors.textColor}; }
        `}</style>
      </div>
    );
  },
);

export default SimpleTiptapEditor;
