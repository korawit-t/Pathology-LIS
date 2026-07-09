import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm,
  Tooltip,
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import PositionService from "../services/positionService";

const PositionManager = () => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form] = Form.useForm();

  // 1. Fetch Data
  const fetchPositions = async () => {
    setLoading(true);
    try {
      const res = await PositionService.getPositions();

      const sorted = [...res].sort((a, b) => a.id - b.id);

      setPositions(sorted);
    } catch (error) {
      console.error(error);
      message.error("โหลดข้อมูลตำแหน่งล้มเหลว");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchPositions();
  }, []);

  // 2. Handle Submit (Create & Update)
  const handleSubmit = async (values) => {
    try {
      if (editingId) {
        await PositionService.updatePosition(editingId, values);
        message.success("แก้ไขตำแหน่งสำเร็จ");
      } else {
        await PositionService.createPosition(values);
        message.success("เพิ่มตำแหน่งสำเร็จ");
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchPositions();
    } catch {
      message.error("เกิดข้อผิดพลาด");
    }
  };

  // 3. Handle Delete
  const handleDelete = async (id) => {
    try {
      await PositionService.deletePosition(id);
      message.success("ลบสำเร็จ");
      fetchPositions();
    } catch {
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
      width: 80,
      align: "center",
      // ✅ เพิ่มตรงนี้: ให้กดคลิกเรียงลำดับที่หัวตารางได้ด้วย
      sorter: (a, b) => a.id - b.id,
    },
    { title: "Position Name", dataIndex: "name", width: 200 },
    { title: "Description", dataIndex: "description" },
    {
      title: "Action",
      width: 120,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              size="small"
            />
          </Tooltip>

          <Popconfirm
            title="ยืนยันการลบ?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          Add Position
        </Button>
      </div>

      <Table
        dataSource={positions}
        columns={columns}
        rowKey="id"
        loading={loading}
        variant
      />

      <Modal
        title={editingId ? "Edit Position" : "Add New Position"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="Position Name"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>
            {editingId ? "Update Position" : "Create Position"}
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default PositionManager;
