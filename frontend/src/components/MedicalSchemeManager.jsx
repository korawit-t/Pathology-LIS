import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, message, Space, Popconfirm, Tooltip, Tag } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import MedicalSchemeService from "../services/medicalSchemeService";

const MedicalSchemeManager = () => {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  // 1. Fetch Data
  const fetchSchemes = async () => {
    setLoading(true);
    try {
      const res = await MedicalSchemeService.getSchemes();
      const sortedData = res.sort((a, b) => a.id - b.id);
      setSchemes(sortedData);
    } catch (err) {
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchemes();
  }, []);

  // 2. Handle Submit
  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        // Edit
        await MedicalSchemeService.updateScheme(editingId, values);
        message.success("แก้ไขสำเร็จ");
      } else {
        // Create
        await MedicalSchemeService.createScheme(values);
        message.success("เพิ่มสำเร็จ");
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchSchemes(); // โหลดข้อมูลใหม่
    } catch (err) {
      console.error(err);
      message.error("เกิดข้อผิดพลาด (ชื่อหรือรหัสอาจซ้ำ)");
    }
  };

  // 3. Handle Delete
  const handleDelete = async (id) => {
    try {
      await MedicalSchemeService.deleteScheme(id);
      message.success("ลบสำเร็จ");
      fetchSchemes();
    } catch (err) {
      message.error("ลบไม่สำเร็จ");
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
    { 
        title: "ID", 
        dataIndex: "id", 
        width: 60, 
        align: 'center',
        sorter: (a, b) => a.id - b.id 
    },
    { 
        title: "Code", 
        dataIndex: "code", 
        width: 100,
        render: (code) => code ? <Tag color="blue">{code}</Tag> : "-"
    },
    { title: "Scheme Name", dataIndex: "name" },
    {
      title: "Action",
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Space>
           <Tooltip title="Edit">
              <Button icon={<EditOutlined />} onClick={() => openEditModal(record)} size="small" />
           </Tooltip>
           
           <Popconfirm title="ยืนยันการลบ?" onConfirm={() => handleDelete(record.id)}>
              <Button icon={<DeleteOutlined />} danger size="small" />
           </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          Add Scheme
        </Button>
      </div>

      <Table dataSource={schemes} columns={columns} rowKey="id" loading={loading} variant />

      <Modal
        title={editingId ? "Edit Medical Scheme" : "Add Medical Scheme"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Scheme Name" rules={[{ required: true, message: 'Please input name!' }]}>
            <Input placeholder="เช่น บัตรทอง, ประกันสังคม" />
          </Form.Item>
          
        <Form.Item name="code" label="Code (HIS Mapping)">
            <Input placeholder="เช่น UCS, SSS (เว้นว่างได้)" />
        </Form.Item>
          
          <Button type="primary" htmlType="submit" block>
            {editingId ? "Update" : "Create"}
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default MedicalSchemeManager;