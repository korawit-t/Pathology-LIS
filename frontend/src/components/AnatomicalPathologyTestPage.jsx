import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  message,
  Switch,
  Tag,
  Divider,
  Tabs,
  Badge,
  Row,
  Col,
  Typography,
} from "antd";
import { ExperimentOutlined, PlusOutlined } from "@ant-design/icons";

const { Text } = Typography;
import AnatomicalPathologyTestService from "../services/anatomicalTestService";
import ExternalLabService from "../services/externalLabService";
import { IHCService } from "../services/ihcService";
import { TEST_CATEGORY_OPTIONS } from "../constants/lab.constants";


const AnatomicalPathologyTestPage = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [externalLabs, setExternalLabs] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isExternalWatch, setIsExternalWatch] = useState(false);
  const [categoryWatch, setCategoryWatch] = useState(null);

  const [ihcOptionsOpen, setIhcOptionsOpen] = useState(false);
  const [ihcTestId, setIhcTestId] = useState(null);
  const [ihcTestName, setIhcTestName] = useState("");
  const [ihcOptions, setIhcOptions] = useState([]);
  const [ihcOptionsLoading, setIhcOptionsLoading] = useState(false);
  const [ihcAddForm] = Form.useForm();
  const [ihcAddVisible, setIhcAddVisible] = useState(false);
  const [ihcEditingOptionId, setIhcEditingOptionId] = useState(null);

  const [ihcExtraFields, setIhcExtraFields] = useState([]);
  const [ihcExtraFieldsLoading, setIhcExtraFieldsLoading] = useState(false);
  const [ihcExtraFieldAddForm] = Form.useForm();
  const [ihcExtraFieldAddVisible, setIhcExtraFieldAddVisible] = useState(false);
  const [ihcEditingFieldId, setIhcEditingFieldId] = useState(null);
  const [ihcExtraFieldOptionsFieldId, setIhcExtraFieldOptionsFieldId] = useState(null);
  const [ihcExtraFieldOptionAddForm] = Form.useForm();
  const [ihcExtraFieldOptionAddVisible, setIhcExtraFieldOptionAddVisible] = useState(false);
  const [ihcEditingFieldOptionId, setIhcEditingFieldOptionId] = useState(null);

  // Preview-only state (left column of the IHC Options modal) — lets admins see
  // exactly what pathologists will click on, without persisting anywhere.
  const [previewSelected, setPreviewSelected] = useState(null);
  const [previewNumeric, setPreviewNumeric] = useState(null);
  const [previewExtraValues, setPreviewExtraValues] = useState({});

  const [activeTab, setActiveTab] = useState("All");
  const [searchText, setSearchText] = useState("");

  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await AnatomicalPathologyTestService.getAllTests();
      setData(res.data);
    } catch (err) {
      console.error(err);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const loadExternalLabs = async () => {
    try {
      const labs = await ExternalLabService.getExternalLabs(true);
      setExternalLabs(labs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    loadExternalLabs();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setIsExternalWatch(false);
    setCategoryWatch(null);
    form.resetFields();
    form.setFieldsValue({ is_external: false });
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingId(record.id);
    setIsExternalWatch(!!record.is_external);
    setCategoryWatch(record.category ?? null);
    form.setFieldsValue({
      ...record,
      outlab_id: record.outlab?.id ?? record.outlab_id ?? null,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!values.is_external) values.outlab_id = null;
      if (values.category !== "Surgical Pathology") values.specimen_complexity = null;

      if (editingId) {
        await AnatomicalPathologyTestService.updateTest(editingId, values);
        message.success("อัปเดตสำเร็จ");
      } else {
        await AnatomicalPathologyTestService.createTest(values);
        message.success("เพิ่มข้อมูลสำเร็จ");
      }

      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      message.error("บันทึกข้อมูลไม่สำเร็จ");
    }
  };

  const handleDelete = async (id) => {
    try {
      await AnatomicalPathologyTestService.deleteTest(id);
      message.success("Deleted successfully");
      loadData();
    } catch (err) {
      console.error(err);
      message.error("Failed to delete");
    }
  };

  const openIHCOptions = async (record) => {
    setIhcTestId(record.id);
    setIhcTestName(record.name);
    setIhcOptionsLoading(true);
    setIhcOptionsOpen(true);
    setIhcAddVisible(false);
    setIhcEditingOptionId(null);
    ihcAddForm.resetFields();
    setIhcExtraFieldAddVisible(false);
    setIhcEditingFieldId(null);
    ihcExtraFieldAddForm.resetFields();
    setIhcExtraFieldOptionsFieldId(null);
    setPreviewSelected(null);
    setPreviewNumeric(null);
    setPreviewExtraValues({});
    try {
      const opts = await IHCService.getOptions(record.id);
      setIhcOptions(opts);
    } catch {
      message.error("โหลด IHC options ไม่สำเร็จ");
    } finally {
      setIhcOptionsLoading(false);
    }
    await loadIhcExtraFields(record.id);
  };

  const openEditIHCOption = (opt) => {
    setIhcEditingOptionId(opt.id);
    ihcAddForm.setFieldsValue(opt);
    setIhcAddVisible(true);
  };

  const closeIHCOptionForm = () => {
    setIhcAddVisible(false);
    setIhcEditingOptionId(null);
    ihcAddForm.resetFields();
  };

  const handleIHCAddOption = async () => {
    try {
      const values = await ihcAddForm.validateFields();
      if (ihcEditingOptionId) {
        await IHCService.updateOption(ihcEditingOptionId, values);
        message.success("Option updated successfully");
      } else {
        await IHCService.createOption(ihcTestId, { ...values, ap_test_id: ihcTestId, display_order: ihcOptions.length });
        message.success("เพิ่ม option สำเร็จ");
      }
      closeIHCOptionForm();
      const opts = await IHCService.getOptions(ihcTestId);
      setIhcOptions(opts);
    } catch {
      message.error(ihcEditingOptionId ? "Failed to update option" : "เพิ่ม option ไม่สำเร็จ");
    }
  };

  const handleIHCDeleteOption = async (optionId) => {
    try {
      await IHCService.deleteOption(optionId);
      message.success("Option deleted successfully");
      const opts = await IHCService.getOptions(ihcTestId);
      setIhcOptions(opts);
    } catch {
      message.error("Failed to delete option");
    }
  };

  // ── IHC Extra Fields (additive fields beyond the primary option, e.g. Intensity) ──

  const loadIhcExtraFields = async (apTestId) => {
    setIhcExtraFieldsLoading(true);
    try {
      const fields = await IHCService.getExtraFields(apTestId);
      setIhcExtraFields(fields);
    } catch {
      message.error("โหลด Extra Fields ไม่สำเร็จ");
    } finally {
      setIhcExtraFieldsLoading(false);
    }
  };

  const openEditExtraField = (field) => {
    setIhcEditingFieldId(field.id);
    ihcExtraFieldAddForm.setFieldsValue(field);
    setIhcExtraFieldAddVisible(true);
  };

  const closeExtraFieldForm = () => {
    setIhcExtraFieldAddVisible(false);
    setIhcEditingFieldId(null);
    ihcExtraFieldAddForm.resetFields();
  };

  const handleIHCAddExtraField = async () => {
    try {
      const values = await ihcExtraFieldAddForm.validateFields();
      if (ihcEditingFieldId) {
        await IHCService.updateExtraField(ihcEditingFieldId, values);
        message.success("Extra Field updated successfully");
      } else {
        await IHCService.createExtraField(ihcTestId, {
          ...values,
          ap_test_id: ihcTestId,
          display_order: ihcExtraFields.length,
        });
        message.success("เพิ่ม Extra Field สำเร็จ");
      }
      closeExtraFieldForm();
      loadIhcExtraFields(ihcTestId);
    } catch {
      message.error(ihcEditingFieldId ? "Failed to update Extra Field" : "เพิ่ม Extra Field ไม่สำเร็จ");
    }
  };

  const handleIHCDeleteExtraField = async (fieldId) => {
    try {
      await IHCService.deleteExtraField(fieldId);
      message.success("Extra Field deleted successfully");
      loadIhcExtraFields(ihcTestId);
    } catch {
      message.error("Failed to delete Extra Field");
    }
  };

  const openEditExtraFieldOption = (opt) => {
    setIhcEditingFieldOptionId(opt.id);
    ihcExtraFieldOptionAddForm.setFieldsValue(opt);
    setIhcExtraFieldOptionAddVisible(true);
  };

  const closeExtraFieldOptionForm = () => {
    setIhcExtraFieldOptionAddVisible(false);
    setIhcEditingFieldOptionId(null);
    ihcExtraFieldOptionAddForm.resetFields();
  };

  const handleAddExtraFieldOption = async () => {
    try {
      const values = await ihcExtraFieldOptionAddForm.validateFields();
      if (ihcEditingFieldOptionId) {
        await IHCService.updateExtraFieldOption(ihcEditingFieldOptionId, values);
        message.success("Option updated successfully");
      } else {
        const field = ihcExtraFields.find((f) => f.id === ihcExtraFieldOptionsFieldId);
        await IHCService.createExtraFieldOption(ihcExtraFieldOptionsFieldId, {
          ...values,
          display_order: field?.options?.length ?? 0,
        });
        message.success("เพิ่ม Option สำเร็จ");
      }
      closeExtraFieldOptionForm();
      loadIhcExtraFields(ihcTestId);
    } catch {
      message.error(ihcEditingFieldOptionId ? "Failed to update option" : "เพิ่ม Option ไม่สำเร็จ");
    }
  };

  const handleDeleteExtraFieldOption = async (optionId) => {
    try {
      await IHCService.deleteExtraFieldOption(optionId);
      message.success("Option deleted successfully");
      loadIhcExtraFields(ihcTestId);
    } catch {
      message.error("Failed to delete option");
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "Code", dataIndex: "code", width: 110 },
    { title: "ชื่อการตรวจ", dataIndex: "name", width: 220 },
    { title: "ประเภทแลป", dataIndex: "category", width: 130 },
    {
      title: "ขนาด Specimen",
      dataIndex: "specimen_complexity",
      width: 120,
      render: (v) => {
        if (!v) return "-";
        const map = { small: "Small", medium: "Medium", large: "Large" };
        const color = { small: "green", medium: "gold", large: "volcano" };
        return <Tag color={color[v]}>{map[v] ?? v}</Tag>;
      },
    },
    {
      title: "แล็บนอก",
      dataIndex: "is_external",
      width: 90,
      render: (v) => (v ? <Tag color="orange">ใช่</Tag> : "ไม่ใช่"),
    },
    {
      title: "Outlab",
      key: "outlab",
      width: 160,
      render: (_, record) =>
        record.outlab?.name ? (
          <Tag color="geekblue">{record.outlab.name}</Tag>
        ) : (
          "-"
        ),
    },
    {
      title: "ราคา รัฐ",
      dataIndex: "price_tier_1",
      width: 110,
      render: (v) => v?.toLocaleString(),
    },
    {
      title: "ราคา เอกชน",
      dataIndex: "price_tier_2",
      width: 110,
      render: (v) => v?.toLocaleString(),
    },
    {
      title: "ราคา",
      dataIndex: "price_tier_3",
      width: 110,
      render: (v) => v?.toLocaleString(),
    },
    {
      title: "จัดการ",
      width: 220,
      render: (_, record) => (
        <Space>
          <Button type="primary" size="small" onClick={() => openEditModal(record)}>
            Edit
          </Button>
          {record.category === "IHC" && (
            <Button
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => openIHCOptions(record)}
            >
              Options
            </Button>
          )}
          <Popconfirm title="Confirm delete?" onConfirm={() => handleDelete(record.id)}>
            <Button danger size="small">Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const searchFiltered = searchText.trim()
    ? data.filter((r) =>
        r.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        r.code?.toLowerCase().includes(searchText.toLowerCase())
      )
    : data;

  const tabItems = [
    { key: "All", label: <Badge count={searchFiltered.length} size="small" offset={[6, -2]} color="blue"><span style={{ paddingRight: 14 }}>All</span></Badge> },
    ...TEST_CATEGORY_OPTIONS.map(({ value, label }) => {
      const count = searchFiltered.filter((r) => r.category === value).length;
      return {
        key: value,
        label: <Badge count={count} size="small" offset={[6, -2]} color={value === "IHC" ? "purple" : "default"}><span style={{ paddingRight: 14 }}>{label.split(" (")[0]}</span></Badge>,
      };
    }),
  ];

  const displayedData = activeTab === "All" ? searchFiltered : searchFiltered.filter((r) => r.category === activeTab);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, margin: 0 }}>Anatomical Pathology Test Items</h2>
        <Space>
          <Input.Search
            placeholder="ค้นหาชื่อหรือรหัสการตรวจ..."
            allowClear
            style={{ width: 280 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button type="primary" onClick={openCreateModal}>+ เพิ่มรายการตรวจ</Button>
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginBottom: 8 }} />

      <Table
        columns={columns}
        dataSource={displayedData}
        rowKey="id"
        loading={loading}
        bordered
        scroll={{ x: 1100 }}
      />

      {/* IHC Options Modal */}
      <Modal
        title={
          <Space>
            <ExperimentOutlined style={{ color: "#722ed1" }} />
            <span>IHC Options — {ihcTestName}</span>
          </Space>
        }
        open={ihcOptionsOpen}
        onCancel={() => setIhcOptionsOpen(false)}
        footer={null}
        width={1040}
        destroyOnHidden
      >
        <Row gutter={24}>
          <Col span={15}>
        <Table
          size="small"
          loading={ihcOptionsLoading}
          dataSource={ihcOptions}
          rowKey="id"
          pagination={false}
          columns={[
            { title: "Label", dataIndex: "option_label", width: 160 },
            { title: "Value", dataIndex: "option_value", width: 120 },
            { title: "Has Numeric", dataIndex: "has_numeric", width: 100, render: (v) => v ?? "-" },
            { title: "Unit", dataIndex: "numeric_unit", width: 80, render: (v) => v ?? "-" },
            { title: "Order", dataIndex: "display_order", width: 60 },
            {
              title: "",
              width: 120,
              render: (_, opt) => (
                <Space>
                  <Button size="small" onClick={() => openEditIHCOption(opt)}>Edit</Button>
                  <Popconfirm title="Delete this option?" onConfirm={() => handleIHCDeleteOption(opt.id)}>
                    <Button danger size="small">Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />

        <Divider />

        {!ihcAddVisible ? (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setIhcAddVisible(true)}
            block
          >
            เพิ่ม Option
          </Button>
        ) : (
          <Form form={ihcAddForm} layout="vertical" onFinish={handleIHCAddOption}>
            <Space style={{ width: "100%" }} align="start">
              <Form.Item name="option_label" label="Label" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. Positive" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="option_value" label="Value" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. positive" style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="has_numeric" label="Has Numeric" style={{ marginBottom: 0 }}>
                <Select
                  allowClear
                  placeholder="none"
                  style={{ width: 100 }}
                  options={[
                    { value: "%", label: "%" },
                    { value: "score", label: "Score" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="numeric_unit" label="Unit" style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. %" style={{ width: 80 }} />
              </Form.Item>
            </Space>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" htmlType="submit" size="small">
                {ihcEditingOptionId ? "Save Changes" : "บันทึก"}
              </Button>
              <Button size="small" onClick={closeIHCOptionForm}>ยกเลิก</Button>
            </Space>
          </Form>
        )}

        <Divider>Extra Fields</Divider>
        <p style={{ color: "#8c8c8c", fontSize: 12, marginTop: -8 }}>
          Fields independent of the option above, e.g. an "Intensity" pick (0/1+/2+/3+) separate from Positive/Negative
        </p>

        <Table
          size="small"
          loading={ihcExtraFieldsLoading}
          dataSource={ihcExtraFields}
          rowKey="id"
          pagination={false}
          columns={[
            { title: "Label", dataIndex: "label", width: 140 },
            { title: "Key", dataIndex: "field_key", width: 100 },
            { title: "Type", dataIndex: "field_type", width: 90 },
            { title: "Unit", dataIndex: "numeric_unit", width: 70, render: (v) => v ?? "-" },
            { title: "Order", dataIndex: "display_order", width: 60 },
            {
              title: "",
              width: 220,
              render: (_, field) => (
                <Space>
                  {field.field_type === "select" && (
                    <Button
                      size="small"
                      onClick={() => {
                        setIhcExtraFieldOptionsFieldId(field.id);
                        setIhcExtraFieldOptionAddVisible(false);
                        setIhcEditingFieldOptionId(null);
                        ihcExtraFieldOptionAddForm.resetFields();
                      }}
                    >
                      Options ({field.options?.length ?? 0})
                    </Button>
                  )}
                  <Button size="small" onClick={() => openEditExtraField(field)}>Edit</Button>
                  <Popconfirm title="Delete this Extra Field?" onConfirm={() => handleIHCDeleteExtraField(field.id)}>
                    <Button danger size="small">Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />

        <Divider />

        {!ihcExtraFieldAddVisible ? (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setIhcExtraFieldAddVisible(true)}
            block
          >
            เพิ่ม Extra Field
          </Button>
        ) : (
          <Form form={ihcExtraFieldAddForm} layout="vertical" onFinish={handleIHCAddExtraField}>
            <Space style={{ width: "100%" }} align="start" wrap>
              <Form.Item name="label" label="Label" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. Intensity" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="field_key" label="Key" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. intensity" style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="field_type" label="Type" rules={[{ required: true }]} initialValue="select" style={{ marginBottom: 0 }}>
                <Select
                  style={{ width: 110 }}
                  options={[
                    { value: "select", label: "Select" },
                    { value: "numeric", label: "Numeric" },
                    { value: "text", label: "Text" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="numeric_unit" label="Unit" style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. %" style={{ width: 80 }} />
              </Form.Item>
            </Space>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" htmlType="submit" size="small">
                {ihcEditingFieldId ? "Save Changes" : "บันทึก"}
              </Button>
              <Button size="small" onClick={closeExtraFieldForm}>ยกเลิก</Button>
            </Space>
          </Form>
        )}
          </Col>

          <Col span={9}>
            <div
              style={{
                position: "sticky",
                top: 0,
                background: "#fafafa",
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Preview — what pathologists will see
              </Text>

              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 13 }}>{ihcTestName}</Text>

                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {ihcOptions.map((opt) => {
                    const isSelected = previewSelected === opt.option_value;
                    return (
                      <Tag
                        key={opt.id}
                        color={isSelected ? "purple" : "default"}
                        style={{
                          cursor: "pointer",
                          fontWeight: isSelected ? 600 : 400,
                          borderStyle: isSelected ? "solid" : "dashed",
                          userSelect: "none",
                        }}
                        onClick={() =>
                          setPreviewSelected((prev) => (prev === opt.option_value ? null : opt.option_value))
                        }
                      >
                        {opt.option_label}
                      </Tag>
                    );
                  })}
                  {(() => {
                    const selectedOpt = ihcOptions.find((o) => o.option_value === previewSelected);
                    return selectedOpt?.has_numeric ? (
                      <Input
                        size="small"
                        placeholder={selectedOpt.numeric_unit ? `e.g. 31-40${selectedOpt.numeric_unit}` : "value"}
                        suffix={selectedOpt.numeric_unit || ""}
                        style={{ width: 120 }}
                        value={previewNumeric ?? ""}
                        onChange={(e) => setPreviewNumeric(e.target.value)}
                      />
                    ) : null;
                  })()}
                </div>

                {ihcExtraFields.map((field) => (
                  <div key={field.id} style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{field.label}:</Text>
                    {field.field_type === "select" &&
                      field.options?.map((opt) => {
                        const isSelected = previewExtraValues[field.id] === opt.option_value;
                        return (
                          <Tag
                            key={opt.id}
                            color={isSelected ? "geekblue" : "default"}
                            style={{
                              cursor: "pointer",
                              fontWeight: isSelected ? 600 : 400,
                              borderStyle: isSelected ? "solid" : "dashed",
                              userSelect: "none",
                            }}
                            onClick={() =>
                              setPreviewExtraValues((prev) => ({
                                ...prev,
                                [field.id]: prev[field.id] === opt.option_value ? null : opt.option_value,
                              }))
                            }
                          >
                            {opt.option_label}
                          </Tag>
                        );
                      })}
                    {field.field_type === "numeric" && (
                      <Input
                        size="small"
                        placeholder={field.numeric_unit ? `e.g. 31-40${field.numeric_unit}` : "value"}
                        suffix={field.numeric_unit || ""}
                        style={{ width: 120 }}
                        value={previewExtraValues[field.id] ?? ""}
                        onChange={(e) =>
                          setPreviewExtraValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                        }
                      />
                    )}
                    {field.field_type === "text" && (
                      <Input
                        size="small"
                        style={{ width: 160 }}
                        value={previewExtraValues[field.id] ?? ""}
                        onChange={(e) =>
                          setPreviewExtraValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                ))}

                {ihcOptions.length === 0 && ihcExtraFields.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Add options or extra fields on the left to preview them here.
                  </Text>
                )}
              </div>
            </div>
          </Col>
        </Row>
      </Modal>

      {/* IHC Extra Field Options Modal (nested — manages options for a single "select"-type extra field) */}
      <Modal
        title={
          <Space>
            <ExperimentOutlined style={{ color: "#722ed1" }} />
            <span>
              Extra Field Options — {ihcExtraFields.find((f) => f.id === ihcExtraFieldOptionsFieldId)?.label}
            </span>
          </Space>
        }
        open={ihcExtraFieldOptionsFieldId != null}
        onCancel={() => {
          setIhcExtraFieldOptionsFieldId(null);
          closeExtraFieldOptionForm();
        }}
        footer={null}
        width={520}
        destroyOnHidden
      >
        <Table
          size="small"
          dataSource={ihcExtraFields.find((f) => f.id === ihcExtraFieldOptionsFieldId)?.options ?? []}
          rowKey="id"
          pagination={false}
          columns={[
            { title: "Label", dataIndex: "option_label", width: 180 },
            { title: "Value", dataIndex: "option_value", width: 140 },
            { title: "Order", dataIndex: "display_order", width: 60 },
            {
              title: "",
              width: 120,
              render: (_, opt) => (
                <Space>
                  <Button size="small" onClick={() => openEditExtraFieldOption(opt)}>Edit</Button>
                  <Popconfirm title="Delete this option?" onConfirm={() => handleDeleteExtraFieldOption(opt.id)}>
                    <Button danger size="small">Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />

        <Divider />

        {!ihcExtraFieldOptionAddVisible ? (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setIhcExtraFieldOptionAddVisible(true)}
            block
          >
            เพิ่ม Option
          </Button>
        ) : (
          <Form form={ihcExtraFieldOptionAddForm} layout="vertical" onFinish={handleAddExtraFieldOption}>
            <Space style={{ width: "100%" }} align="start">
              <Form.Item name="option_label" label="Label" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. 3+ (Strong)" style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="option_value" label="Value" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. 3+" style={{ width: 120 }} />
              </Form.Item>
            </Space>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" htmlType="submit" size="small">
                {ihcEditingFieldOptionId ? "Save Changes" : "บันทึก"}
              </Button>
              <Button size="small" onClick={closeExtraFieldOptionForm}>ยกเลิก</Button>
            </Space>
          </Form>
        )}
      </Modal>

      <Modal
        title={editingId ? "Edit Test Item" : "เพิ่มรายการตรวจ"}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        width={600}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="NHSO Code">
            <Input placeholder="รหัสกรมบัญชีกลาง" />
          </Form.Item>

          <Form.Item
            name="name"
            label="ชื่อการตรวจ"
            rules={[{ required: true, message: "กรุณากรอกชื่อรายการ" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="category"
            label="ประเภทแลป"
            rules={[{ required: true, message: "กรุณาเลือกประเภท" }]}
          >
            <Select
              options={TEST_CATEGORY_OPTIONS}
              onChange={(val) => {
                setCategoryWatch(val);
                if (val !== "Surgical Pathology") {
                  form.setFieldValue("specimen_complexity", null);
                }
              }}
            />
          </Form.Item>

          {categoryWatch === "Surgical Pathology" && (
            <Form.Item
              name="specimen_complexity"
              label="ขนาด Specimen"
              rules={[{ required: true, message: "กรุณาเลือกขนาด specimen" }]}
            >
              <Select
                placeholder="เลือกขนาด..."
                options={[
                  { value: "small", label: "Small — ชิ้นเล็ก" },
                  { value: "medium", label: "Medium — ชิ้นกลาง" },
                  { value: "large", label: "Large — ชิ้นใหญ่" },
                ]}
              />
            </Form.Item>
          )}

          <Form.Item
            name="is_external"
            label="ส่งตรวจภายนอก (Outlab)"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="ใช่"
              unCheckedChildren="ไม่ใช่"
              onChange={(checked) => {
                setIsExternalWatch(checked);
                if (!checked) form.setFieldValue("outlab_id", null);
              }}
            />
          </Form.Item>

          {isExternalWatch && (
            <Form.Item
              name="outlab_id"
              label="แล็บปลายทาง (Outlab)"
              rules={[{ required: true, message: "กรุณาเลือกแล็บปลายทาง" }]}
            >
              <Select
                placeholder="เลือกแล็บปลายทาง..."
                options={externalLabs.map((lab) => ({
                  value: lab.id,
                  label: lab.name,
                }))}
                allowClear
              />
            </Form.Item>
          )}

          <Form.Item
            name="price_tier_1"
            label="ราคา รัฐ"
            rules={[{ required: true, message: "กรุณากรอกราคา" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="price_tier_2"
            label="ราคา เอกชน"
            rules={[{ required: true, message: "กรุณากรอกราคา" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="price_tier_3"
            label="ราคา"
            rules={[{ required: true, message: "กรุณากรอกราคา" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AnatomicalPathologyTestPage;
