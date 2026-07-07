import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Switch, Upload, message, Space, Popconfirm, Typography, Divider } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";

import HospitalService from "../services/hospitalService";
import { Hospital, HospitalPayload } from "../types/hospital";
import { useSecureSrc } from "./SecureImage";
import logger from "../utils/logger";

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

const HospitalLogoThumbnail: React.FC<{ url?: string | null }> = ({ url }) => {
  const src = useSecureSrc(url ? `${API_BASE}/storage/${url}` : undefined);
  if (!url) return <Text type="secondary">No Logo</Text>;
  if (!src) return null;
  return <img src={src} alt="hospital logo" style={{ height: 40, objectFit: "contain" }} />;
};

const HospitalManager: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLogo, setEditingLogo] = useState<string | null | undefined>(null);
  const [logoUploading, setLogoUploading] = useState<boolean>(false);
  const [form] = Form.useForm<HospitalPayload>();

  // 1. Fetch hospitals
  const fetchHospitals = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await HospitalService.getHospitals();
      setHospitals(res);
    } catch (err) {
      message.error("โหลดข้อมูลโรงพยาบาลล้มเหลว");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  // 2. Add / Edit hospital
  const handleSubmit = async (values: HospitalPayload): Promise<void> => {
    try {
      if (editingId) {
        await HospitalService.updateHospital(editingId, values);
        message.success("แก้ไขข้อมูลสำเร็จ");
      } else {
        await HospitalService.createHospital(values);
        message.success("เพิ่มโรงพยาบาลสำเร็จ");
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchHospitals();
    } catch (err) {
      logger.error(err);
      message.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  // 3. Delete hospital
  const handleDelete = async (id: number): Promise<void> => {
    try {
      await HospitalService.deleteHospital(id);
      message.success("ลบข้อมูลสำเร็จ");
      fetchHospitals();
    } catch (err) {
      message.error("ลบข้อมูลไม่สำเร็จ");
    }
  };

  const openAddModal = (): void => {
    setEditingId(null);
    setEditingLogo(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (record: Hospital): void => {
    setEditingId(record.id);
    setEditingLogo(record.logo_path);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleLogoUpload = async (file: File): Promise<boolean> => {
    if (!editingId) return false;
    try {
      setLogoUploading(true);
      const updated = await HospitalService.uploadLogo(editingId, file);
      setEditingLogo(updated.logo_path);
      message.success("อัปโหลดโลโก้สำเร็จ");
      fetchHospitals();
    } catch (err) {
      message.error("อัปโหลดโลโก้ไม่สำเร็จ");
    } finally {
      setLogoUploading(false);
    }
    return false;
  };

  // กำหนด Type ให้ Columns
  const columns: ColumnsType<Hospital> = [
    { 
      title: "ID", 
      dataIndex: "id", 
      width: 50 
    },
    { 
      title: "Code", 
      dataIndex: "code", 
      width: 100 
    },
    { 
      title: "Hospital Name", 
      dataIndex: "name" 
    },
    {
      title: "Address",
      dataIndex: "address"
    },
    {
      title: "Report Header",
      dataIndex: "use_custom_report_header",
      width: 160,
      render: (value: boolean, record: Hospital) =>
        value ? <HospitalLogoThumbnail url={record.logo_path} /> : <Text type="secondary">Master</Text>,
    },
    {
      title: "Action",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => openEditModal(record)} 
          />
          <Popconfirm 
            title="ยืนยันการลบ?" 
            onConfirm={() => handleDelete(record.id)}
            okText="ใช่"
            cancelText="ไม่"
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>จัดการข้อมูลโรงพยาบาล</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          Add Hospital
        </Button>
      </div>

      <Table<Hospital>
        dataSource={hospitals}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
      />

      <Modal
        title={editingId ? "Edit Hospital" : "Add New Hospital"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose // เคลียร์ข้อมูลในฟอร์มเมื่อปิด Modal
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ name: "", code: "", address: "", use_custom_report_header: false }}
        >
          <Form.Item
            name="name"
            label="Hospital Name"
            rules={[{ required: true, message: 'กรุณากรอกชื่อโรงพยาบาล' }]}
          >
            <Input placeholder="เช่น โรงพยาบาลขอนแก่น" />
          </Form.Item>

          <Form.Item name="code" label="Code (Optional)">
            <Input placeholder="เช่น HOS-001" />
          </Form.Item>

          <Form.Item
            name="report_name_en"
            label="Laboratory Name (EN)"
            extra="Used as the report header when this hospital's own report header is on — falls back to Hospital Name above if left blank."
          >
            <Input placeholder="e.g. Khon Kaen Hospital" />
          </Form.Item>

          <Form.Item
            name="report_short_name_en"
            label="Short Name (EN)"
            extra="Used as the lab code on slide/block stickers when this hospital's own report header is on — falls back to Hospital Name above if left blank."
          >
            <Input placeholder="e.g. KKH" />
          </Form.Item>

          <Form.Item name="address" label="Address">
            <Input.TextArea rows={3} placeholder="ที่อยู่โรงพยาบาล..." />
          </Form.Item>

          <Form.Item
            name="use_custom_report_header"
            label="Use this hospital's own report header"
            valuePropName="checked"
            extra="When off, reports use the master laboratory's name/address/logo. When on, reports for this hospital's cases use its own name, address, and logo below."
          >
            <Switch />
          </Form.Item>

          {editingId && (
            <div style={{ marginTop: 8, marginBottom: 24 }}>
              <Text strong>Report Header Logo</Text>
              <Divider style={{ margin: "8px 0" }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: 16,
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    height: 60,
                    width: 120,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fafafa",
                  }}
                >
                  <HospitalLogoThumbnail url={editingLogo} />
                </div>
                <Upload beforeUpload={handleLogoUpload} showUploadList={false}>
                  <Button icon={<UploadOutlined />} loading={logoUploading}>
                    Upload
                  </Button>
                </Upload>
              </div>
            </div>
          )}

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Save
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default HospitalManager;