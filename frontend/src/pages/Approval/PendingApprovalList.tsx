import React, { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Typography,
  Input,
  Space,
  Tooltip,
  Tabs,
} from "antd";
import type { TableProps } from "antd";
import {
  CheckCircleOutlined,
  EyeOutlined,
  SearchOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import SurgicalReportService from "../../services/surgicalReportService";
import NongyneReportService, { PendingNongyneApproval } from "../../services/nongyneReportService";
import PageContainer from "../../components/Layout/PageContainer";
import {
  SurgicalReport,
  SurgicalReportPagination,
} from "../../types/surgicalReport";
import dayjs from "dayjs";
import "../../styles/table-common.css";
import AccessionTag from "../../components/AccessionTag";
import { useAuth } from "../../hooks/useAuth";
import logger from "../../utils/logger";

const { Title, Text } = Typography;

interface PendingApprovalListProps {
  onOpenReport: (id: number, type: "surgical" | "gyne" | "nongyne") => void;
}

const PendingApprovalList: React.FC<PendingApprovalListProps> = ({
  onOpenReport,
}) => {
  const { user } = useAuth();
  
  // Logic: Hide Surgical if user is Cytotechnologist but NOT Admin/Pathologist
  const isCytoRestricted = user?.roles?.includes("cytotechnologist") && 
                          !user?.roles?.includes("admin") && 
                          !user?.roles?.includes("pathologist");

  const [activeTab, setActiveTab] = useState(isCytoRestricted ? "nongyne" : "surgical");
  const [surgicalData, setSurgicalData] = useState<SurgicalReport[]>([]);
  const [nongyneData, setNongyneData] = useState<PendingNongyneApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [searchText, setSearchText] = useState("");

  // Sync activeTab if permissions change
  useEffect(() => {
    if (isCytoRestricted && activeTab === "surgical") {
      setActiveTab("nongyne");
    }
  }, [isCytoRestricted, activeTab]);

  const fetchSurgicalReports = async () => {
    setLoading(true);
    try {
      const response: SurgicalReportPagination =
        await SurgicalReportService.getAllReports(
          pagination.current,
          pagination.pageSize,
          searchText || "status:pending",
        );
      setSurgicalData(response.items.filter((i) => i.status === "pending"));
      setTotal(response.total);
    } catch (error) {
      logger.error("Failed to fetch pending surgical reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNongyneReports = async () => {
    setLoading(true);
    try {
      const response = await NongyneReportService.getPendingReports(
        pagination.current,
        pagination.pageSize,
        searchText,
      );
      setNongyneData(response.items);
      setTotal(response.total);
    } catch (error) {
      logger.error("Failed to fetch pending nongyne reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "surgical") {
      fetchSurgicalReports();
    } else {
      fetchNongyneReports();
    }
  }, [activeTab, pagination.current, pagination.pageSize, searchText]);

  const surgicalColumns: TableProps<SurgicalReport>["columns"] = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 160,
      render: (text) => <AccessionTag value={text} />,
    },
    {
      title: "Patient Information",
      key: "patient_info",
      render: (_, record) => (
        <div>
          <Text strong>{[record.patient_title, record.patient_name, record.patient_ln].filter(Boolean).join(" ")}</Text>
          <div style={{ fontSize: "12px", color: "#8c8c8c" }}>
            HN: {record.patient_hn || "-"}
          </div>
        </div>
      ),
    },
    {
      title: "Type",
      dataIndex: "report_type",
      width: 100,
      render: (type) => (
        <Tag color={type?.toLowerCase() === "final" ? "blue" : "purple"}>
          {type?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Pathologist",
      dataIndex: "pathologist_name",
      width: 180,
    },
    {
      title: "Submitted At",
      dataIndex: "updated_at",
      width: 150,
      render: (date) => dayjs(date).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Action",
      key: "action",
      width: 180,
      fixed: "right",
      align: "center",
      render: (_, record) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Preview PDF">
            <Button
              icon={<EyeOutlined />}
              onClick={() => window.open(`/reports/${record.id}/preview`, "_blank")}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => onOpenReport(record.id, "surgical")}
          >
            Decide
          </Button>
        </Space>
      ),
    },
  ];

  const nongyneColumns: TableProps<PendingNongyneApproval>["columns"] = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 160,
      render: (text) => <AccessionTag value={text} />,
    },
    {
      title: "Patient Information",
      key: "patient_info",
      render: (_, record) => (
        <div>
          <Text strong>{[record.patient_title, record.patient_name, record.patient_ln].filter(Boolean).join(" ")}</Text>
          <div style={{ fontSize: "12px", color: "#8c8c8c" }}>
            HN: {record.patient_hn || "-"}
          </div>
        </div>
      ),
    },
    {
      title: "Specimen Type",
      dataIndex: "specimen_type",
      width: 140,
    },
    {
      title: "Pathologist",
      dataIndex: "pathologist_name",
      width: 180,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (s) => <Tag color="orange">{s?.replace("_", " ").toUpperCase()}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      width: 160,
      fixed: "right",
      align: "center",
      render: (_, record) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => onOpenReport(record.id, "nongyne")}
            style={{ background: "#13c2c2", borderColor: "#13c2c2" }}
          >
            Decide
          </Button>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: "surgical",
      label: "Surgical Pathology",
      children: (
        <Table
          columns={surgicalColumns}
          dataSource={surgicalData}
          rowKey="id"
          loading={loading}
          className="standard-table"
          size="middle"
          scroll={{ x: 1000, y: "calc(100vh - 360px)" }}
          sticky
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
          }}
          onChange={(p) => setPagination({ current: p.current || 1, pageSize: p.pageSize || 10 })}
          onRow={(record) => ({ onClick: () => onOpenReport(record.id, "surgical"), style: { cursor: "pointer" } })}
        />
      ),
    },
    {
      key: "nongyne",
      label: "Non-Gyne Cytology",
      children: (
        <Table
          columns={nongyneColumns}
          dataSource={nongyneData}
          rowKey="id"
          loading={loading}
          className="standard-table"
          size="middle"
          scroll={{ x: 900, y: "calc(100vh - 360px)" }}
          sticky
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
          }}
          onChange={(p) => setPagination({ current: p.current || 1, pageSize: p.pageSize || 10 })}
          onRow={(record) => ({ onClick: () => onOpenReport(record.id, "nongyne"), style: { cursor: "pointer" } })}
        />
      ),
    },
  ].filter(item => {
    // Hide Surgical tab if user is restricted cytotechnologist
    if (isCytoRestricted && item.key === "surgical") return false;
    return true;
  });

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <FileSearchOutlined style={{ marginRight: 12, color: "#595959" }} />
          Pending Approvals
        </Title>
      }
      extra={
        <Input.Search
          placeholder="Search Accession / Patient"
          prefix={<SearchOutlined />}
          style={{ width: 350 }}
          allowClear
          onSearch={(value) => {
            setSearchText(value);
            setPagination({ ...pagination, current: 1 });
          }}
        />
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          setPagination({ ...pagination, current: 1 });
        }}
        items={tabItems}
      />
    </PageContainer>
  );
};

export default PendingApprovalList;
