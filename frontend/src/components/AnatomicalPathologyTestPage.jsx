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
} from "antd";
import { ExperimentOutlined, PlusOutlined } from "@ant-design/icons";
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
      message.success("ลบสำเร็จ");
      loadData();
    } catch (err) {
      console.error(err);
      message.error("ลบไม่สำเร็จ");
    }
  };

  const openIHCOptions = async (record) => {
    setIhcTestId(record.id);
    setIhcTestName(record.name);
    setIhcOptionsLoading(true);
    setIhcOptionsOpen(true);
    setIhcAddVisible(false);
    ihcAddForm.resetFields();
    try {
      const opts = await IHCService.getOptions(record.id);
      setIhcOptions(opts);
    } catch {
      message.error("โหลด IHC options ไม่สำเร็จ");
    } finally {
      setIhcOptionsLoading(false);
    }
  };

  const handleIHCAddOption = async () => {
    try {
      const values = await ihcAddForm.validateFields();
      await IHCService.createOption(ihcTestId, { ...values, ap_test_id: ihcTestId, display_order: ihcOptions.length });
      message.success("เพิ่ม option สำเร็จ");
      ihcAddForm.resetFields();
      setIhcAddVisible(false);
      const opts = await IHCService.getOptions(ihcTestId);
      setIhcOptions(opts);
    } catch {
      message.error("เพิ่ม option ไม่สำเร็จ");
    }
  };

  const handleIHCDeleteOption = async (optionId) => {
    try {
      await IHCService.deleteOption(optionId);
      message.success("ลบ option สำเร็จ");
      const opts = await IHCService.getOptions(ihcTestId);
      setIhcOptions(opts);
    } catch {
      message.error("ลบ option ไม่สำเร็จ");
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
            แก้ไข
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
          <Popconfirm title="ยืนยันการลบ?" onConfirm={() => handleDelete(record.id)}>
            <Button danger size="small">ลบ</Button>
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
        width={640}
        destroyOnHidden
      >
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
              width: 60,
              render: (_, opt) => (
                <Popconfirm title="ลบ option นี้?" onConfirm={() => handleIHCDeleteOption(opt.id)}>
                  <Button danger size="small">ลบ</Button>
                </Popconfirm>
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
              <Button type="primary" htmlType="submit" size="small">บันทึก</Button>
              <Button size="small" onClick={() => { setIhcAddVisible(false); ihcAddForm.resetFields(); }}>ยกเลิก</Button>
            </Space>
          </Form>
        )}
      </Modal>

      <Modal
        title={editingId ? "แก้ไขรายการตรวจ" : "เพิ่มรายการตรวจ"}
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
