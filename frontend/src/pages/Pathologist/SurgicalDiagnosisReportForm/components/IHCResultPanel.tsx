import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  Popover,
  Radio,
  Space,
  Divider,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { FormInstance } from "antd";
import {
  ExperimentOutlined,
  HolderOutlined,
  InsertRowBelowOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IHCMarkerWithResult,
  IHCResultUpsert,
  IHCService,
} from "../../../../services/ihcService";
import { useAuth } from "../../../../hooks/useAuth";
import UserService from "../../../../services/userService";

const { Text } = Typography;

const DEFAULT_PREFIX = "Immunohistochemical staining reveals:";

interface IHCResultPanelProps {
  form: FormInstance;
  specimenId: number;
  isLocked: boolean;
}

function generateIHCHtml(
  panel: IHCMarkerWithResult[],
  prefix: string,
  lineFormat: "bullet" | "plain"
): string {
  const items = panel
    .filter((item) => item.result)
    .map((item) => {
      const result = item.result!;
      const parts: string[] = [];
      if (result.selected_option) {
        const opt = item.options.find(
          (o) => o.option_value === result.selected_option
        );
        parts.push(opt ? opt.option_label : result.selected_option);
      }
      if (result.numeric_value != null) {
        const opt = item.options.find((o) => o.numeric_unit);
        const unit = opt?.numeric_unit ?? "";
        parts.push(`${result.numeric_value}${unit}`);
      }
      [...item.extra_fields]
        .sort((a, b) => a.display_order - b.display_order)
        .forEach((ef) => {
          if (!ef.value) return;
          if (ef.field_type === "select") {
            const opt = ef.options.find((o) => o.option_value === ef.value);
            parts.push(opt ? opt.option_label : ef.value!);
          } else if (ef.field_type === "numeric") {
            parts.push(`${ef.value}${ef.numeric_unit ?? ""}`);
          } else {
            parts.push(ef.value!);
          }
        });
      if (result.note) parts.push(`(${result.note})`);
      return parts.length
        ? { marker: item.marker_name, value: parts.join(", ") }
        : null;
    })
    .filter(Boolean) as { marker: string; value: string }[];

  if (!items.length) return "";

  const prefixHtml = prefix ? `<p>${prefix}</p>` : "";

  if (lineFormat === "bullet") {
    const lis = items
      .map((i) => `<li>${i.marker}: ${i.value}</li>`)
      .join("");
    return `${prefixHtml}<ul>${lis}</ul>`;
  }
  const line = items
    .map((i) => `${i.marker}: ${i.value}`)
    .join(", ");
  return `${prefixHtml}<p>${line}</p>`;
}

const PREVIEW_SAMPLE = [
  { marker: "ER", value: "Positive (90%)" },
  { marker: "PR", value: "Negative" },
];

function buildPreviewHtml(prefix: string, lineFormat: "bullet" | "plain"): string {
  const prefixHtml = prefix ? `<p>${prefix}</p>` : "";
  if (lineFormat === "bullet") {
    const lis = PREVIEW_SAMPLE
      .map((i) => `<li>${i.marker}: ${i.value}</li>`)
      .join("");
    return `${prefixHtml}<ul>${lis}</ul>`;
  }
  const line = PREVIEW_SAMPLE
    .map((i) => `${i.marker}: ${i.value}`)
    .join(", ");
  return `${prefixHtml}<p>${line}</p>`;
}

// ── Sortable row ──────────────────────────────────────────────────────────────

interface SortableMarkerRowProps {
  item: IHCMarkerWithResult;
  isLocked: boolean;
  saving: boolean;
  onOptionClick: (apTestId: number, value: string) => void;
  onNumericChange: (apTestId: number, value: string) => void;
  extraSaving: Record<string, boolean>;
  onExtraFieldOptionClick: (apTestId: number, fieldId: number, value: string) => void;
  onExtraFieldTextChange: (apTestId: number, fieldId: number, value: string) => void;
}

const SortableMarkerRow: React.FC<SortableMarkerRowProps> = ({
  item,
  isLocked,
  saving,
  onOptionClick,
  onNumericChange,
  extraSaving,
  onExtraFieldOptionClick,
  onExtraFieldTextChange,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.ap_test_id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    padding: "6px 10px",
    background: item.result?.selected_option ? "#f9f0ff" : "#fafafa",
    borderRadius: 6,
    border: `1px solid ${item.result?.selected_option ? "#d3adf7" : "#f0f0f0"}`,
    cursor: "default",
  };

  const selectedValue = item.result?.selected_option ?? null;
  const numericValue = item.result?.numeric_value ?? null;
  const selectedOpt = item.options.find((o) => o.option_value === selectedValue);
  const showNumeric = selectedOpt?.has_numeric && !isLocked;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      {!isLocked && (
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", color: "#bfbfbf", flexShrink: 0, lineHeight: 1 }}
        >
          <HolderOutlined />
        </span>
      )}

      <Text style={{ minWidth: 120, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
        {item.marker_name}
      </Text>

      <Space size={4} wrap>
        {item.options.map((opt) => {
          const isSelected = selectedValue === opt.option_value;
          return (
            <Tag
              key={opt.option_value}
              color={isSelected ? "purple" : "default"}
              style={{
                cursor: isLocked ? "default" : "pointer",
                fontWeight: isSelected ? 600 : 400,
                borderStyle: isSelected ? "solid" : "dashed",
                userSelect: "none",
              }}
              onClick={() => {
                if (!isLocked) onOptionClick(item.ap_test_id, opt.option_value);
              }}
            >
              {opt.option_label}
            </Tag>
          );
        })}
      </Space>

      {showNumeric && (
        <Input
          size="small"
          defaultValue={numericValue ?? ""}
          placeholder={selectedOpt?.numeric_unit ? `e.g. 31-40${selectedOpt.numeric_unit}` : "value"}
          suffix={selectedOpt?.numeric_unit ?? ""}
          style={{ width: 130 }}
          onChange={(e) => onNumericChange(item.ap_test_id, e.target.value)}
          disabled={isLocked}
        />
      )}

      {saving && <Spin size="small" />}

      {[...item.extra_fields]
        .sort((a, b) => a.display_order - b.display_order)
        .map((ef) => {
          const key = `${item.ap_test_id}-${ef.id}`;
          return (
            <React.Fragment key={ef.id}>
              <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                {ef.label}:
              </Text>
              {ef.field_type === "select" && (
                <Space size={4} wrap>
                  {ef.options.map((opt) => {
                    const isSelected = ef.value === opt.option_value;
                    return (
                      <Tag
                        key={opt.option_value}
                        color={isSelected ? "geekblue" : "default"}
                        style={{
                          cursor: isLocked ? "default" : "pointer",
                          fontWeight: isSelected ? 600 : 400,
                          borderStyle: isSelected ? "solid" : "dashed",
                          userSelect: "none",
                        }}
                        onClick={() => {
                          if (!isLocked) onExtraFieldOptionClick(item.ap_test_id, ef.id, opt.option_value);
                        }}
                      >
                        {opt.option_label}
                      </Tag>
                    );
                  })}
                </Space>
              )}
              {ef.field_type === "numeric" && (
                <Input
                  size="small"
                  defaultValue={ef.value ?? ""}
                  placeholder={ef.numeric_unit ? `e.g. 31-40${ef.numeric_unit}` : "value"}
                  suffix={ef.numeric_unit ?? ""}
                  style={{ width: 130 }}
                  onChange={(e) => onExtraFieldTextChange(item.ap_test_id, ef.id, e.target.value)}
                  disabled={isLocked}
                />
              )}
              {ef.field_type === "text" && (
                <Input
                  size="small"
                  defaultValue={ef.value ?? ""}
                  style={{ width: 160 }}
                  onChange={(e) => onExtraFieldTextChange(item.ap_test_id, ef.id, e.target.value)}
                  disabled={isLocked}
                />
              )}
              {extraSaving[key] && <Spin size="small" />}
            </React.Fragment>
          );
        })}
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────

const IHCResultPanel: React.FC<IHCResultPanelProps> = ({
  form,
  specimenId,
  isLocked,
}) => {
  const { user, updateUser } = useAuth();
  const [panel, setPanel] = useState<IHCMarkerWithResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [extraSaving, setExtraSaving] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm] = Form.useForm();
  const watchedPrefix = Form.useWatch("prefix", settingsForm);
  const watchedLineFormat = Form.useWatch("line_format", settingsForm) as
    | "bullet"
    | "plain"
    | undefined;
  const numericTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const extraFieldTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveOrderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPrefix = user?.preferences?.ihc_text_prefix ?? DEFAULT_PREFIX;
  const currentLineFormat =
    (user?.preferences?.ihc_line_format as "bullet" | "plain") ?? "bullet";
  const savedOrder: number[] = user?.preferences?.ihc_marker_order ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const applyOrder = useCallback(
    (items: IHCMarkerWithResult[], order: number[]): IHCMarkerWithResult[] => {
      if (!order.length) return items;
      const ordered = order
        .map((id) => items.find((i) => i.ap_test_id === id))
        .filter(Boolean) as IHCMarkerWithResult[];
      const rest = items.filter((i) => !order.includes(i.ap_test_id));
      return [...ordered, ...rest];
    },
    []
  );

  const fetchPanel = useCallback(async () => {
    try {
      const data = await IHCService.getPanel(specimenId);
      setPanel(applyOrder(data, savedOrder));
      // Auto-mark pending when IHC markers exist but none have results yet
      if (data.length > 0 && data.every((m) => !m.result) && !form.getFieldValue("is_pending")) {
        form.setFieldsValue({
          is_pending: true,
          pending_reason: form.getFieldValue("pending_reason") || "Waiting for IHC results",
        });
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimenId]);

  useEffect(() => {
    fetchPanel();
  }, [fetchPanel]);

  const persistOrder = (newOrder: number[]) => {
    if (saveOrderTimer.current) clearTimeout(saveOrderTimer.current);
    saveOrderTimer.current = setTimeout(async () => {
      try {
        await UserService.updateMyPreferences({ ihc_marker_order: newOrder });
        if (user) {
          const updatedUser = {
            ...user,
            preferences: { ...user.preferences, ihc_marker_order: newOrder },
          };
          updateUser(updatedUser);
          localStorage.setItem("user", JSON.stringify(updatedUser));
        }
      } catch {
        // non-critical — silently ignore
      }
    }, 800);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPanel((prev) => {
      const oldIndex = prev.findIndex((i) => i.ap_test_id === active.id);
      const newIndex = prev.findIndex((i) => i.ap_test_id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      persistOrder(reordered.map((i) => i.ap_test_id));
      return reordered;
    });
  };

  const save = async (apTestId: number, patch: Partial<IHCResultUpsert>) => {
    setSaving((s) => ({ ...s, [apTestId]: true }));
    try {
      const current = panel.find((p) => p.ap_test_id === apTestId);
      const payload: IHCResultUpsert = {
        surgical_specimen_id: specimenId,
        ap_test_id: apTestId,
        selected_option: current?.result?.selected_option ?? null,
        numeric_value: current?.result?.numeric_value ?? null,
        note: current?.result?.note ?? null,
        ...patch,
      };
      const saved = await IHCService.upsertResult(payload);
      setPanel((prev) =>
        prev.map((item) =>
          item.ap_test_id === apTestId ? { ...item, result: saved } : item
        )
      );
    } catch {
      message.error("Failed to save IHC result");
    } finally {
      setSaving((s) => ({ ...s, [apTestId]: false }));
    }
  };

  const handleOptionClick = (apTestId: number, value: string) => {
    const current = panel.find((p) => p.ap_test_id === apTestId);
    const newValue = current?.result?.selected_option === value ? null : value;
    save(apTestId, { selected_option: newValue });
  };

  const handleNumericChange = (apTestId: number, value: string) => {
    clearTimeout(numericTimers.current[apTestId]);
    numericTimers.current[apTestId] = setTimeout(() => {
      save(apTestId, { numeric_value: value || null });
    }, 600);
  };

  const saveExtraValue = async (apTestId: number, fieldId: number, value: string | null) => {
    const key = `${apTestId}-${fieldId}`;
    setExtraSaving((s) => ({ ...s, [key]: true }));
    try {
      await IHCService.upsertExtraValue({
        surgical_specimen_id: specimenId,
        field_id: fieldId,
        value,
      });
      setPanel((prev) =>
        prev.map((item) =>
          item.ap_test_id === apTestId
            ? {
                ...item,
                extra_fields: item.extra_fields.map((ef) =>
                  ef.id === fieldId ? { ...ef, value } : ef
                ),
              }
            : item
        )
      );
    } catch {
      message.error("Failed to save IHC extra field value");
    } finally {
      setExtraSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleExtraFieldOptionClick = (apTestId: number, fieldId: number, value: string) => {
    const ef = panel
      .find((p) => p.ap_test_id === apTestId)
      ?.extra_fields.find((f) => f.id === fieldId);
    const newValue = ef?.value === value ? null : value;
    saveExtraValue(apTestId, fieldId, newValue);
  };

  const handleExtraFieldTextChange = (apTestId: number, fieldId: number, value: string) => {
    const key = `${apTestId}-${fieldId}`;
    clearTimeout(extraFieldTimers.current[key]);
    extraFieldTimers.current[key] = setTimeout(() => {
      saveExtraValue(apTestId, fieldId, value || null);
    }, 600);
  };

  const insertText = (target: "microscopic_description" | "diagnosis") => {
    const html = generateIHCHtml(panel, currentPrefix, currentLineFormat);
    if (!html) {
      message.warning("No IHC results to insert");
      return;
    }
    const fieldName = ["diagnoses", specimenId, target];
    const current = form.getFieldValue(fieldName) || "";
    form.setFieldValue(fieldName, current ? `${current}${html}` : html);
    message.success(
      `IHC text inserted into ${
        target === "microscopic_description" ? "Microscopic Description" : "Diagnosis"
      }`
    );
  };

  const handleSaveSettings = async () => {
    const values = settingsForm.getFieldsValue();
    try {
      await UserService.updateMyPreferences({
        ihc_text_prefix: values.prefix,
        ihc_line_format: values.line_format,
      });
      if (user) {
        const updatedUser = {
          ...user,
          preferences: {
            ...user.preferences,
            ihc_text_prefix: values.prefix,
            ihc_line_format: values.line_format,
          },
        };
        updateUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }
      setSettingsOpen(false);
      message.success("IHC text settings saved");
    } catch {
      message.error("Failed to save settings");
    }
  };

  const settingsContent = (
    <div style={{ width: 320 }}>
      <Form
        form={settingsForm}
        layout="vertical"
        initialValues={{ prefix: currentPrefix, line_format: currentLineFormat }}
        size="small"
      >
        <Form.Item
          name="prefix"
          label="Intro line (shown before marker list)"
          extra='Leave blank to omit.'
        >
          <Input placeholder={DEFAULT_PREFIX} />
        </Form.Item>
        <Form.Item name="line_format" label="List format">
          <Radio.Group>
            <Radio value="bullet">Bullet list</Radio>
            <Radio value="plain">Inline paragraph</Radio>
          </Radio.Group>
        </Form.Item>
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            background: "#fafafa",
            border: "1px dashed #d9d9d9",
            borderRadius: 6,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
            ตัวอย่างข้อความที่จะแทรก / Preview:
          </Text>
          <div
            style={{ fontSize: 13 }}
            dangerouslySetInnerHTML={{
              __html: buildPreviewHtml(
                watchedPrefix ?? currentPrefix,
                (watchedLineFormat ?? currentLineFormat) as "bullet" | "plain"
              ),
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button size="small" onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button size="small" type="primary" onClick={handleSaveSettings}>Save</Button>
        </div>
      </Form>
    </div>
  );

  if (loading)
    return <Spin size="small" style={{ display: "block", marginTop: 8 }} />;
  if (!panel.length) return null;

  return (
    <section>
      <Divider style={{ margin: "12px 0" }} />

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Space>
          <ExperimentOutlined style={{ color: "#722ed1" }} />
          <Text strong style={{ textTransform: "uppercase", color: "#262626" }}>
            IHC Panel
          </Text>
          <Popover
            content={settingsContent}
            title="IHC Text Insertion Settings"
            trigger="click"
            open={settingsOpen}
            onOpenChange={(v) => {
              setSettingsOpen(v);
              if (v) {
                settingsForm.setFieldsValue({
                  prefix: currentPrefix,
                  line_format: currentLineFormat,
                });
              }
            }}
            placement="bottomLeft"
          >
            <Tooltip title="Customize text insertion format">
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                style={{ color: "#8c8c8c" }}
              />
            </Tooltip>
          </Popover>
          {!isLocked && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              drag <HolderOutlined /> to reorder
            </Text>
          )}
        </Space>

        {!isLocked && (
          <Space>
            <Tooltip title="Insert IHC results into Microscopic Description">
              <Button
                size="small"
                icon={<InsertRowBelowOutlined />}
                onClick={() => insertText("microscopic_description")}
              >
                Insert → Microscopic
              </Button>
            </Tooltip>
            <Tooltip title="Insert IHC results into Diagnosis">
              <Button
                size="small"
                icon={<InsertRowBelowOutlined />}
                onClick={() => insertText("diagnosis")}
              >
                Insert → Diagnosis
              </Button>
            </Tooltip>
          </Space>
        )}
      </div>

      {/* Sortable marker list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={panel.map((i) => i.ap_test_id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {panel.map((item) => (
              <SortableMarkerRow
                key={item.ap_test_id}
                item={item}
                isLocked={isLocked}
                saving={!!saving[item.ap_test_id]}
                onOptionClick={handleOptionClick}
                onNumericChange={handleNumericChange}
                extraSaving={extraSaving}
                onExtraFieldOptionClick={handleExtraFieldOptionClick}
                onExtraFieldTextChange={handleExtraFieldTextChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
};

export default IHCResultPanel;
