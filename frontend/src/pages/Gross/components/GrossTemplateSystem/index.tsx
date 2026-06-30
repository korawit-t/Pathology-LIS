import React, { useState, useEffect, FC } from "react";
import {
  Input,
  AutoComplete,
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
  Popconfirm,
  Tag,
  Tooltip,
  Empty,
  InputNumber,
  Switch,
} from "antd";
import {
  ThunderboltOutlined,
  EditOutlined,
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  SettingOutlined,
  SearchOutlined,
  ProfileOutlined,
  CopyOutlined,
} from "@ant-design/icons";

import styles from "./GrossTemplateSystem.module.css";
import GrossTemplateService from "../../../../services/grossTemplateService";

const { Text } = Typography;

interface BlockTemplateItem {
  tissue_description?: string | null;
  tissue_count?: number | null;
  is_tissue_uncountable?: boolean;
}

interface GrossTemplate {
  id?: number;
  key?: number;
  name: string;
  raw_content: string;
  raw?: string;
  category: string;
  block_templates?: BlockTemplateItem[] | null;
  updated_at?: string;
}

interface GrossTemplateSystemProps {
  onFinishedText: (
    text: string,
    mode: "append" | "replace",
    blocks?: BlockTemplateItem[],
  ) => void;
}

const GrossTemplateSystem: FC<GrossTemplateSystemProps> = ({
  onFinishedText,
}) => {
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<GrossTemplate[]>([]);

  const [selectedTemplate, setSelectedTemplate] =
    useState<GrossTemplate | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<GrossTemplate> & { block_templates?: BlockTemplateItem[] } | null>(
    null,
  );
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [blockFormData, setBlockFormData] = useState<Record<string, string>>({});
  const [blockCountData, setBlockCountData] = useState<Record<number, number | null>>({});
  const [blockUncountableData, setBlockUncountableData] = useState<Record<number, boolean>>({});
  const [insertMode, setInsertMode] = useState<"append" | "replace">("replace");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await GrossTemplateService.getTemplates();
      const formatted = res.data.map((t: GrossTemplate) => ({
        ...t,
        raw: t.raw_content,
        key: t.id,
      }));
      setTemplates(formatted);
    } catch (err) {
      message.error("โหลดข้อมูลล้มเหลว");
    } finally {
      setLoading(false);
    }
  };


  // --- Core Logic ---
  const handleSave = async () => {
    if (!editingItem?.name || !editingItem?.raw) {
      return message.warning("กรุณากรอกชื่อและเนื้อหาให้ครบถ้วน");
    }
    try {
      const payload = {
        name: editingItem.name,
        raw_content: editingItem.raw,
        category: editingItem.category || "General",
        block_templates: editingItem.block_templates ?? [],
      };
      if (editingItem.id) {
        await GrossTemplateService.updateTemplate(editingItem.id, payload);
        message.success("อัปเดตแม่แบบสำเร็จ");
      } else {
        await GrossTemplateService.createTemplate(payload);
        message.success("สร้างแม่แบบใหม่สำเร็จ");
      }
      setIsEditModalOpen(false);
      fetchTemplates();
    } catch (err) {
      message.error("บันทึกไม่สำเร็จ");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await GrossTemplateService.deleteTemplate(id);
      message.success("ลบแม่แบบแล้ว");
      fetchTemplates();
    } catch (err) {
      message.error("ลบไม่สำเร็จ");
    }
  };

  const insertTag = (type: "text" | "select") => {
    const target = document.getElementById(`edit-area`) as HTMLTextAreaElement;
    if (!target || !editingItem) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const tag =
      type === "text" ? "{{input_name}}" : "{{select_name:opt1,opt2}}";
    const currentRaw = editingItem.raw || "";
    const newRaw =
      currentRaw.substring(0, start) + tag + currentRaw.substring(end);
    setEditingItem({ ...editingItem, raw: newRaw });
  };

  const parseTemplate = (text: string) =>
    text ? text.split(/({{[^}]+}})/g) : [];

  const buildText = () => {
    if (!selectedTemplate || !selectedTemplate.raw) return "";
    return parseTemplate(selectedTemplate.raw)
      .map((part) => {
        if (part.startsWith("{{")) {
          const key = part.replace(/{{|}}/g, "").split(":")[0];
          return formData[key] || `[${key}]`;
        }
        return part;
      })
      .join("");
  };

  const resolveBlockDesc = (desc: string | null | undefined, idx: number): string | null => {
    if (!desc) return null;
    return parseTemplate(desc)
      .map((part) => {
        if (part.startsWith("{{")) {
          const key = part.replace(/{{|}}/g, "").split(":")[0];
          return blockFormData[`${idx}_${key}`] || "";
        }
        return part;
      })
      .join("") || null;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Copied raw template to clipboard!");
  };

  const columns = [
    {
      title: "Template Name",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 150,
      render: (cat: string) => (
        <Tag color="blue" bordered={false}>
          {cat || "General"}
        </Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 100,
      align: "center" as const,
      render: (_: unknown, record: GrossTemplate) => (
        <Space>
          <Tooltip title="Copy Raw Template">
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(record.raw_content)}
            />
          </Tooltip>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingItem({ ...record, block_templates: record.block_templates ?? [] });
              setIsEditModalOpen(true);
            }}
          />
          <Popconfirm
            title="Delete this template?"
            onConfirm={() => record.id && handleDelete(record.id)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* 1. Header & Selection Area */}
      <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Select
            placeholder="Search and select a template..."
            style={{ width: "100%" }}
            showSearch
            optionFilterProp="label"
            size="large"
            onChange={(val) => {
              const tpl = templates.find((x) => x.id === val) || null;
              setSelectedTemplate(tpl);
              setFormData({});
              setBlockFormData({});
              // Initialise count overrides from template defaults
              const counts: Record<number, number | null> = {};
              const uncountable: Record<number, boolean> = {};
              (tpl?.block_templates ?? []).forEach((blk, i) => {
                counts[i] = blk.tissue_count ?? null;
                uncountable[i] = blk.is_tissue_uncountable ?? false;
              });
              setBlockCountData(counts);
              setBlockUncountableData(uncountable);
            }}
            options={templates.map((t) => ({
              label: `${t.category ? `[${t.category}] ` : ""}${t.name}`,
              value: t.id,
            }))}
          />
        </Col>
        <Col>
          <Tooltip title="Manage Templates">
            <Button
              icon={<SettingOutlined />}
              onClick={() => setIsManageModalOpen(true)}
            />
          </Tooltip>
        </Col>
      </Row>

      {/* 2. Content Preview Area */}
      <div
        style={{
          minHeight: "200px",
          padding: "20px",
          background: "#fafafa",
          borderRadius: "8px",
          border: "1px solid #f0f0f0",
        }}
      >
        {selectedTemplate ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <Text
                type="secondary"
                style={{ fontSize: "12px", textTransform: "uppercase" }}
              >
                Fill Details:
              </Text>
            </div>
            <Row gutter={[12, 12]} align="middle">
              {parseTemplate(selectedTemplate.raw || "").map((part, i) => {
                if (part.startsWith("{{")) {
                  const content = part.replace(/{{|}}/g, "");
                  const [key, optionsStr] = content.split(":");
                  return (
                    <Col key={i}>
                      {optionsStr ? (
                        <Select
                          size="small"
                          placeholder={key}
                          style={{ minWidth: Math.max(120, Math.max(...optionsStr.split(",").map((o) => o.length)) * 8 + 48) }}
                          popupMatchSelectWidth={false}
                          onChange={(v) =>
                            setFormData({ ...formData, [key]: v })
                          }
                        >
                          {optionsStr.split(",").map((o) => (
                            <Select.Option key={o} value={o}>
                              {o}
                            </Select.Option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          size="small"
                          placeholder={key}
                          style={{ width: 100 }}
                          onChange={(e) =>
                            setFormData({ ...formData, [key]: e.target.value })
                          }
                        />
                      )}
                    </Col>
                  );
                }
                return (
                  <Col key={i}>
                    <Text style={{ fontSize: "15px" }}>{part}</Text>
                  </Col>
                );
              })}
            </Row>
            {/* Block preview */}
            {(selectedTemplate?.block_templates ?? []).length > 0 && (
              <>
                <Divider style={{ margin: "16px 0 12px 0" }} />
                <div>
                  <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase" }}>
                    Blocks to be created:
                  </Text>
                  <div style={{ width: "100%", marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {(selectedTemplate!.block_templates ?? []).map((blk, idx) => {
                      const descParts = parseTemplate(blk.tissue_description || "");
                      return (
                        <Row key={idx} gutter={8} align="middle" wrap={false}>
                          <Col flex="none">
                            <Tag color="blue" style={{ margin: 0 }}>Block {idx + 1}</Tag>
                          </Col>
                          <Col flex="none">
                            <InputNumber
                              size="small"
                              min={1}
                              max={999}
                              placeholder="Count"
                              style={{ width: 64 }}
                              disabled={!!blockUncountableData[idx]}
                              value={blockUncountableData[idx] ? undefined : (blockCountData[idx] ?? undefined)}
                              onChange={(v) => setBlockCountData((prev) => ({ ...prev, [idx]: v ?? null }))}
                            />
                          </Col>
                          <Col flex="none">
                            <Space size={4}>
                              <Switch
                                size="small"
                                checked={!!blockUncountableData[idx]}
                                onChange={(checked) => {
                                  setBlockUncountableData((prev) => ({ ...prev, [idx]: checked }));
                                  if (checked) setBlockCountData((prev) => ({ ...prev, [idx]: null }));
                                }}
                              />
                              <Text style={{ fontSize: 11, color: "#8c8c8c" }}>Multiple</Text>
                            </Space>
                          </Col>
                          <Col flex="auto">
                            <Space size={4} wrap>
                              {descParts.map((part, i) => {
                                if (part.startsWith("{{")) {
                                  const content = part.replace(/{{|}}/g, "");
                                  const [key, optionsStr] = content.split(":");
                                  const stateKey = `${idx}_${key}`;
                                  if (optionsStr) {
                                    return (
                                      <Select
                                        key={i}
                                        size="small"
                                        placeholder={key}
                                        style={{ minWidth: Math.max(120, Math.max(...optionsStr.split(",").map((o) => o.length)) * 8 + 48) }}
                                        popupMatchSelectWidth={false}
                                        onChange={(v) => setBlockFormData((prev) => ({ ...prev, [stateKey]: v }))}
                                        options={optionsStr.split(",").map((o) => ({ label: o, value: o }))}
                                      />
                                    );
                                  }
                                  return (
                                    <Input
                                      key={i}
                                      size="small"
                                      placeholder={key}
                                      style={{ width: 100 }}
                                      onChange={(e) => setBlockFormData((prev) => ({ ...prev, [stateKey]: e.target.value }))}
                                    />
                                  );
                                }
                                return part ? <Text key={i} style={{ fontSize: 13 }}>{part}</Text> : null;
                              })}
                            </Space>
                          </Col>
                        </Row>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Divider style={{ margin: "16px 0 16px 0" }} />
            <Row justify="space-between" align="middle">
              <Space>
                <Text strong>Insert Mode:</Text>
                <Radio.Group
                  value={insertMode}
                  onChange={(e) => setInsertMode(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  size="small"
                >
                  <Radio value="replace">Replace</Radio>
                  <Radio value="append">Append</Radio>
                </Radio.Group>
              </Space>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() =>
                  onFinishedText(
                    buildText(),
                    insertMode,
                    (selectedTemplate?.block_templates ?? []).map((blk, idx) => ({
                      ...blk,
                      tissue_description: resolveBlockDesc(blk.tissue_description, idx),
                      tissue_count: blockUncountableData[idx] ? null : (blockCountData[idx] ?? blk.tissue_count ?? null),
                      is_tissue_uncountable: blockUncountableData[idx] ?? blk.is_tissue_uncountable ?? false,
                    })),
                  )
                }
              >
                Apply
              </Button>
            </Row>
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Select a template above"
            style={{ margin: "40px 0" }}
          />
        )}
      </div>

      {/* Management Modal */}
      <Modal
        title={
          <Space>
            <ProfileOutlined />
            <span>Template Management</span>
          </Space>
        }
        open={isManageModalOpen}
        onCancel={() => setIsManageModalOpen(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setIsManageModalOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingItem({ name: "", raw: "", category: "General" });
              setIsEditModalOpen(true);
            }}
          >
            Create New
          </Button>
        </div>
        <Table
          size="small"
          columns={columns}
          dataSource={templates.filter((t) =>
            t.name.toLowerCase().includes(searchText.toLowerCase()),
          )}
          pagination={{ pageSize: 6 }}
          loading={loading}
        />
      </Modal>

      {/* Edit Modal (zIndex สูงกว่าเพื่อให้ลอยทับ Management Modal) */}
      <Modal
        title={editingItem?.id ? "Edit Template" : "New Template"}
        open={isEditModalOpen}
        onOk={handleSave}
        onCancel={() => setIsEditModalOpen(false)}
        zIndex={2000}
        width={600}
        okText="Save Template"
        destroyOnClose
      >
        {editingItem && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Row gutter={16}>
              <Col span={14}>
                <Text strong>Name:</Text>
                <Input
                  value={editingItem.name}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, name: e.target.value })
                  }
                />
              </Col>
              <Col span={10}>
                <Text strong>Category:</Text>
                <AutoComplete
                  value={editingItem.category ?? ""}
                  onChange={(val) => setEditingItem({ ...editingItem, category: val })}
                  options={[...new Set(templates.map((t) => t.category).filter(Boolean))]
                    .filter((c) => !editingItem.category || c.toLowerCase().includes(editingItem.category.toLowerCase()))
                    .map((c) => ({ value: c }))}
                  placeholder="e.g., General, FNA, Fluid"
                  style={{ width: "100%" }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.stopPropagation(); }}
                />
              </Col>
            </Row>
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => insertTag("text")}
                >
                  Input Field
                </Button>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => insertTag("select")}
                >
                  Dropdown List
                </Button>
              </div>
              <Input.TextArea
                id="edit-area"
                value={editingItem.raw}
                rows={8}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, raw: e.target.value })
                }
                placeholder="Ex: The specimen consists of {{color}} tissue measuring {{size}} cm."
              />
            </div>

            {/* Block templates */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>Block Templates</Text>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setEditingItem({
                      ...editingItem,
                      block_templates: [
                        ...(editingItem.block_templates ?? []),
                        { tissue_description: null, tissue_count: null, is_tissue_uncountable: false },
                      ],
                    })
                  }
                >
                  Add Block
                </Button>
              </div>
              {(editingItem.block_templates ?? []).length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>No blocks defined — add blocks that will be created when this template is applied.</Text>
              ) : (
                <Space direction="vertical" style={{ width: "100%" }} size={6}>
                  {(editingItem.block_templates ?? []).map((blk, idx) => (
                    <Row key={idx} gutter={8} align="middle">
                      <Col flex="none">
                        <Text style={{ fontSize: 12, color: "#8c8c8c" }}>Block {idx + 1}</Text>
                      </Col>
                      <Col flex="auto">
                        <Input
                          size="small"
                          placeholder="Tissue description"
                          value={blk.tissue_description ?? ""}
                          onChange={(e) => {
                            const updated = [...(editingItem.block_templates ?? [])];
                            updated[idx] = { ...updated[idx], tissue_description: e.target.value || null };
                            setEditingItem({ ...editingItem, block_templates: updated });
                          }}
                        />
                      </Col>
                      <Col flex="none">
                        <InputNumber
                          size="small"
                          min={1}
                          max={999}
                          placeholder="Count"
                          style={{ width: 70 }}
                          value={blk.is_tissue_uncountable ? undefined : (blk.tissue_count ?? undefined)}
                          disabled={!!blk.is_tissue_uncountable}
                          onChange={(v) => {
                            const updated = [...(editingItem.block_templates ?? [])];
                            updated[idx] = { ...updated[idx], tissue_count: v ?? null };
                            setEditingItem({ ...editingItem, block_templates: updated });
                          }}
                        />
                      </Col>
                      <Col flex="none">
                        <Space size={4}>
                          <Switch
                            size="small"
                            checked={!!blk.is_tissue_uncountable}
                            onChange={(checked) => {
                              const updated = [...(editingItem.block_templates ?? [])];
                              updated[idx] = { ...updated[idx], is_tissue_uncountable: checked, tissue_count: checked ? null : updated[idx].tissue_count };
                              setEditingItem({ ...editingItem, block_templates: updated });
                            }}
                          />
                          <Text style={{ fontSize: 11, color: "#8c8c8c" }}>Multiple fragments</Text>
                        </Space>
                      </Col>
                      <Col flex="none">
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            const updated = (editingItem.block_templates ?? []).filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, block_templates: updated });
                          }}
                        />
                      </Col>
                    </Row>
                  ))}
                </Space>
              )}
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default GrossTemplateSystem;
