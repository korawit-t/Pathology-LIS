import React, { useState, useEffect, FC, useRef } from "react";
import {
  Input,
  Select,
  Space,
  Button,
  Typography,
  Row,
  Col,
  Radio,
  Divider,
  Table,
  Modal,
  message,
  Tag,
  Empty,
  Tooltip,
  Popconfirm,
} from "antd";
import {
  EditOutlined,
  SendOutlined,
  SettingOutlined,
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  BookOutlined,
  ThunderboltOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import DiagnosticTemplateService from "../../../services/diagnosticTemplateService";
import { DiagnosticTemplate } from "../../../types/diagnosticTemplate";
import styles from "./DiagnosticTemplateSystem.module.css";
import SimpleTiptapEditor, {
  TiptapEditorRef,
} from "../../../components/Editors/SimpleTiptapEditor";

const { Text } = Typography;

interface DiagnosticTemplateSystemProps {
  onApply: (
    data: { diagnosis: string; microscopic: string },
    mode: "append" | "replace",
    target: "current" | "all",
  ) => void;
  defaultCategory?: string;
  hideTargetSelector?: boolean;
}

const DiagnosticTemplateSystem: FC<DiagnosticTemplateSystemProps> = ({
  onApply,
  defaultCategory,
  hideTargetSelector = false,
}) => {
  const diagEditorRef = useRef<TiptapEditorRef>(null);
  const microEditorRef = useRef<TiptapEditorRef>(null);

  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<DiagnosticTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<DiagnosticTemplate | null>(null);
  const [editingItem, setEditingItem] =
    useState<Partial<DiagnosticTemplate> | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [insertMode, setInsertMode] = useState<"append" | "replace">("replace");
  const [searchText, setSearchText] = useState("");
  const [applyTarget, setApplyTarget] = useState<"current" | "all">("current");
  const [lastActiveTextArea, setLastActiveTextArea] = useState<
    "diagnosis" | "microscopic"
  >("diagnosis");
  const [categoryFilter, setCategoryFilter] = useState<string>(defaultCategory ?? "");

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (defaultCategory) setCategoryFilter(defaultCategory);
  }, [defaultCategory]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await DiagnosticTemplateService.getTemplates();
      setTemplates(res.map((t) => ({ ...t, key: t.id })));
    } catch (err) {
      message.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingItem?.name || !editingItem?.diagnosis_content)
      return message.warning("Please fill in all required fields");
    try {
      const payload = {
        ...editingItem,
        category: editingItem.category || "General",
      };
      if (editingItem.id)
        await DiagnosticTemplateService.updateTemplate(editingItem.id, payload);
      else
        await DiagnosticTemplateService.createTemplate(
          payload as DiagnosticTemplate,
        );

      message.success("Template saved successfully");
      setIsEditModalOpen(false);
      fetchTemplates();
    } catch (err) {
      message.error("Save failed");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await DiagnosticTemplateService.deleteTemplate(id);
      message.success("Template deleted");
      fetchTemplates();
    } catch (err) {
      message.error("Delete failed");
    }
  };

  const parseTemplate = (text: string) =>
    text ? text.split(/({{[^}]+}})/g) : [];

  const renderInlineInput = (part: string, index: number, prefix: string) => {
    const content = part.replace(/{{|}}/g, "");
    const [key, optionsStr] = content.split(":");
    const uniqueKey = `${prefix}-${part}-${index}`;
    const options = optionsStr
      ? optionsStr.split("|").map((o) => o.trim())
      : [];
      
    const getDynamicWidth = () => {
      if (options.length === 0) {
        const val = formData[uniqueKey] || "";
        return Math.min(Math.max(val.length * 8.5 + 40, 120), 400);
      }
      const selectedValue = formData[uniqueKey];
      const longestInOptions = options.reduce(
        (a, b) => (a.length > b.length ? a : b),
        "",
      );
      const currentDisplay = selectedValue || key;
      const finalWord =
        longestInOptions.length > currentDisplay.length
          ? longestInOptions
          : currentDisplay;
      return Math.min(
        Math.max(finalWord.length * 8.5 + 45, 100),
        400,
      );
    };

    return (
      <span
        key={uniqueKey}
        style={{
          display: "inline-block",
          verticalAlign: "middle",
          margin: "0 4px",
        }}
      >
        {options.length > 0 ? (
          <Select
            size="small"
            placeholder={key}
            style={{ width: getDynamicWidth() }}
            value={formData[uniqueKey]}
            onChange={(v) =>
              setFormData((prev) => ({ ...prev, [uniqueKey]: v }))
            }
          >
            {options.map((o) => (
              <Select.Option key={o} value={o}>
                {o}
              </Select.Option>
            ))}
          </Select>
        ) : (
          <Input
            size="small"
            placeholder={key}
            style={{ width: 110 }}
            value={formData[uniqueKey]}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, [uniqueKey]: e.target.value }))
            }
          />
        )}
      </span>
    );
  };

  const renderRichTextWithInputs = (htmlString: string, prefix: string) => {
    if (!htmlString) return null;
    const doc = new DOMParser().parseFromString(htmlString, "text/html");
    let keyCounter = 0;

    const parseNode = (node: Node): React.ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || "";
        if (!text.includes("{{")) return text;
        const parts = parseTemplate(text);
        return parts.map((part) => {
          if (part.startsWith("{{")) {
            return renderInlineInput(part, keyCounter++, prefix);
          }
          return <React.Fragment key={keyCounter++}>{part}</React.Fragment>;
        });
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();
        // Ignore certain tags
        if (tagName === "script" || tagName === "style") return null;

        const props: Record<string, unknown> = { key: keyCounter++ };
        Array.from(el.attributes).forEach((attr) => {
          if (attr.name === "class") {
            props.className = attr.value;
          } else if (attr.name === "style") {
            const styleObj: Record<string, string> = {};
            attr.value.split(";").forEach((s) => {
              if (!s.trim()) return;
              const [k, v] = s.split(":");
              if (k && v) {
                const reactKey = k
                  .trim()
                  .replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                styleObj[reactKey] = v.trim();
              }
            });
            props.style = styleObj;
          } else {
            // mapping standard attributes
            const name = attr.name;
            if (name === "colspan") props.colSpan = attr.value;
            else if (name === "rowspan") props.rowSpan = attr.value;
            else props[name] = attr.value;
          }
        });

        const children = Array.from(el.childNodes).map(parseNode);
        return React.createElement(
          tagName,
          props,
          children.length > 0 ? children : undefined,
        );
      }
      return null;
    };

    return Array.from(doc.body.childNodes).map(parseNode);
  };

  const buildResult = () => {
    if (!selectedTemplate) return { diagnosis: "", microscopic: "" };

    const process = (htmlString: string, prefix: string) => {
      if (!htmlString) return "";
      const doc = new DOMParser().parseFromString(htmlString, "text/html");
      let keyCounter = 0;

      const walkTextNodes = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          if (text.includes("{{")) {
            const parts = parseTemplate(text);
            const newText = parts
              .map((part) => {
                if (part.startsWith("{{")) {
                  const uniqueKey = `${prefix}-${part}-${keyCounter++}`;
                  const label = part.replace(/{{|}}/g, "").split(":")[0];
                  return formData[uniqueKey] || `[${label}]`;
                }
                keyCounter++; // increment for text fragments to perfectly match React keys during render
                return part;
              })
              .join("");
            node.nodeValue = newText;
          }
        } else {
          // React Elements assign a keyCounter at the node level too,
          // so we simulate that to keep indices perfectly synchronized with formData keys.
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = (node as HTMLElement).tagName.toLowerCase();
            if (tagName !== "script" && tagName !== "style") {
              keyCounter++;
            }
          }
          Array.from(node.childNodes).forEach(walkTextNodes);
        }
      };

      Array.from(doc.body.childNodes).forEach(walkTextNodes);
      return doc.body.innerHTML;
    };

    return {
      diagnosis: process(selectedTemplate.diagnosis_content, "diag"),
      microscopic: process(selectedTemplate.microscopic_content || "", "micro"),
    };
  };

  // เพิ่มฟังก์ชันสำหรับ Copy
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Copied raw template to clipboard!");
  };

  const allCategories = [...new Set(templates.map((t) => t.category ?? "General"))].sort();
  const filteredTemplates = categoryFilter
    ? templates.filter((t) => (t.category ?? "General") === categoryFilter)
    : templates;

  return (
    <div className={styles.container}>
      {/* 1. Selection Area */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {allCategories.length > 1 && (
          <Col span={24}>
            <Select
              placeholder="All categories"
              allowClear
              value={categoryFilter || undefined}
              onChange={(v) => { setCategoryFilter(v ?? ""); setSelectedTemplate(null); }}
              options={allCategories.map((c) => ({ label: c, value: c }))}
              style={{ width: "100%" }}
              size="middle"
            />
          </Col>
        )}
        <Col flex="auto">
          <Select
            placeholder="Search and select diagnostic template..."
            style={{ width: "100%" }}
            showSearch={{
              filterOption: (input, option) =>
                String(option?.label ?? "").toLowerCase().includes(input.toLowerCase()),
            }}
            size="large"
            onChange={(val) => {
              setSelectedTemplate(filteredTemplates.find((x) => x.id === val) || null);
              setFormData({});
            }}
            options={filteredTemplates.map((t) => ({
              label: `[${t.category || "General"}] ${t.name}`,
              value: t.id,
            }))}
          />
        </Col>
        <Col>
          <Tooltip title="Settings">
            <Button
              size="large"
              icon={<SettingOutlined />}
              onClick={() => setIsManageModalOpen(true)}
            />
          </Tooltip>
        </Col>
      </Row>

      {/* 2. Interactive Preview Area */}
      <div
        style={{
          padding: "24px",
          background: "#f8f9fa",
          borderRadius: "12px",
          border: "1px solid #e9ecef",
        }}
      >
        {selectedTemplate ? (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div
              style={{
                background: "#fff",
                padding: "24px",
                borderRadius: "8px",
                border: "1px solid #dee2e6",
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <Tag color="blue" icon={<ThunderboltOutlined />}>
                  DIAGNOSIS SUMMARY
                </Tag>
              </div>
              <div style={{ fontSize: "16px", lineHeight: 2.2 }}>
                {renderRichTextWithInputs(selectedTemplate.diagnosis_content, "diag")}
              </div>

              <Divider dashed style={{ margin: "24px 0" }} />

              <div style={{ marginBottom: 16 }}>
                <Tag color="green">MICROSCOPIC DESCRIPTION</Tag>
              </div>
              <div
                style={{ fontSize: "15px", lineHeight: 1.8, color: "#495057" }}
              >
                {renderRichTextWithInputs(selectedTemplate.microscopic_content || "", "micro")}
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                padding: "20px",
                borderRadius: "12px",
                border: "2px solid #1890ff", // ใส่สีขอบให้เด่นว่าเป็นส่วน Action
                marginTop: "24px",
                boxShadow: "0 4px 12px rgba(24, 144, 255, 0.1)",
              }}
            >
              <Row gutter={[16, 16]} align="middle">
                {/* ส่วน Options: จัดเป็น 2 แถวในมือถือ หรือ 1 แถวในจอปกติ */}
                <Col span={24}>
                  <Space size="middle" wrap>
                    <div
                      style={{
                        background: "#f0f2f5",
                        padding: "4px 12px",
                        borderRadius: "6px",
                      }}
                    >
                      <Text strong style={{ marginRight: 8 }}>
                        Mode:
                      </Text>
                      <Radio.Group
                        value={insertMode}
                        onChange={(e) => setInsertMode(e.target.value)}
                        size="small"
                      >
                        <Radio value="replace">Replace</Radio>
                        <Radio value="append">Append</Radio>
                      </Radio.Group>
                    </div>

                    {!hideTargetSelector && (
                      <div
                        style={{
                          background: "#f0f2f5",
                          padding: "4px 12px",
                          borderRadius: "6px",
                        }}
                      >
                        <Text strong style={{ marginRight: 8 }}>
                          Target:
                        </Text>
                        <Radio.Group
                          value={applyTarget}
                          onChange={(e) => setApplyTarget(e.target.value)}
                          size="small"
                        >
                          <Radio value="current">Current</Radio>
                          <Radio value="all">All Specimens</Radio>
                        </Radio.Group>
                      </div>
                    )}
                  </Space>
                </Col>

                {/* ส่วนปุ่มกด: ทำให้ใหญ่และอยู่ตรงกลางหรือขวาอย่างมีพลัง */}
                <Col span={24}>
                  {applyTarget === "all" ? (
                    <Popconfirm
                      title="Apply to ALL specimens?"
                      description="This will overwrite/append diagnosis for every specimen in this case."
                      onConfirm={() =>
                        onApply(buildResult(), insertMode, "all")
                      }
                      okButtonProps={{ danger: true }}
                      getPopupContainer={(trigger) =>
                        trigger.parentElement || document.body
                      }
                    >
                      <Button
                        type="primary"
                        danger
                        block
                        size="large"
                        icon={<ThunderboltOutlined />}
                        style={{
                          height: "50px",
                          fontSize: "18px",
                          fontWeight: "bold",
                        }}
                      >
                        CONFIRM APPLY TO ALL SPECIMENS
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      type="primary"
                      block
                      size="large"
                      icon={<SendOutlined />}
                      style={{
                        height: "50px",
                        fontSize: "18px",
                        fontWeight: "bold",
                      }}
                      onClick={() =>
                        onApply(buildResult(), insertMode, "current")
                      }
                    >
                      Apply to Current Report
                    </Button>
                  )}
                </Col>
              </Row>
            </div>
          </Space>
        ) : (
          <Empty
            description="Select a template above to start filling"
            style={{ padding: "40px 0" }}
          />
        )}
      </div>

      {/* 3. Management Modal */}
      <Modal
        title={
          <Space>
            <BookOutlined />
            <span>Diagnostic Template Management</span>
          </Space>
        }
        open={isManageModalOpen}
        onCancel={() => setIsManageModalOpen(false)}
        width={900}
        zIndex={2000}
        footer={null}
        getContainer={() => document.body}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Input
            placeholder="Search template name..."
            prefix={<SearchOutlined />}
            style={{ width: 350 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingItem({
                name: "",
                category: "General",
                diagnosis_content: "",
                microscopic_content: "",
              });
              setIsEditModalOpen(true);
            }}
          >
            Add New Template
          </Button>
        </div>
        <Table
          dataSource={templates.filter((t) =>
            t.name.toLowerCase().includes(searchText.toLowerCase()),
          )}
          size="small"
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: "Category",
              dataIndex: "category",
              width: 150,
              render: (cat) => <Tag color="blue">{cat || "General"}</Tag>,
            },
            { title: "Template Name", dataIndex: "name" },
            {
              title: "Actions",
              width: 120,
              align: "center",
              render: (_, record) => (
                <Space>
                  <Tooltip title="Copy Raw Template">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => copyToClipboard(record.diagnosis_content)}
                    />
                  </Tooltip>

                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingItem(record);
                      setIsEditModalOpen(true);
                    }}
                  />
                  <Popconfirm
                    title="Are you sure to delete?"
                    onConfirm={() => record.id && handleDelete(record.id)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      {/* 4. Edit/Create Modal */}
      <Modal
        title={editingItem?.id ? "Edit Template" : "New Template"}
        open={isEditModalOpen}
        onOk={handleSave}
        onCancel={() => setIsEditModalOpen(false)}
        width={850}
        zIndex={3000}
        okText="Save Changes"
        destroyOnClose
      >
        {editingItem && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Row gutter={16}>
              <Col span={8}>
                <Text strong>Category:</Text>
                <Input
                  value={editingItem.category}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, category: e.target.value })
                  }
                  placeholder="e.g., GI, Skin, Breast"
                  style={{ marginTop: 4 }}
                />
              </Col>
              <Col span={16}>
                <Text strong>Template Name:</Text>
                <Input
                  value={editingItem.name}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, name: e.target.value })
                  }
                  placeholder="e.g., Acute Appendicitis"
                  style={{ marginTop: 4 }}
                />
              </Col>
            </Row>

            <div
              style={{
                background: "#f8f9fa",
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid #e9ecef",
              }}
            >
              <Space>
                <Text type="secondary">Shortcuts:</Text>
                <Button
                  size="small"
                  onClick={() =>
                    diagEditorRef.current?.insertText("{{Field_Name}}")
                  }
                >
                  + Input Box
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    diagEditorRef.current?.insertText("{{Label:Opt1|Opt2}}")
                  }
                >
                  + Dropdown
                </Button>
              </Space>
            </div>

            <div>
              <Text strong>Diagnosis Content:</Text>
              <div
                onFocus={() => setLastActiveTextArea("diagnosis")}
                style={{ marginTop: 8 }}
              >
                <SimpleTiptapEditor
                  ref={diagEditorRef}
                  value={editingItem.diagnosis_content}
                  onChange={(val) =>
                    setEditingItem({ ...editingItem, diagnosis_content: val })
                  }
                />
              </div>
            </div>

            <div>
              <Text strong>Microscopic Content (Optional):</Text>
              <div
                onFocus={() => setLastActiveTextArea("microscopic")}
                style={{ marginTop: 8 }}
              >
                <Input.TextArea
                  id="micro-edit-area" // 🚩 เพิ่ม ID
                  rows={6}
                  value={editingItem.microscopic_content}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      microscopic_content: e.target.value,
                    })
                  }
                  placeholder="Enter microscopic description template here..."
                  onFocus={() => setLastActiveTextArea("microscopic")}
                />
              </div>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default DiagnosticTemplateSystem;
