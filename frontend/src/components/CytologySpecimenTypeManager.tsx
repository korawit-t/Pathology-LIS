import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Checkbox,
  Tag,
  message,
  Space,
  Popconfirm,
  Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  HolderOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import SpecimenTemplateService, {
  SpecimenTemplate,
  SpecimenCategory,
} from "../services/specimenTemplateService";
import logger from "../utils/logger";

interface PanelProps {
  category: SpecimenCategory;
}

// ── Sortable row ─────────────────────────────────────────────────────────────

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  "data-row-key": number;
}

const SortableRow: React.FC<RowProps> = ({ children, ...props }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props["data-row-key"] });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999, background: "#fafafa" } : {}),
  };

  return (
    <tr {...props} ref={setNodeRef} style={style}>
      {React.Children.map(children, (child) => {
        if ((child as React.ReactElement).key === "sort") {
          return React.cloneElement(child as React.ReactElement<any>, {
            children: (
              <HolderOutlined
                ref={setActivatorNodeRef}
                style={{ cursor: "grab", touchAction: "none", color: "#bfbfbf" }}
                {...attributes}
                {...listeners}
              />
            ),
          });
        }
        return child;
      })}
    </tr>
  );
};

// ── Category panel ───────────────────────────────────────────────────────────

const CategoryPanel: React.FC<PanelProps> = ({ category }) => {
  const [items, setItems] = useState<SpecimenTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<{
    name: string;
    default_slide_count?: number;
    requires_slide_count?: boolean;
    requires_volume?: boolean;
  }>();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
    form.setFieldsValue({
      name: item.name,
      default_slide_count: item.default_slide_count,
      requires_slide_count: item.requires_slide_count,
      requires_volume: item.requires_volume,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: {
    name: string;
    default_slide_count?: number;
    requires_slide_count?: boolean;
    requires_volume?: boolean;
  }) => {
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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      SpecimenTemplateService.reorderTemplates(
        category,
        reordered.map((i) => i.id),
      ).catch(() => message.error("Failed to save new order"));
      return reordered;
    });
  };

  const columns: ColumnsType<SpecimenTemplate> = [
    { key: "sort", width: 32, align: "center" },
    {
      title: "Specimen Type",
      dataIndex: "name",
    },
    ...(category === "nongyne_cyto"
      ? [
          {
            title: "Default Slides",
            dataIndex: "default_slide_count",
            width: 120,
            align: "center" as const,
          },
          {
            title: "Requires Entry",
            key: "requires_entry",
            width: 180,
            align: "center" as const,
            render: (_: unknown, record: SpecimenTemplate) => (
              <Space size={4}>
                {record.requires_slide_count && (
                  <Tag color="orange">Slides</Tag>
                )}
                {record.requires_volume && <Tag color="blue">Volume</Tag>}
              </Space>
            ),
          },
        ]
      : []),
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
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add Specimen Type
        </Button>
        <span style={{ fontSize: 12, color: "#8c8c8c" }}>
          Drag the <HolderOutlined /> handle to reorder
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <Table
            dataSource={items}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, showTotal: (t) => `${t} types` }}
            bordered
            size="small"
            components={{ body: { row: SortableRow } }}
          />
        </SortableContext>
      </DndContext>

      <Modal
        title={editingId ? "Edit Specimen Type" : "Add Specimen Type"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        okText={editingId ? "Save" : "Add"}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            default_slide_count: 1,
            requires_slide_count: false,
            requires_volume: false,
          }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. Conventional, Liquid Based (LBC)" autoFocus />
          </Form.Item>
          {category === "nongyne_cyto" && (
            <>
              <Form.Item
                name="default_slide_count"
                label="Default Number of Slides"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="requires_slide_count" valuePropName="checked">
                <Checkbox>
                  Warn staff to enter Number of Slides at registration
                  (e.g. FNA, where the count varies per case)
                </Checkbox>
              </Form.Item>
              <Form.Item name="requires_volume" valuePropName="checked">
                <Checkbox>
                  Warn staff to enter Received Volume (ml) at registration
                </Checkbox>
              </Form.Item>
            </>
          )}
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
