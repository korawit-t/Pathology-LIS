import React, { useEffect, useState } from "react";
import {
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import WsiSettingService from "../../../services/wsiSettingService";
import type { WsiScannerProfile, WsiSetting } from "../../../types/system";

const { Title, Text } = Typography;

const WsiTab: React.FC = () => {
  const [settings, setSettings] = useState<WsiSetting | null>(null);
  const [profiles, setProfiles] = useState<WsiScannerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<WsiScannerProfile | null>(null);
  const [settingsForm] = Form.useForm();
  const [profileForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        WsiSettingService.getSettings(),
        WsiSettingService.listProfiles(),
      ]);
      setSettings(s);
      setProfiles(p);
      settingsForm.setFieldsValue({
        wsi_root_path: s.wsi_root_path ?? "",
        default_scanner_profile_id: s.default_scanner_profile_id ?? undefined,
      });
    } catch {
      message.error("Failed to load WSI settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaveSettings = async () => {
    const values = settingsForm.getFieldsValue();
    setSavingSettings(true);
    try {
      await WsiSettingService.updateSettings({
        wsi_root_path: values.wsi_root_path || null,
        default_scanner_profile_id: values.default_scanner_profile_id ?? null,
      });
      message.success("WSI settings saved");
      load();
    } catch {
      message.error("Failed to save WSI settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const openAddModal = () => {
    setEditingProfile(null);
    profileForm.resetFields();
    profileForm.setFieldsValue({ is_active: true, file_extensions: [] });
    setModalOpen(true);
  };

  const openEditModal = (profile: WsiScannerProfile) => {
    setEditingProfile(profile);
    profileForm.setFieldsValue({
      name: profile.name,
      filename_pattern: profile.filename_pattern,
      file_extensions: profile.file_extensions,
      separator: profile.separator ?? "",
      is_active: profile.is_active,
    });
    setModalOpen(true);
  };

  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      const payload = {
        ...values,
        separator: values.separator || null,
        file_extensions: values.file_extensions ?? [],
      };
      if (editingProfile) {
        await WsiSettingService.updateProfile(editingProfile.id, payload);
        message.success("Profile updated");
      } else {
        await WsiSettingService.createProfile(payload);
        message.success("Profile created");
      }
      setModalOpen(false);
      load();
    } catch {
      message.error("Failed to save profile");
    }
  };

  const handleDeleteProfile = async (id: number) => {
    try {
      await WsiSettingService.deleteProfile(id);
      message.success("Profile deleted");
      load();
    } catch {
      message.error("Failed to delete profile");
    }
  };

  const columns: ColumnsType<WsiScannerProfile> = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Pattern", dataIndex: "filename_pattern", key: "filename_pattern",
      render: (v: string) => <Text code>{v}</Text> },
    { title: "Extensions", dataIndex: "file_extensions", key: "file_extensions",
      render: (exts: string[]) => exts.map(e => <Tag key={e}>{e.toUpperCase()}</Tag>) },
    { title: "Separator", dataIndex: "separator", key: "separator",
      render: (v: string | null) => v ? <Text code>{v}</Text> : <Text type="secondary">—</Text> },
    { title: "Active", dataIndex: "is_active", key: "is_active",
      render: (v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "Active" : "Inactive"}</Tag> },
    {
      title: "Actions", key: "actions",
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>Edit</Button>
          <Popconfirm title="Delete this profile?" onConfirm={() => handleDeleteProfile(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Title level={5}>WSI Root Path</Title>
      <Form form={settingsForm} layout="vertical">
        <Form.Item
          label="WSI Storage Root Path"
          name="wsi_root_path"
          extra="Local path or network path where scanner saves slide files. e.g. /mnt/wsi or \\192.168.1.10\wsi"
        >
          <Input placeholder="/data/wsi_storage" style={{ maxWidth: 480 }} />
        </Form.Item>
        <Form.Item label="Default Scanner Profile" name="default_scanner_profile_id">
          <Select
            allowClear
            placeholder="Select default profile"
            style={{ maxWidth: 320 }}
            options={profiles.filter(p => p.is_active).map(p => ({ label: p.name, value: p.id }))}
          />
        </Form.Item>
        <Button type="primary" loading={savingSettings} onClick={handleSaveSettings}>
          Save Path Settings
        </Button>
      </Form>

      <Divider />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Scanner Profiles</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>Add Profile</Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={profiles}
        loading={loading}
        pagination={false}
        size="small"
      />

      <Modal
        title={editingProfile ? "Edit Scanner Profile" : "Add Scanner Profile"}
        open={modalOpen}
        onOk={handleSaveProfile}
        onCancel={() => setModalOpen(false)}
        okText="Save"
        destroyOnClose
      >
        <Form form={profileForm} layout="vertical">
          <Form.Item label="Profile Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Leica GT450" />
          </Form.Item>
          <Form.Item
            label="Filename Pattern"
            name="filename_pattern"
            rules={[{ required: true }]}
            extra="Use {accession} and {block} as placeholders. e.g. {accession}_{block}"
          >
            <Input placeholder="{accession}_{block}" />
          </Form.Item>
          <Form.Item label="File Extensions" name="file_extensions" extra="Extensions to recognize as WSI files">
            <Select
              mode="tags"
              placeholder="svs, ndpi, tiff, scn, mrxs"
              tokenSeparators={[","]}
            />
          </Form.Item>
          <Form.Item label="Separator" name="separator" extra="Character separating accession and block in filename">
            <Input placeholder="_ or -" style={{ maxWidth: 120 }} />
          </Form.Item>
          <Form.Item label="Active" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default WsiTab;
