import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Popconfirm,
  message,
  Switch,
  Tag,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import ExternalLabService from "../services/externalLabService";

const ExternalLabManager = () => {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState(null);
  const [form] = Form.useForm();

  const fetchLabs = async () => {
    setLoading(true);
    try {
      const data = await ExternalLabService.getExternalLabs(false);
      setLabs(data || []);
    } catch (error) {
      console.error("Fetch external labs error:", error);
      message.error("ไม่สามารถดึงข้อมูลสถานพยาบาล/แล็บปลายทางได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabs();
  }, []);

  const showModal = (record = null) => {
    setEditingLab(record);
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingLab(null);
    form.resetFields();
  };

  const handleSubmit = async (values) => {
    try {
      if (editingLab) {
        await ExternalLabService.updateExternalLab(editingLab.id, values);
        message.success("แก้ไขข้อมูลสถานพยาบาล/แล็บเรียบร้อยแล้ว");
      } else {
        await ExternalLabService.createExternalLab(values);
        message.success("เพิ่มสถานพยาบาล/แล็บเรียบร้อยแล้ว");
      }
      handleCancel();
      fetchLabs();
    } catch (error) {
      console.error("Save error:", error);
      message.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleToggleActive = async (checked, record) => {
    try {
      await ExternalLabService.updateExternalLab(record.id, { is_active: checked });
      message.success(`เปลี่ยนสถานะเป็น ${checked ? "เปิดใช้งาน" : "ยกเลิกการใช้งาน"} แล้ว`);
      fetchLabs();
    } catch (error) {
      console.error("Toggle active error:", error);
      message.error("เกิดข้อผิดพลาดในการเปลี่ยนสถานะ");
    }
  };

  const handleDelete = async (id) => {
    try {
      await ExternalLabService.deleteExternalLab(id);
      message.success("ลบข้อมูลเรียบร้อยแล้ว");
      fetchLabs();
    } catch (error) {
      console.error("Delete error:", error);
      message.error("เกิดข้อผิดพลาดในการลบข้อมูล (อาจมีการใช้งานข้อมูลนี้อยู่)");
    }
  };

  const columns = [
    {
      title: "ชื่อสถานพยาบาล/แล็บ",
      dataIndex: "name",
      key: "name",
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: "รายละเอียด",
      dataIndex: "description",
      key: "description",
      render: (text) => text || "-",
    },
    {
      title: "สถานะ",
      dataIndex: "is_active",
      key: "is_active",
      render: (isActive, record) => (
        <Switch
          checked={isActive}
          onChange={(checked) => handleToggleActive(checked, record)}
          checkedChildren="เปิดใช้งาน"
          unCheckedChildren="ปิดใช้งาน"
        />
      ),
    },
    {
      title: "จัดการ",
      key: "action",
      width: 150,
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<EditOutlined style={{ color: "#1890ff" }} />}
            onClick={() => showModal(record)}
          />
          <Popconfirm
            title="ยืนยันการลบ?"
            description="คุณต้องการลบข้อมูลนี้หรือไม่?"
            onConfirm={() => handleDelete(record.id)}
            okText="ลบ"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => showModal()}
        >
          เพิ่มสถานพยาบาล/แล็บ
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={labs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={editingLab ? "แก้ไขสถานพยาบาล/แล็บ" : "เพิ่มสถานพยาบาล/แล็บ"}
        open={isModalOpen}
        onCancel={handleCancel}
        onOk={() => form.submit()}
        okText="บันทึก"
        cancelText="ยกเลิก"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="ชื่อสถานพยาบาล/แล็บ"
            rules={[{ required: true, message: "กรุณากรอกชื่อสถานพยาบาล/แล็บ" }]}
          >
            <Input placeholder="เช่น N Health, ศูนย์จีโนมิกส์" />
          </Form.Item>

          <Form.Item name="description" label="รายละเอียดเพิ่มเติม (ถ้ามี)">
            <Input.TextArea rows={3} placeholder="คำอธิบาย..." />
          </Form.Item>
          
          {editingLab && (
            <Form.Item name="is_active" label="สถานะการใช้งาน" valuePropName="checked">
              <Switch checkedChildren="เปิดใช้งาน" unCheckedChildren="ปิดใช้งาน" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default ExternalLabManager;
