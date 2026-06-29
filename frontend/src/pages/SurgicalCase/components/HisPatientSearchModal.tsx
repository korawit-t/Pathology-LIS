import React, { useState } from "react";
import {
  Drawer,
  Form,
  Input,
  DatePicker,
  Button,
  Table,
  Space,
  message,
  Tag,
  Typography,
  Row,
  Col,
  Checkbox,
} from "antd";
import {
  SearchOutlined,
  CloudDownloadOutlined,
  ManOutlined,
  WomanOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import HisService, { HisPatientResult } from "../../../services/hisService";

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface HisPatientSearchModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (record: HisPatientResult) => void;
  caseType?: string;
}

const HisPatientSearchModal: React.FC<HisPatientSearchModalProps> = ({
  open,
  onCancel,
  onSelect,
  caseType = "surgical",
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<HisPatientResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [useDateFilter, setUseDateFilter] = useState(true);

  const handleSearch = async () => {
    try {
      const values = form.getFieldsValue();
      setLoading(true);
      setHasSearched(true);

      const hn = values.hn?.trim() || undefined;
      const dateRange = values.date_range;
      const params: Record<string, string | undefined> = {
        hn,
        case_type: caseType,
      };
      if (useDateFilter) {
        params.date_start = dateRange?.[0]
          ? dateRange[0].format("YYYY-MM-DD")
          : dayjs().format("YYYY-MM-DD");
        params.date_end = dateRange?.[1]
          ? dateRange[1].format("YYYY-MM-DD")
          : dayjs().format("YYYY-MM-DD");
      }

      const data = await HisService.searchPatients(params);
      setResults(data);

      if (data.length === 0) {
        message.info("ไม่พบข้อมูลในระบบ HIS");
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || "ไม่สามารถเชื่อมต่อระบบ HIS ได้";
      message.error(detail);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (record: HisPatientResult) => {
    onSelect(record);
    message.success(
      `เลือกข้อมูล: ${record.pname}${record.fname} ${record.lname} (HN: ${record.hn})`
    );
    onCancel();
  };

  const handleClear = () => {
    setResults([]);
    setHasSearched(false);
    setUseDateFilter(true);
    form.resetFields();
  };

  const columns: ColumnsType<HisPatientResult> = [
    {
      title: "#",
      key: "index",
      width: 50,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 100,
      render: (hn: string) => <Tag color="blue">{hn}</Tag>,
    },
    {
      title: "VN",
      dataIndex: "vn",
      key: "vn",
      width: 100,
    },
    {
      title: "AN",
      dataIndex: "an",
      key: "an",
      width: 120,
    },
    {
      title: "ชื่อ - นามสกุล",
      key: "fullname",
      width: 200,
      render: (_: unknown, record: HisPatientResult) => (
        <Text strong>
          {record.pname}
          {record.fname} {record.lname}
        </Text>
      ),
    },
    {
      title: "เพศ",
      dataIndex: "gender",
      key: "gender",
      width: 70,
      render: (gender: string, record: HisPatientResult) => {
        const code = record.gender_code;
        if (code === 1)
          return (
            <Tag color="blue" icon={<ManOutlined />}>
              {gender}
            </Tag>
          );
        if (code === 2)
          return (
            <Tag color="magenta" icon={<WomanOutlined />}>
              {gender}
            </Tag>
          );
        return <Tag>{gender || "-"}</Tag>;
      },
    },
    {
      title: "วันเกิด",
      dataIndex: "birthday",
      key: "birthday",
      width: 110,
      render: (v: string) => {
        if (!v) return "-";
        const d = dayjs(v.split(" ")[0]);
        return d.isValid() ? d.format("DD/MM/YYYY") : v;
      },
    },
    {
      title: "อายุ",
      dataIndex: "age",
      key: "age",
      width: 60,
      render: (age: number | null) => (age !== null ? `${age} ปี` : "-"),
    },
    {
      title: "CID",
      dataIndex: "cid",
      key: "cid",
      width: 140,
    },
    {
      title: "Form",
      dataIndex: "form_name",
      key: "form_name",
      width: 100,
    },
    {
      title: "Order Date",
      dataIndex: "order_date",
      key: "order_date",
      width: 150,
      render: (date: string) => {
        if (!date) return "-";
        const d = dayjs(date);
        return d.isValid() ? d.format("DD/MM/YYYY HH:mm") : date;
      },
    },
    {
      title: "แพทย์",
      dataIndex: "doctor",
      key: "doctor",
      width: 150,
      ellipsis: true,
    },
    {
      title: "แผนก",
      dataIndex: "department",
      key: "department",
      width: 120,
      ellipsis: true,
    },
    {
      title: "Lab Order",
      dataIndex: "lab_order_number",
      key: "lab_order_number",
      width: 120,
      render: (v: string) =>
        v ? <Tag color="geekblue">{v}</Tag> : "-",
    },
    {
      title: "สิทธิ์",
      dataIndex: "pttype",
      key: "pttype",
      width: 300,
      ellipsis: true,
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <CloudDownloadOutlined style={{ color: "#1d39c4" }} />
          <span>ค้นหาข้อมูลผู้ป่วยจากระบบ HIS</span>
        </Space>
      }
      open={open}
      onClose={onCancel}
      styles={{ body: { padding: "16px" }, wrapper: { width: "80vw" } }}
    >
      {/* Search Form */}
      <Form
        form={form}
        layout="inline"
        style={{
          marginBottom: 16,
          padding: "16px",
          background: "#f0f5ff",
          borderRadius: 8,
          border: "1px solid #d6e4ff",
        }}
        initialValues={{
          date_range: [dayjs(), dayjs()],
        }}
      >
        <Form.Item name="hn" label="HN">
          <Input
            placeholder="เลขที่ HN"
            style={{ width: 150 }}
            allowClear
            onPressEnter={handleSearch}
          />
        </Form.Item>
        <Form.Item label="ช่วงวันที่สั่ง">
          <Space>
            <Checkbox
              checked={useDateFilter}
              onChange={(e) => setUseDateFilter(e.target.checked)}
            />
            <Form.Item name="date_range" noStyle>
              <RangePicker format="YYYY-MM-DD" disabled={!useDateFilter} />
            </Form.Item>
          </Space>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
            >
              ค้นหา
            </Button>
            {hasSearched && (
              <Button icon={<ClearOutlined />} onClick={handleClear}>
                ล้าง
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>

      {/* Results Table */}
      <Table
        columns={columns}
        dataSource={results}
        rowKey={(record) =>
          `${record.hn}-${record.lab_order_number}-${record.order_date}`
        }
        loading={loading}
        size="small"
        scroll={{ x: 1400, y: "calc(100vh - 280px)" }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `พบ ${total} รายการ`,
        }}
        locale={{
          emptyText: hasSearched
            ? "ไม่พบข้อมูลในระบบ HIS"
            : "กรุณากดค้นหาเพื่อดึงข้อมูลจาก HIS",
        }}
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          style: { cursor: "pointer" },
        })}
        rowClassName={() => "his-patient-row"}
      />

      <style>{`
        .his-patient-row:hover {
          background-color: #e6f7ff !important;
        }
      `}</style>
    </Drawer>
  );
};

export default HisPatientSearchModal;
