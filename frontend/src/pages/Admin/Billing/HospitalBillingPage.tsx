import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Select,
  DatePicker,
  Typography,
  Space,
  message,
  Tag,
} from "antd";
import { SearchOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import HospitalService from "../../../services/hospitalService";
import { Hospital } from "../../../types/hospital";
import logger from "../../../utils/logger";

interface BillingDetail {
  category?: string;
  test_name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
}

interface BillingItem {
  case_id?: number;
  accession_no?: string;
  hn?: string;
  patient_name?: string;
  registered_at?: string;
  status?: string;
  grand_total?: number;
  items?: BillingDetail[];
}

const { Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const HospitalBillingPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  
  // Filters
  const [selectedHospital, setSelectedHospital] = useState<number | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);

  // Data
  const [items, setItems] = useState<BillingItem[]>([]);
  const [totalCases, setTotalCases] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);

  useEffect(() => {
    fetchHospitals();
  }, []);

  const fetchHospitals = async () => {
    try {
      const res = await HospitalService.getHospitals();
      setHospitals(res);
    } catch (error) {
      logger.error("Failed to fetch hospitals:", error);
      message.error("ไม่สามารถดึงข้อมูลโรงพยาบาลได้");
    }
  };

  const handleSearch = async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.warning("กรุณาเลือกช่วงเวลา");
      return;
    }

    setLoading(true);
    try {
      const startDateStr = dateRange[0].format("YYYY-MM-DDTHH:mm:ss");
      const endDateStr = dateRange[1].format("YYYY-MM-DDTHH:mm:ss");

      const res = await SurgicalCaseService.getHospitalBillingSummary(
        startDateStr,
        endDateStr,
        selectedHospital
      ) as { items: BillingItem[]; total_cases: number; all_cases_grand_total: number };
      
      setItems(res.items);
      setTotalCases(res.total_cases);
      setGrandTotal(res.all_cases_grand_total);
    } catch (error) {
      logger.error("Failed to fetch billing summary:", error);
      message.error("ไม่สามารถดึงข้อมูลสรุปค่าใช้จ่ายได้");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.warning("กรุณาเลือกช่วงเวลา");
      return;
    }

    setExportLoading(true);
    try {
      const startDateStr = dateRange[0].format("YYYY-MM-DDTHH:mm:ss");
      const endDateStr = dateRange[1].format("YYYY-MM-DDTHH:mm:ss");
      const fileName = `hospital_billing_${dayjs().format("YYYYMMDD_HHmm")}.pdf`;

      await SurgicalCaseService.downloadHospitalBillingSummaryPdf(
        startDateStr,
        endDateStr,
        selectedHospital,
        fileName
      );
      message.success("ดาวน์โหลดไฟล์ PDF สำเร็จ");
    } catch (error) {
      logger.error("Failed to export PDF:", error);
      message.error("ไม่สามารถดาวน์โหลดไฟล์ PDF ได้");
    } finally {
      setExportLoading(false);
    }
  };

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
    },
    {
      title: "Patient Name",
      dataIndex: "patient_name",
      key: "patient_name",
    },
    {
      title: "Registered Date",
      dataIndex: "registered_at",
      key: "registered_at",
      render: (val: string) => dayjs(val).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const color =
          status === "completed"
            ? "green"
            : status === "cancelled"
            ? "red"
            : "blue";
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: "Total Cost",
      dataIndex: "grand_total",
      key: "grand_total",
      align: "right" as const,
      render: (val: number) => <Text strong>฿ {val.toFixed(2)}</Text>,
    },
  ];

  const expandedRowRender = (record: BillingItem) => {
    const detailColumns = [
      { title: 'Category', dataIndex: 'category', key: 'category' },
      { title: 'Description', dataIndex: 'test_name', key: 'test_name' },
      { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', align: 'center' as const },
      { title: 'Unit Price', dataIndex: 'unit_price', key: 'unit_price', align: 'right' as const, render: (val: number) => `฿ ${val.toFixed(2)}` },
      { title: 'Total', dataIndex: 'total_price', key: 'total_price', align: 'right' as const, render: (val: number) => `฿ ${val.toFixed(2)}` },
    ];
    return <Table columns={detailColumns} dataSource={record.items || []} pagination={false} size="small" rowKey={(r, i) => `${record.case_id}-${i}`} />;
  };

  return (
    <div style={{ width: "100%" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card>
          <Space style={{ marginBottom: 16 }} wrap>
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                Date Range
              </Text>
              <RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                style={{ width: 260 }}
              />
            </div>
            
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                Hospital
              </Text>
              <Select
                placeholder="All Hospitals"
                allowClear
                style={{ width: 250 }}
                value={selectedHospital}
                onChange={(value) => setSelectedHospital(value)}
              >
                {hospitals.map((h) => (
                  <Option key={h.id} value={h.id}>
                    {h.name}
                  </Option>
                ))}
              </Select>
            </div>

            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                &nbsp;
              </Text>
              <Space>
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  onClick={handleSearch}
                  loading={loading}
                >
                  Search
                </Button>
                <Button
                  icon={<FilePdfOutlined />}
                  onClick={handleExport}
                  loading={exportLoading}
                  danger
                >
                  Export PDF
                </Button>
              </Space>
            </div>
          </Space>

          <Table
            columns={columns}
            dataSource={items}
            rowKey="case_id"
            loading={loading}
            pagination={false}
            scroll={{ y: 500 }}
            expandable={{ expandedRowRender }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>
                  <Text strong style={{ fontSize: 16 }}>
                    Grand Total ({totalCases} Cases)
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ fontSize: 18, color: "#1890ff" }}>
                    ฿ {grandTotal.toFixed(2)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>
      </Space>
    </div>
  );
};

export default HospitalBillingPage;
