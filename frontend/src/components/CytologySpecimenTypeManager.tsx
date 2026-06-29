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
  Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import SpecimenTemplateService, {
  SpecimenTemplate,
  SpecimenCategory,
} from "../services/specimenTemplateService";
import logger from "../utils/logger";

interface PanelProps {
  category: SpecimenCategory;
}

const CategoryPanel: React.FC<PanelProps> = ({ category }) => {
  const [items, setItems] = useState<SpecimenTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<{ name: string }>();

  const fetch = async () => {
    setLoading(true);
    try {
      setItems(await SpecimenTemplateService.getTemplates(category));
    } catch (err) {
      logger.error(err);
      message.error("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [category]);

  const openAdd = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEdit = (item: SpecimenTemplate) => {
    setEditingId(item.id);
    form.setFieldsValue({ name: item.name });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: { name: string }) => {
    try {
      if (editingId) {
        await SpecimenTemplateService.updateTemplate(editingId, { ...values, category });
        message.success("Updated");
      } else {
        await SpecimenTemplateService.createTemplate({ ...values, category });
        message.success("Added");
      }
      setIsModalOpen(false);
      fetch();
    } catch {
      message.error("Failed to save");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await SpecimenTemplateService.deleteTemplate(id);
      message.success("Deleted");
      fetch();
    } catch {
      message.error("Failed to delete");
    }
  };

  const columns: ColumnsType<SpecimenTemplate> = [
    {
      title: "Specimen Type",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Action",
      key: "action",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="Delete this specimen type?"
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add Specimen Type
        </Button>
      </div>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} types` }}
        bordered
        size="small"
      />

      <Modal
        title={editingId ? "Edit Specimen Type" : "Add Specimen Type"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        okText={editingId ? "Save" : "Add"}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. Conventional, Liquid Based (LBC)" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

const CytologySpecimenTypeManager: React.FC = () => (
  <Tabs
    type="card"
    items={[
      {
        key: "gyne_cyto",
        label: "Gyne Cytology",
        children: <CategoryPanel category="gyne_cyto" />,
      },
      {
        key: "nongyne_cyto",
        label: "Non-Gyne Cytology",
        children: <CategoryPanel category="nongyne_cyto" />,
      },
    ]}
  />
);

export default CytologySpecimenTypeManager;
