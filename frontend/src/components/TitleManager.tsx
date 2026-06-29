import React, { useEffect, useState, useCallback } from "react";
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
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";

// Import types และ service
import TitleService from "../services/titleService";
import { Title, TitlePayload } from "../types/title";
import logger from "../utils/logger";

const TitleManager: React.FC = () => {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<TitlePayload>();

  // 1. Fetch Data
  const fetchTitles = useCallback(async () => {
    setLoading(true);
    try {
      // ⭐ Service ของคุณ return res.data มาแล้ว (เป็น Array เลย)
      const data = await TitleService.getTitles();
      // การ sort ใน TS ต้องระวังเรื่อง mutation แนะนำให้ spread ก่อน
      const sortedData = [...data].sort((a, b) => a.id - b.id);
      setTitles(sortedData);
    } catch (err) {
      logger.error(err);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  // 2. Handle Submit
  const handleSubmit = async (values: TitlePayload) => {
    try {
      if (editingId) {
        // ⭐ เรียกผ่าน TitleService
        await TitleService.updateTitle(editingId, values);
        message.success("แก้ไขสำเร็จ");
      } else {
        // ⭐ เรียกผ่าน TitleService
        await TitleService.createTitle(values);
        message.success("เพิ่มสำเร็จ");
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchTitles();
    } catch (err) {
      logger.error(err);
      message.error("เกิดข้อผิดพลาด (ข้อมูลอาจซ้ำ หรือเซิร์ฟเวอร์มีปัญหา)");
    }
  };

  // 3. Handle Delete
  const handleDelete = async (id: number) => {
    try {
      // ⭐ เรียกผ่าน TitleService
      await TitleService.deleteTitle(id);
      message.success("ลบสำเร็จ");
      fetchTitles();
    } catch (err) {
      logger.error(err);
      message.error("ลบไม่สำเร็จ");
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (record: Title) => {
    setEditingId(record.id);
    form.setFieldsValue({
      title: record.title,
    });
    setIsModalOpen(true);
  };

  // กำหนด Type ให้ Columns เพื่อความปลอดภัย
  const columns: ColumnsType<Title> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 80,
      align: "center",
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: "Title Name",
      dataIndex: "title",
      key: "title",
    },
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
            okText="ใช่"
            cancelText="ไม่"
          >
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          Add Title
        </Button>
      </div>

      <Table
        dataSource={titles}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingId ? "Edit Title" : "Add New Title"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={400}
        destroyOnClose // เคลียร์สถานะ modal เมื่อปิด
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ title: "" }}
        >
          <Form.Item
            name="title"
            label="Title Name"
            rules={[{ required: true, message: "กรุณากรอกคำนำหน้า" }]}
          >
            <Input placeholder="เช่น นาย, นางสาว, Dr." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingId ? "Update" : "Create"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TitleManager;
