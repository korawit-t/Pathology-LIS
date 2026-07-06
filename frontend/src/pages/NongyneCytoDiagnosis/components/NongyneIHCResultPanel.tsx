import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popover,
  Radio,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { FormInstance } from "antd";
import {
  CheckOutlined,
  ExperimentOutlined,
  HolderOutlined,
  InsertRowBelowOutlined,
  PlusOutlined,
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
  NongyneIHCMarkerWithResult,
  NongyneIHCResultUpsert,
  IHCService,
} from "../../../services/ihcService";
import { useAuth } from "../../../hooks/useAuth";
import UserService from "../../../services/userService";
import AnatomicalPathologyTestService, {
  AnatomicalPathologyTest,
} from "../../../services/anatomicalTestService";
import NongyneStainService from "../../../services/nongyneStainService";

const { Text } = Typography;

const DEFAULT_PREFIX = "Immunohistochemical staining reveals:";

interface NongyneIHCResultPanelProps {
  form: FormInstance;
  caseId: number;
  isLocked: boolean;
}

function generateIHCHtml(
  panel: NongyneIHCMarkerWithResult[],
  prefix: string,
  lineFormat: "bullet" | "plain"
): string {
  const items = panel
    .filter((item) => item.result)
    .map((item) => {
      const result = item.result!;
      const parts: string[] = [];
      if (result.selected_option) {
        const opt = item.options.find((o) => o.option_value === result.selected_option);
        parts.push(opt ? opt.option_label : result.selected_option);
      }
      if (result.numeric_value != null) {
        const opt = item.options.find((o) => o.numeric_unit);
        const unit = opt?.numeric_unit ?? "";
        parts.push(`${result.numeric_value}${unit}`);
      }
      if (result.note) parts.push(`(${result.note})`);
      return parts.length ? { marker: item.marker_name, value: parts.join(", ") } : null;
    })
    .filter(Boolean) as { marker: string; value: string }[];

  if (!items.length) return "";

  const prefixHtml = prefix ? `<p>${prefix}</p>` : "";

  if (lineFormat === "bullet") {
    const lis = items.map((i) => `<li>${i.marker}: ${i.value}</li>`).join("");
    return `${prefixHtml}<ul>${lis}</ul>`;
  }
  const line = items.map((i) => `${i.marker}: ${i.value}`).join(", ");
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
  item: NongyneIHCMarkerWithResult;
  isLocked: boolean;
  saving: boolean;
  onOptionClick: (apTestId: number, value: string) => void;
  onNumericChange: (apTestId: number, value: number | null) => void;
}

const SortableMarkerRow: React.FC<SortableMarkerRowProps> = ({
  item,
  isLocked,
  saving,
  onOptionClick,
  onNumericChange,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.ap_test_id });

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
        <InputNumber
          size="small"
          defaultValue={numericValue ?? undefined}
          placeholder={selectedOpt?.numeric_unit ?? "value"}
          suffix={selectedOpt?.numeric_unit ?? ""}
          style={{ width: 130 }}
          onChange={(v) => onNumericChange(item.ap_test_id, v)}
          disabled={isLocked}
        />
      )}

      {saving && <Spin size="small" />}
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────

const NongyneIHCResultPanel: React.FC<NongyneIHCResultPanelProps> = ({
  form,
  caseId,
  isLocked,
}) => {
  const { user, updateUser } = useAuth();
  const [panel, setPanel] = useState<NongyneIHCMarkerWithResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm] = Form.useForm();
  const watchedPrefix = Form.useWatch("prefix", settingsForm);
  const watchedLineFormat = Form.useWatch("line_format", settingsForm) as
    | "bullet"
    | "plain"
    | undefined;
  const numericTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const saveOrderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allIHCTests, setAllIHCTests] = useState<AnatomicalPathologyTest[]>([]);
  const [addingMarker, setAddingMarker] = useState(false);
  const [stagedTestIds, setStagedTestIds] = useState<Set<number>>(new Set());
  const [ihcSearch, setIhcSearch] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);

  const currentPrefix = user?.preferences?.ihc_text_prefix ?? DEFAULT_PREFIX;
  const currentLineFormat =
    (user?.preferences?.ihc_line_format as "bullet" | "plain") ?? "bullet";
  const savedOrder: number[] = user?.preferences?.ihc_marker_order ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const applyOrder = useCallback(
    (items: NongyneIHCMarkerWithResult[], order: number[]): NongyneIHCMarkerWithResult[] => {
      if (!order.length) return items;
      const ordered = order
        .map((id) => items.find((i) => i.ap_test_id === id))
        .filter(Boolean) as NongyneIHCMarkerWithResult[];
      const rest = items.filter((i) => !order.includes(i.ap_test_id));
      return [...ordered, ...rest];
    },
    []
  );

  const fetchPanel = useCallback(async () => {
    try {
      const data = await IHCService.getNongynePanel(caseId);
      setPanel(applyOrder(data, savedOrder));
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    fetchPanel();
  }, [fetchPanel]);

  useEffect(() => {
    AnatomicalPathologyTestService.getAllTests()
      .then((res) => setAllIHCTests(res.data.filter((t) => t.category === "IHC")))
      .catch(() => {});
  }, []);

  const toggleStaged = (testId: number) => {
    setStagedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  };

  const handleOrderMarkers = async () => {
    if (stagedTestIds.size === 0) return;
    setAddingMarker(true);
    try {
      const baseSlideNo = panel.length + 1;
      await Promise.all(
        [...stagedTestIds].map((testId, idx) =>
          NongyneStainService.create({
            case_id: caseId,
            test_id: testId,
            slide_no: baseSlideNo + idx,
          }),
        ),
      );
      setStagedTestIds(new Set());
      setAddModalOpen(false);
      await fetchPanel();
    } catch {
      message.error("Failed to add IHC markers");
    } finally {
      setAddingMarker(false);
    }
  };

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
        // non-critical
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

  const save = async (apTestId: number, patch: Partial<NongyneIHCResultUpsert>) => {
    setSaving((s) => ({ ...s, [apTestId]: true }));
    try {
      const current = panel.find((p) => p.ap_test_id === apTestId);
      const payload: NongyneIHCResultUpsert = {
        case_id: caseId,
        ap_test_id: apTestId,
        selected_option: current?.result?.selected_option ?? null,
        numeric_value: current?.result?.numeric_value ?? null,
        note: current?.result?.note ?? null,
        ...patch,
      };
      const saved = await IHCService.upsertNongyneResult(payload);
      setPanel((prev) =>
        prev.map((item) => (item.ap_test_id === apTestId ? { ...item, result: saved } : item))
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

  const handleNumericChange = (apTestId: number, value: number | null) => {
    clearTimeout(numericTimers.current[apTestId]);
    numericTimers.current[apTestId] = setTimeout(() => {
      save(apTestId, { numeric_value: value });
    }, 600);
  };

  const insertText = (target: "microscopic_description" | "diagnosis") => {
    const html = generateIHCHtml(panel, currentPrefix, currentLineFormat);
    if (!html) {
      message.warning("No IHC results to insert");
      return;
    }
    const current = form.getFieldValue(target) || "";
    form.setFieldValue(target, current ? `${current}${html}` : html);
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
        <Form.Item name="prefix" label="Intro line (shown before marker list)" extra="Leave blank to omit.">
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

  const availableTests = allIHCTests.filter(
    (t) => !panel.some((p) => p.ap_test_id === t.id),
  );
  const filteredAvailable = availableTests.filter((t) =>
    t.name.toLowerCase().includes(ihcSearch.toLowerCase()),
  );

  if (loading) return <Spin size="small" style={{ display: "block", marginTop: 8 }} />;

  return (
    <section>

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
              if (v) settingsForm.setFieldsValue({ prefix: currentPrefix, line_format: currentLineFormat });
            }}
            placement="bottomLeft"
          >
            <Tooltip title="Customize text insertion format">
              <Button type="text" size="small" icon={<SettingOutlined />} style={{ color: "#8c8c8c" }} />
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
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setAddModalOpen(true)}
            >
              Add Marker
            </Button>
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

      {panel.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panel.map((i) => i.ap_test_id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {panel.map((item) => (
                <SortableMarkerRow
                  key={item.ap_test_id}
                  item={item}
                  isLocked={isLocked}
                  saving={!!saving[item.ap_test_id]}
                  onOptionClick={handleOptionClick}
                  onNumericChange={handleNumericChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        !isLocked && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            ยังไม่มี IHC marker — เพิ่มจากรายการด้านล่าง
          </Text>
        )
      )}

      <Modal
        open={addModalOpen}
        title={
          <Space>
            <ExperimentOutlined style={{ color: "#722ed1" }} />
            <span>Add IHC Marker</span>
          </Space>
        }
        onCancel={() => {
          setAddModalOpen(false);
          setStagedTestIds(new Set());
          setIhcSearch("");
        }}
        footer={
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            onClick={handleOrderMarkers}
            loading={addingMarker}
            disabled={stagedTestIds.size === 0}
            style={{
              background: stagedTestIds.size > 0 ? "#722ed1" : undefined,
              border: "none",
              fontWeight: 600,
              height: 40,
            }}
          >
            {stagedTestIds.size > 0
              ? `Confirm — ${stagedTestIds.size} marker${stagedTestIds.size > 1 ? "s" : ""}`
              : "เลือก marker เพื่อเพิ่ม"}
          </Button>
        }
        width={480}
        destroyOnClose
      >
        <Input
          placeholder="Search IHC..."
          allowClear
          value={ihcSearch}
          onChange={(e) => setIhcSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div
          style={{
            height: 320,
            overflowY: "auto",
            border: "1px solid #f0f0f0",
            borderRadius: 6,
            padding: 4,
          }}
        >
          {filteredAvailable.length > 0 ? (
            filteredAvailable.map((test) => {
              const isStaged = stagedTestIds.has(test.id);
              return (
                <div
                  key={test.id}
                  onClick={() => toggleStaged(test.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "7px 10px",
                    marginBottom: 2,
                    borderRadius: 6,
                    cursor: "pointer",
                    background: isStaged ? "#f0e6ff" : "transparent",
                    border: isStaged ? "1px solid #d3adf7" : "1px solid transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <Space size={8}>
                    {isStaged ? (
                      <CheckOutlined style={{ color: "#722ed1", fontSize: 12 }} />
                    ) : (
                      <PlusOutlined style={{ fontSize: 12, color: "#bfbfbf" }} />
                    )}
                    <Text style={{ fontSize: 13 }}>{test.name}</Text>
                  </Space>
                </div>
              );
            })
          ) : (
            <Text
              type="secondary"
              style={{ padding: "16px 8px", display: "block", fontSize: 13, textAlign: "center" }}
            >
              {availableTests.length === 0 ? "ไม่มี IHC marker เพิ่มเติม" : "No results."}
            </Text>
          )}
        </div>

        {stagedTestIds.size > 0 && (
          <div
            style={{
              background: "#f9f0ff",
              border: "1px dashed #d3adf7",
              borderRadius: 8,
              padding: "8px 10px",
              marginTop: 10,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: "#722ed1", fontWeight: 600 }}>เพิ่ม:</Text>
            {allIHCTests
              .filter((t) => stagedTestIds.has(t.id))
              .map((test) => (
                <Tag
                  key={test.id}
                  color="purple"
                  closable
                  onClose={() => toggleStaged(test.id)}
                  style={{ fontSize: 13, borderRadius: 10 }}
                >
                  {test.name}
                </Tag>
              ))}
          </div>
        )}
      </Modal>
    </section>
  );
};

export default NongyneIHCResultPanel;
