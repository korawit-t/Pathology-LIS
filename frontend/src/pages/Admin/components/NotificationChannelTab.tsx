import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Select,
  Popconfirm,
  Tag,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import NotificationChannelService, {
  NotificationChannel,
} from "../../../services/notificationChannelService";

const { Option } = Select;

const NotificationChannelTab: React.FC = () => {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await NotificationChannelService.getChannels();
      setChannels(data);
    } catch (error) {
      message.error("Failed to load notification channels");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: NotificationChannel) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      credentials: JSON.stringify(record.credentials, null, 2),
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await NotificationChannelService.deleteChannel(id);
      message.success("Channel deleted successfully");
      fetchChannels();
    } catch (error) {
      message.error("Failed to delete channel");
    }
  };

  const handleTest = async (record: NotificationChannel) => {
    setTestingId(record.id);
    try {
      const result = await NotificationChannelService.testChannel(record.id);
      message.success({
        content: (
          <span>
            <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 6 }} />
            {result.detail} — ข้อความทดสอบถูกส่งสำเร็จ!
          </span>
        ),
        duration: 5,
      });
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.detail || "ไม่สามารถส่งข้อความทดสอบได้";
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
      setTestingId(null);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();

      // Parse JSON credentials
      let parsedCredentials = {};
      try {
        parsedCredentials = JSON.parse(values.credentials);
      } catch (e) {
        message.error("Invalid JSON format in credentials");
        return;
      }

      const payload = {
        ...values,
        credentials: parsedCredentials,
      };

      if (editingId) {
        await NotificationChannelService.updateChannel(editingId, payload);
        message.success("Channel updated successfully");
      } else {
        await NotificationChannelService.createChannel(payload);
        message.success("Channel created successfully");
      }
      setIsModalVisible(false);
      fetchChannels();
    } catch (error) {
      message.error("Please check the form inputs");
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const PLATFORM_CREDENTIAL_PLACEHOLDER: Record<string, string> = {
    line: JSON.stringify(
      {
        channel_access_token: "your-channel-access-token",
        to_user_id: "C699f70b78...",
      },
      null,
      2,
    ),
    slack: JSON.stringify(
      {
        webhook_url: "https://hooks.slack.com/services/XXX/YYY/ZZZ",
      },
      null,
      2,
    ),
    discord: JSON.stringify(
      { webhook_url: "https://discord.com/api/webhooks/XXX/YYY" },
      null,
      2,
    ),
    custom: JSON.stringify(
      { webhook_url: "https://example.com/webhook" },
      null,
      2,
    ),
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Platform",
      dataIndex: "platform",
      key: "platform",
      render: (text: string) => {
        let color = "default";
        if (text === "line") color = "green";
        if (text === "slack") color = "purple";
        if (text === "discord") color = "blue";
        return <Tag color={color}>{text.toUpperCase()}</Tag>;
      },
    },
    {
      title: "Active",
      dataIndex: "is_active",
      key: "is_active",
      render: (isActive: boolean, record: NotificationChannel) => (
        <Switch
          checked={isActive}
          onChange={async (checked) => {
            try {
              await NotificationChannelService.updateChannel(record.id, {
                is_active: checked,
              });
              message.success(`Channel status updated`);
              fetchChannels();
            } catch (e) {
              message.error("Failed to update status");
            }
          }}
        />
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: NotificationChannel) => (
        <Space size="small">
          <Tooltip title="ส่งข้อความทดสอบ (Dummy Data)">
            <Button
              type="default"
              icon={<SendOutlined />}
              loading={testingId === record.id}
              onClick={() => handleTest(record)}
              style={{ color: "#1890ff", borderColor: "#1890ff" }}
            >
              Test
            </Button>
          </Tooltip>
          <Button
            type="text"
            icon={<EditOutlined style={{ color: "#1890ff" }} />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Are you sure you want to delete this channel?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Notification Channels</h2>
          <p style={{ color: "#888", marginTop: 4, fontSize: 13 }}>
            กด <strong>Test</strong> เพื่อส่งข้อความทดสอบด้วย Dummy Data ไปยัง
            channel นั้น
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Add Channel
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={channels}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={
          editingId ? "Edit Notification Channel" : "Add Notification Channel"
        }
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        width={620}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter a name" }]}
          >
            <Input placeholder="e.g. Server Alert, Support Team" />
          </Form.Item>

          <Form.Item
            name="platform"
            label="Platform"
            rules={[{ required: true, message: "Please select a platform" }]}
          >
            <Select
              placeholder="Select Platform"
              onChange={(val) => {
                const placeholder =
                  PLATFORM_CREDENTIAL_PLACEHOLDER[val] ?? "{}";
                const current = form.getFieldValue("credentials");
                if (!current || current === "{}") {
                  form.setFieldValue("credentials", placeholder);
                }
              }}
            >
              <Option value="line">Line Messaging API</Option>
              <Option value="slack">Slack (Incoming Webhook)</Option>
              <Option value="discord">Discord (Webhook)</Option>
              <Option value="custom">Custom Webhook</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="credentials"
            label="Credentials (JSON format)"
            rules={[
              { required: true, message: "Please provide credentials in JSON" },
            ]}
            tooltip="เลือก Platform ก่อนแล้วระบบจะแสดง template ให้อัตโนมัติ"
          >
            <Input.TextArea
              rows={8}
              placeholder={'{\n  "token": "your-token-here"\n}'}
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Active"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NotificationChannelTab;
