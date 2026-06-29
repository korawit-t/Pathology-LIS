import React, { useState, useEffect } from "react";
import { useSecureSrc } from "../../../components/SecureImage";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

const LogoThumbnail = ({ url }: { url?: string | null }) => {
  const src = useSecureSrc(url ? `${API_BASE}/storage/${url}` : undefined);
  if (!url) return <Text type="secondary">No Logo</Text>;
  if (!src) return null;
  return <img src={src} alt="logo" style={{ height: 40, objectFit: "contain" }} />;
};

const LogoPreview = ({ url, type }: { url?: string | null; type: string }) => {
  const src = useSecureSrc(url ? `${API_BASE}/storage/${url}` : undefined);
  if (!url) return <Text type="secondary">No Logo</Text>;
  if (!src) return null;
  return <img src={src} alt={`${type} logo`} style={{ maxHeight: "100%" }} />;
};
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Upload,
  message,
  Typography,
  Divider,
  Popconfirm,
} from "antd";
import { PlusOutlined, EditOutlined, UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import SystemSettingService from "../../../services/systemSettingService";
import { SystemSetting } from "../../../types/system";

const { Text } = Typography;
const { TextArea } = Input;

const GeneralTab = () => {
  const [settingsList, setSettingsList] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingSetting, setEditingSetting] = useState<SystemSetting | null>(null);
  const [logoLoading, setLogoLoading] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchAllSettings = async () => {
    try {
      setLoading(true);
      const data = await SystemSettingService.getAllSettings();
      setSettingsList(data);
    } catch (err) {
      message.error("Failed to load settings list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSettings();
  }, []);

  const openModal = (record: SystemSetting | null = null) => {
    setEditingSetting(record);
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleModalSave = async () => {
    try {
      const values = await form.validateFields();
      await SystemSettingService.updateSettings({
        ...values,
      }, values.hospital_slug || "master");
      message.success("Saved successfully");
      setModalVisible(false);
      fetchAllSettings();
    } catch (err) {
      if (err instanceof Error) {
          message.error("Failed to save: " + err.message);
      } else {
          message.error("Validation failed");
      }
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await SystemSettingService.deleteSettings(id);
      message.success("Deleted successfully");
      fetchAllSettings();
    } catch (err) {
      message.error("Failed to delete the login page");
    }
  };

  const handleUpload = async (type: "login" | "report", file: File) => {
    try {
      setLogoLoading(type);
      const slug = form.getFieldValue("hospital_slug") || "master";
      const res = await SystemSettingService.uploadLogo(type, file, slug); // We might need to update the service to pass slug
      // Update form field with new URL so it previews immediately
      form.setFieldsValue({ [`${type}_logo_url`]: res[`${type}_logo_url`] });
      message.success(`Uploaded successfully`);
    } catch (err) {
      message.error("Upload failed");
    } finally {
      setLogoLoading(null);
    }
    return false;
  };


  const columns = [
    {
      title: "Order",
      key: "index",
      render: (_text: unknown, _record: unknown, index: number) => index + 1,
      width: 80,
    },
    {
      title: "Hospital / Lab Name",
      dataIndex: "lab_name_en",
      key: "lab_name_en",
      render: (text: string, record: SystemSetting) => (
        <div>
          <Text strong>{text || record.lab_name_th}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: "12px" }}>
            {record.lab_address}
          </Text>
        </div>
      ),
    },
    {
      title: "URL Slug",
      dataIndex: "hospital_slug",
      key: "hospital_slug",
      render: (text: string) => (
        <Text code>{text === "master" ? "/login" : `/${text}`}</Text>
      ),
    },
    {
      title: "Login Logo",
      dataIndex: "login_logo_url",
      key: "login_logo_url",
      render: (url: string) => <LogoThumbnail url={url} />,
    },
    {
      title: "Report Logo",
      dataIndex: "report_logo_url",
      key: "report_logo_url",
      render: (url: string) => <LogoThumbnail url={url} />,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: SystemSetting) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            size="small"
            onClick={() => openModal(record)}
          >
            Edit
          </Button>
          {record.hospital_slug !== "master" && (
            <Popconfirm
              title="Delete Login Page"
              description="Are you sure you want to delete this login page?"
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
              placement="left"
            >
              <Button danger icon={<DeleteOutlined />} size="small">
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const LogoBox = ({ type, label }: { type: "login" | "report"; label: string }) => (
    <div
      style={{
        textAlign: "center",
        padding: 16,
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        flex: 1,
      }}
    >
      <Text strong>{label}</Text>
      <div
        style={{
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "12px 0",
          background: "#fafafa",
        }}
      >
        <LogoPreview url={form.getFieldValue(`${type}_logo_url`)} type={type} />
      </div>
      <Upload
        beforeUpload={(file) => handleUpload(type, file)}
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />} loading={logoLoading === type}>
          Upload
        </Button>
      </Upload>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openModal()}
        >
          Create New Login Page
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={settingsList}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingSetting ? "Edit Login Page" : "Create New Login Page"}
        open={modalVisible}
        onOk={handleModalSave}
        onCancel={() => setModalVisible(false)}
        width={800}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="hospital_slug"
            label="URL Slug (e.g., nongkhai-hospital)"
            rules={[{ required: true, message: "Please input slug!" }]}
            tooltip="User will visit /:slug to see this login page. The 'master' slug resolves to /login"
          >
            <Input disabled={!!editingSetting} />
          </Form.Item>

          <Form.Item
            name="lab_name_th"
            label="ชื่อห้องปฏิบัติการ (TH)"
            rules={[{ required: true, message: "กรุณากรอกชื่อภาษาไทย" }]}
          >
            <Input placeholder="เช่น ศูนย์พยาธิวิทยากายวิภาค" />
          </Form.Item>

          <Form.Item
            name="lab_name_en"
            label="Laboratory Name (EN)"
            rules={[{ required: true, message: "กรุณากรอกชื่อภาษาอังกฤษ" }]}
          >
            <Input placeholder="เช่น Pathology Diagnostic Center" />
          </Form.Item>

          <Form.Item
            name="lab_short_name_en"
            label="ชื่อย่อ (Short Name EN)"
          >
            <Input placeholder="เช่น PDC-LAB" />
          </Form.Item>

          <Form.Item name="lab_address" label="ที่อยู่ห้องปฏิบัติการ">
            <TextArea rows={3} placeholder="เลขที่ตั้งห้องปฏิบัติการ..." />
          </Form.Item>

          <Form.Item
            name="login_announcement"
            label="ข้อความแจ้งข่าวหน้า Login"
            extra="แสดงเป็น banner บนหน้า Login — เว้นว่างไว้ถ้าไม่ต้องการแสดง"
          >
            <TextArea
              rows={3}
              placeholder={"เช่น ย้ายมาระบบใหม่แล้ว ใช้ Username เดิม Password = Username\nกรุณาเปลี่ยนรหัสผ่านอย่างน้อย 8 ตัวอักษร"}
            />
          </Form.Item>

          {/* We only show upload boxes when editing, so we have the slug to save against */}
          {editingSetting && (
             <div style={{ marginTop: 24 }}>
                <Text strong>Logos</Text>
                <Divider style={{ margin: "8px 0" }} />
                <div style={{ display: "flex", gap: "16px" }}>
                   <LogoBox type="login" label="Login Page Logo" />
                   <LogoBox type="report" label="Report Header Logo" />
                </div>
             </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default GeneralTab;
