import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Switch, message, Space, Popconfirm } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import TissueProcessingService from "../services/tissueProcessingService";

const ProcessorMachineManager = () => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  const fetchMachines = async () => {
    setLoading(true);
    try {
      const res = await TissueProcessingService.getMachines();
      setMachines(res);
    } catch {
      message.error("โหลดข้อมูลเครื่องเข้าเนื้อล้มเหลว");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);

  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await TissueProcessingService.updateMachine(editingId, values);
        message.success("แก้ไขข้อมูลสำเร็จ");
      } else {
        await TissueProcessingService.createMachine(values);
        message.success("เพิ่มข้อมูลสำเร็จ");
      }
      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchMachines();
    } catch (err) {
      console.error(err);
      message.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleDelete = async (id) => {
    try {
      await TissueProcessingService.deleteMachine(id);
      message.success("ลบข้อมูลสำเร็จ");
      fetchMachines();
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
    { title: "Machine Name", dataIndex: "name" },
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
        <h2 style={{ margin: 0 }}>จัดการเครื่องเข้าเนื้อ (Processor Machines)</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>Add Machine</Button>
      </div>
      <Table dataSource={machines} columns={columns} rowKey="id" loading={loading} bordered />
      <Modal
        title={editingId ? "Edit Machine" : "Add Machine"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ name: "", is_active: true }}>
          <Form.Item name="name" label="Machine Name" rules={[{ required: true, message: 'กรุณากรอกชื่อเครื่อง' }]}>
            <Input placeholder="เช่น Peloris 1" />
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

export default ProcessorMachineManager;
