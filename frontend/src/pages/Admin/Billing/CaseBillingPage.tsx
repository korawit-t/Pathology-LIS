import React, { useState, useEffect } from "react";
import {
  Card,
  Input,
  Table,
  Button,
  Modal,
  Tag,
  Typography,
  Space,
  message,
} from "antd";
import { DollarOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import SurgicalReportService from "../../../services/surgicalReportService";
import { SurgicalCase } from "../../../types/surgical";
import type { TablePaginationConfig } from "antd/es/table";
import logger from "../../../utils/logger";

interface CostItem {
  test_id?: number;
  category?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
}

const { Title, Text } = Typography;
const { Search } = Input;

const BillingManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [searchText, setSearchText] = useState("");

  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costLoading, setCostLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<SurgicalCase | null>(null);
  const [costData, setCostData] = useState<{
    items: CostItem[];
    grand_total: number;
  } | null>(null);

  const fetchCases = async (page = 1, pageSize = 10, search = "") => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const res = await SurgicalCaseService.getCases({
        skip,
        limit: pageSize,
        search,
      });
      setCases(res.items);
      setTotal(res.total);
    } catch (error) {
      logger.error("Failed to fetch cases:", error);
      message.error("Failed to load case data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases(pagination.current, pagination.pageSize, searchText);
  }, [pagination.current, pagination.pageSize]);

  const handleSearch = (value: string) => {
    setSearchText(value);
    setPagination({ ...pagination, current: 1 });
    fetchCases(1, pagination.pageSize, value);
  };

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    setPagination({ current: newPagination.current ?? 1, pageSize: newPagination.pageSize ?? 10 });
  };

  const showCostSummary = async (record: SurgicalCase) => {
    setSelectedCase(record);
    setCostModalOpen(true);
    setCostLoading(true);
    setCostData(null);
    try {
      const resp = await SurgicalReportService.getCostSummary(record.id);
      setCostData(resp as { items: CostItem[]; grand_total: number });
    } catch (err) {
      logger.error("Failed to fetch cost summary:", err);
      message.error("Failed to fetch cost data");
    } finally {
      setCostLoading(false);
    }
  };

  const caseColumns = [
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
      dataIndex: ["patient", "name"],
      key: "patient_name",
    },
    {
      title: "Received Date",
      dataIndex: "created_at",
      key: "created_at",
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
      title: "Action",
      key: "action",
      render: (_: unknown, record: SurgicalCase) => (
        <Button
          type="primary"
          icon={<DollarOutlined />}
          onClick={() => showCostSummary(record)}
        >
          View Cost
        </Button>
      ),
    },
  ];

  const costColumns = [
    {
      title: "Item",
      dataIndex: "test_name",
      key: "test_name",
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      render: (cat: string) => <Tag color="blue">{cat}</Tag>,
    },
    {
      title: "Quantity",
      dataIndex: "quantity",
      key: "quantity",
      align: "center" as const,
    },
    {
      title: "Unit Price",
      dataIndex: "unit_price",
      key: "unit_price",
      align: "right" as const,
      render: (val: number) => `฿ ${val.toFixed(2)}`,
    },
    {
      title: "Total",
      dataIndex: "total_price",
      key: "total_price",
      align: "right" as const,
      render: (val: number) => <Text strong>฿ {val.toFixed(2)}</Text>,
    },
  ];

  return (
    <div style={{ width: "100%" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Search
              placeholder="Search Accession No, HN, or Patient Name"
              allowClear
              enterButton="Search"
              size="large"
              onSearch={handleSearch}
              style={{ maxWidth: 400 }}
            />
          </div>

          <Table
            columns={caseColumns}
            dataSource={cases}
            rowKey="id"
            loading={loading}
            pagination={{
              ...pagination,
              total: total,
              showSizeChanger: true,
            }}
            onChange={handleTableChange}
          />
        </Card>
      </Space>

      <Modal
        title={`Cost Summary - ${selectedCase?.accession_no || ""}`}
        open={costModalOpen}
        onCancel={() => setCostModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setCostModalOpen(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        <Table
          columns={costColumns}
          dataSource={costData?.items || []}
          rowKey={(record: CostItem) => `${record.test_id}-${record.category}`}
          pagination={false}
          loading={costLoading}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <Text strong style={{ fontSize: 16 }}>
                  Grand Total
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} colSpan={2} align="right">
                <Text strong style={{ fontSize: 18, color: "#1890ff" }}>
                  ฿ {costData?.grand_total?.toFixed(2) || "0.00"}
                </Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Modal>
    </div>
  );
};

export default BillingManagementPage;
