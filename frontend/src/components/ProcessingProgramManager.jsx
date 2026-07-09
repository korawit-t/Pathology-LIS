import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Switch, message, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import TissueProcessingService from "../services/tissueProcessingService";

const ProcessingProgramManager = () => {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const res = await TissueProcessingService.getPrograms();
      setPrograms(res);
    } catch {
      message.error("โหลดข้อมูลโปรแกรมล้มเหลว");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await TissueProcessingService.updateProgram(editingId, values);
        message.success("แก้ไขข้อมูลสำเร็จ");
      } else {
        await TissueProcessingService.createProgram(values);
        message.success("เพิ่มข้อมูลสำเร็จ");
      }
      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchPrograms();
    } catch (err) {
      console.error(err);
      message.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleDelete = async (id) => {
    try {
      await TissueProcessingService.deleteProgram(id);
      message.success("ลบข้อมูลสำเร็จ");
      fetchPrograms();
    } catch {
      message.error("ลบข้อมูลไม่สำเร็จ");
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 50 },
    { title: "Program Name", dataIndex: "name" },
    { title: "Duration (Hours)", dataIndex: "duration_hours" },
    { 
      title: "Active", 
      dataIndex: "is_active", 
      render: (val) => val ? "Yes" : "No"
    },
    {
      title: "Action",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm title="ยืนยันการลบ?" onConfirm={() => handleDelete(record.id)} okText="ใช่" cancelText="ไม่">
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>จัดการโปรแกรมเข้าเนื้อ (Processing Programs)</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>Add Program</Button>
      </div>
      <Table dataSource={programs} columns={columns} rowKey="id" loading={loading} bordered />
      <Modal
        title={editingId ? "Edit Program" : "Add Program"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ name: "", duration_hours: null, is_active: true }}>
          <Form.Item name="name" label="Program Name" rules={[{ required: true, message: 'กรุณากรอกชื่อโปรแกรม' }]}>
            <Input placeholder="เช่น Overnight" />
          </Form.Item>
          <Form.Item name="duration_hours" label="Duration (Hours)">
            <InputNumber style={{ width: '100%' }} min={0} placeholder="เช่น 12" />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Save</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProcessingProgramManager;
