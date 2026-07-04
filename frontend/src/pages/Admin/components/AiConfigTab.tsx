import React, { useEffect, useState } from "react";
import {
  Typography,
  Alert,
  Divider,
  Button,
  Table,
  Tag,
  Space,
  Drawer,
  Form,
  Input,
  Select,
  Switch,
  Popconfirm,
  message,
  Spin,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, RobotOutlined } from "@ant-design/icons";
import LlmProfileService, { LlmProfile, LlmProfileCreate } from "../../../services/llmProfileService";

const { Text, Title } = Typography;

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "green" },
  anthropic: { label: "Anthropic", color: "purple" },
  openai_compatible: { label: "OpenAI-Compatible", color: "blue" },
};

const AiConfigTab: React.FC = () => {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const provider = Form.useWatch("provider", form);

  const load = async () => {
    setLoading(true);
    try {
      setProfiles(await LlmProfileService.list());
    } catch {
      message.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ provider: "openai", is_active: true });
    setDrawerOpen(true);
  };

  const openEdit = (profile: LlmProfile) => {
    setEditingId(profile.id);
    form.setFieldsValue(profile);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values: LlmProfileCreate = await form.validateFields();
      setSaving(true);
      if (editingId) {
        await LlmProfileService.update(editingId, values);
        message.success("Updated successfully");
      } else {
        await LlmProfileService.create(values);
        message.success("Profile added successfully");
      }
      setDrawerOpen(false);
      load();
    } catch {
      // validation error handled by form
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await LlmProfileService.remove(id);
      message.success("Deleted successfully");
      load();
    } catch {
      message.error("Failed to delete");
    }
  };

  const columns = [
    {
      title: "Profile Name",
      dataIndex: "display_name",
      key: "display_name",
      render: (v: string, r: LlmProfile) => (
        <Space>
          <RobotOutlined style={{ color: "#722ed1" }} />
          <Text strong>{v}</Text>
          {!r.is_active && <Tag color="default">Inactive</Tag>}
        </Space>
      ),
    },
    {
      title: "Provider",
      dataIndex: "provider",
      key: "provider",
      width: 180,
      render: (v: string) => {
        const p = PROVIDER_LABELS[v];
        return <Tag color={p?.color ?? "default"}>{p?.label ?? v}</Tag>;
      },
    },
    {
      title: "Model",
      dataIndex: "model",
      key: "model",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Base URL",
      dataIndex: "base_url",
      key: "base_url",
      render: (v: string | null) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 100,
      render: (_: unknown, r: LlmProfile) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this profile?" onConfirm={() => handleDelete(r.id)} okText="Delete" cancelText="Cancel">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>AI Configuration</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Configure LLM profiles for various AI features, e.g. ICD-O code suggestion, report summarization
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Profile
        </Button>
      </div>
      <Divider style={{ margin: "16px 0" }} />

      <Spin spinning={loading}>
        <Table
          dataSource={profiles}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: "No LLM profile yet — click Add Profile to create one" }}
        />
      </Spin>

      <Alert
        style={{ marginTop: 24 }}
        type="info"
        icon={<KeyOutlined />}
        showIcon
        message="API Keys Are Configured on the Server"
        description={
          <div style={{ fontSize: 13 }}>
            <div>API keys are stored only in <Text code>.env</Text>, not via the UI:</div>
            <div style={{ marginTop: 6 }}>
              <Text code>OPENAI_API_KEY=</Text><br />
              <Text code>ANTHROPIC_API_KEY=</Text><br />
              <Text code>OPENAI_COMPATIBLE_API_KEY=</Text>
            </div>
            <div style={{ marginTop: 4, color: "#8c8c8c" }}>After editing .env, the server must be restarted</div>
          </div>
        }
      />

      {/* Drawer */}
      <Drawer
        title={editingId ? "Edit LLM Profile" : "Add LLM Profile"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>Save</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="display_name"
            label="Profile Name"
            rules={[{ required: true, message: "Please enter a profile name" }]}
            extra="e.g. LLM for ICD-O Coding, Report Summarizer"
          >
            <Input placeholder="LLM for ICD-O Coding" />
          </Form.Item>

          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: "openai", label: "OpenAI" },
                { value: "anthropic", label: "Anthropic (Claude)" },
                { value: "openai_compatible", label: "OpenAI-Compatible (Azure, Gemini, Ollama…)" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="model"
            label="Model Name"
            rules={[{ required: true, message: "Please enter a model name" }]}
            extra={
              provider === "anthropic"
                ? "e.g. claude-haiku-4-5-20251001, claude-sonnet-4-6"
                : provider === "openai_compatible"
                ? "Defined by that provider, e.g. gemini-2.0-flash, llama3.2"
                : "e.g. gpt-4o-mini, gpt-4o"
            }
          >
            <Input placeholder="gpt-4o-mini" />
          </Form.Item>

          {provider === "openai_compatible" && (
            <Form.Item
              name="base_url"
              label="Base URL"
              extra="The provider's endpoint, e.g. https://your-resource.openai.azure.com/"
            >
              <Input placeholder="https://..." allowClear />
            </Form.Item>
          )}

          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default AiConfigTab;
