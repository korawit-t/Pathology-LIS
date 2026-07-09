import React, { useEffect, useState } from "react";
import {
  Typography,
  Alert,
  Divider,
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Popconfirm,
  message,
  Spin,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  RobotOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
    setModalOpen(true);
  };

  const openEdit = (profile: LlmProfile) => {
    setEditingId(profile.id);
    form.setFieldsValue(profile);
    setModalOpen(true);
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
      setModalOpen(false);
      load();
    } catch {
      // validation error handled by form
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      await form.validateFields(["provider", "model"]);
    } catch {
      return;
    }
    const { provider, model, base_url } = form.getFieldsValue();
    setTesting(true);
    try {
      const result = await LlmProfileService.testConnection({ provider, model, base_url });
      message.success({
        content: (
          <span>
            <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 6 }} />
            {result.detail}
          </span>
        ),
        duration: 5,
      });
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || "Connection test failed";
      message.error({
        content: (
          <span>
            <CloseCircleOutlined style={{ color: "#ff4d4f", marginRight: 6 }} />
            {errMsg}
          </span>
        ),
        duration: 7,
      });
    } finally {
      setTesting(false);
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

      {/* Modal */}
      <Modal
        title={editingId ? "Edit LLM Profile" : "Add LLM Profile"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={480}
        destroyOnHidden
        footer={[
          <Tooltip key="test" title="Sends a minimal ~5-token prompt to confirm the API key and model work — kept cheap on purpose">
            <Button icon={<ApiOutlined />} loading={testing} onClick={handleTest} style={{ float: "left" }}>
              Test Connection
            </Button>
          </Tooltip>,
          <Button key="cancel" onClick={() => setModalOpen(false)}>Cancel</Button>,
          <Button key="save" type="primary" loading={saving} onClick={handleSave}>Save</Button>,
        ]}
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
              extra="Full endpoint up to (not including) /chat/completions — code appends that. e.g. https://generativelanguage.googleapis.com/v1beta/openai for Gemini, http://localhost:11434/v1 for Ollama"
            >
              <Input placeholder="https://generativelanguage.googleapis.com/v1beta/openai" allowClear />
            </Form.Item>
          )}

          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AiConfigTab;
