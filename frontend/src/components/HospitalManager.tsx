import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, message, Space, Popconfirm } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

import HospitalService from "../services/hospitalService";
import { Hospital, HospitalPayload } from "../types/hospital";
import logger from "../utils/logger";

const HospitalManager: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (record: Hospital): void => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setIsModalOpen(true);
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
          initialValues={{ name: "", code: "", address: "" }}
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

          <Form.Item name="address" label="Address">
            <Input.TextArea rows={3} placeholder="ที่อยู่โรงพยาบาล..." />
          </Form.Item>

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