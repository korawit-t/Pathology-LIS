import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Button,
  DatePicker,
  Select,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  InputNumber,
  Input,
  message,
  Tooltip,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  ReloadOutlined,
  EditOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { exportToCsv } from "../../utils/exportCsv";
import dayjs, { Dayjs } from "dayjs";
import type { TablePaginationConfig } from "antd";
import CytoWorkloadService from "../../services/cytoWorkloadService";
import UserService from "../../services/userService";
import { CytoWorkloadDayStats } from "../../types/cytoWorkload";

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface UserOption {
  value: number;
  label: string;
}

const CytoWorkloadPage: React.FC = () => {
  const today = dayjs();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    today.startOf("month"),
    today,
  ]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [stats, setStats] = useState<CytoWorkloadDayStats[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<CytoWorkloadDayStats | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    UserService.getUsers({ role: "cytotechnologist" }).then((users) => {
      setUserOptions(users.map((u) => ({ value: u.id, label: u.full_name })));
    });
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await CytoWorkloadService.getStats({
        start_date: dateRange[0].format("YYYY-MM-DD"),
        end_date: dateRange[1].format("YYYY-MM-DD"),
        user_ids: selectedUserIds.length ? selectedUserIds : undefined,
      });
      setStats(data);
    } catch {
      message.error("ไม่สามารถโหลดข้อมูล workload ได้");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedUserIds]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const openRecord = (row?: CytoWorkloadDayStats) => {
    setEditRow(row ?? null);
    form.setFieldsValue({
      user_id: row?.user_id ?? undefined,
      work_date: row ? dayjs(row.work_date) : today,
      reading_hours: row?.reading_hours ?? 8,
      note: row?.note ?? "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await CytoWorkloadService.upsertHours({
        user_id: values.user_id,
        work_date: (values.work_date as Dayjs).format("YYYY-MM-DD"),
        reading_hours: values.reading_hours,
        note: values.note || undefined,
      });
      message.success("บันทึกชั่วโมงเรียบร้อยแล้ว");
      setModalOpen(false);
      fetchStats();
    } catch {
      message.error("ไม่สามารถบันทึกได้");
    } finally {
      setSaving(false);
    }
  };

  const compliantCount = stats.filter((s) => s.is_compliant).length;
  const overCount = stats.filter((s) => !s.is_compliant).length;
  const unrecordedCount = stats.filter((s) => s.reading_hours === null).length;

  const columns = [
    {
      title: "วันที่",
      dataIndex: "work_date",
      key: "work_date",
      width: 120,
      render: (v: string) => dayjs(v).format("DD/MM/YYYY"),
      sorter: (a: CytoWorkloadDayStats, b: CytoWorkloadDayStats) =>
        a.work_date.localeCompare(b.work_date),
    },
    {
      title: "นักเซลล์วิทยา",
      dataIndex: "user_full_name",
      key: "user_full_name",
      width: 180,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: "Gyne",
      dataIndex: "gyne_slides",
      key: "gyne_slides",
      width: 80,
      align: "center" as const,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "NonGyne Conv.",
      dataIndex: "nongyne_conv_slides",
      key: "nongyne_conv_slides",
      width: 110,
      align: "center" as const,
      render: (v: number) => <Tag color="purple">{v}</Tag>,
    },
    {
      title: "NonGyne Liquid",
      dataIndex: "nongyne_liquid_slides",
      key: "nongyne_liquid_slides",
      width: 120,
      align: "center" as const,
      render: (v: number) => (
        <Tooltip title="นับเป็น 0.5 unit/slide">
          <Tag color="orange">{v}</Tag>
        </Tooltip>
      ),
    },
    {
      title: "รวม (equiv.)",
      dataIndex: "effective_count",
      key: "effective_count",
      width: 110,
      align: "center" as const,
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: "ชั่วโมงอ่านสไลด์",
      dataIndex: "reading_hours",
      key: "reading_hours",
      width: 130,
      align: "center" as const,
      render: (v: number | null) =>
        v === null ? (
          <Tag color="warning">ยังไม่บันทึก</Tag>
        ) : (
          <Text>{v} ชม.</Text>
        ),
    },
    {
      title: "Limit (สไลด์)",
      dataIndex: "adjusted_limit",
      key: "adjusted_limit",
      width: 110,
      align: "center" as const,
      render: (v: number) => <Text type="secondary">{v}</Text>,
    },
    {
      title: "สถานะ",
      key: "status",
      width: 100,
      align: "center" as const,
      render: (_: unknown, row: CytoWorkloadDayStats) =>
        row.is_compliant ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            ปกติ
          </Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="error">
            เกิน
          </Tag>
        ),
    },
    {
      title: "",
      key: "action",
      width: 60,
      render: (_: unknown, row: CytoWorkloadDayStats) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => openRecord(row)}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD/MM/YYYY"
          presets={[
            { label: "เดือนนี้", value: [today.startOf("month"), today] },
            {
              label: "เดือนที่แล้ว",
              value: [
                today.subtract(1, "month").startOf("month"),
                today.subtract(1, "month").endOf("month"),
              ],
            },
            { label: "3 เดือน", value: [today.subtract(3, "month"), today] },
          ]}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="เลือกนักเซลล์วิทยา (ทั้งหมด)"
          style={{ minWidth: 240 }}
          options={userOptions}
          onChange={setSelectedUserIds}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading}>
          โหลด
        </Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openRecord()}
        >
          บันทึกชั่วโมง
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() =>
            exportToCsv(
              `cyto-workload-${dateRange[0].format("YYYYMMDD")}-${dateRange[1].format("YYYYMMDD")}`,
              stats as unknown as Record<string, unknown>[],
              [
                { header: "วันที่", key: "work_date", render: (v) => v ? String(v).slice(0, 10) : "" },
                { header: "นักเซลล์วิทยา", key: "user_full_name" },
                { header: "Gyne", key: "gyne_slides" },
                { header: "NonGyne Conv.", key: "nongyne_conv_slides" },
                { header: "NonGyne Liquid", key: "nongyne_liquid_slides" },
                { header: "รวม (equiv.)", key: "effective_count" },
                { header: "ชั่วโมงอ่านสไลด์", key: "reading_hours", render: (v) => v === null || v === undefined ? "" : String(v) },
                { header: "Limit (สไลด์)", key: "adjusted_limit" },
                { header: "สถานะ", key: "is_compliant", render: (v) => v ? "ปกติ" : "เกิน" },
                { header: "หมายเหตุ", key: "note", render: (v) => String(v ?? "") },
              ],
            )
          }
        >
          Export CSV
        </Button>
      </Space>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Statistic title="รายการทั้งหมด" value={stats.length} suffix="วัน-คน" />
        </Col>
        <Col>
          <Statistic
            title="ปกติ"
            value={compliantCount}
            valueStyle={{ color: "#52c41a" }}
          />
        </Col>
        <Col>
          <Statistic
            title="เกินกำหนด"
            value={overCount}
            valueStyle={{ color: overCount > 0 ? "#ff4d4f" : undefined }}
          />
        </Col>
        <Col>
          <Statistic
            title="ยังไม่บันทึกชั่วโมง"
            value={unrecordedCount}
            valueStyle={{ color: unrecordedCount > 0 ? "#faad14" : undefined }}
          />
        </Col>
      </Row>

      {/* Table */}
      <Table
        size="middle"
        bordered
        rowKey={(r) => `${r.user_id}-${r.work_date}`}
        columns={columns}
        dataSource={stats}
        loading={loading}
        pagination={{ pageSize: 30, showSizeChanger: false } as TablePaginationConfig}
        rowClassName={(r) =>
          !r.is_compliant ? "ant-table-row-danger" : ""
        }
      />

      {/* Record Hours Modal */}
      <Modal
        title="บันทึกชั่วโมงอ่านสไลด์"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="user_id"
            label="นักเซลล์วิทยา"
            rules={[{ required: true, message: "กรุณาเลือกนักเซลล์วิทยา" }]}
          >
            <Select options={userOptions} placeholder="เลือกนักเซลล์วิทยา" />
          </Form.Item>
          <Form.Item
            name="work_date"
            label="วันที่ปฏิบัติงาน"
            rules={[{ required: true, message: "กรุณาเลือกวันที่" }]}
          >
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            name="reading_hours"
            label="จำนวนชั่วโมงอ่านสไลด์จริง"
            rules={[{ required: true, message: "กรุณาระบุชั่วโมง" }]}
            extra="มาตรฐาน ≥ 8 ชม./วัน — ถ้าน้อยกว่า 8 ชม. จำนวนสไลด์สูงสุดจะลดตามสัดส่วน"
          >
            <InputNumber
              min={0}
              max={24}
              step={0.5}
              style={{ width: "100%" }}
              addonAfter="ชม."
            />
          </Form.Item>
          <Form.Item name="note" label="หมายเหตุ">
            <Input.TextArea rows={2} placeholder="เช่น ทำงานธุรการ 2 ชม." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CytoWorkloadPage;
