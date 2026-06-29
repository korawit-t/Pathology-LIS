import React from "react";
import {
  Table,
  Tag,
  Typography,
  Input,
  Segmented,
  Space,
  Tooltip,
  Progress,
  Badge,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  SearchOutlined,
  FilterOutlined,
  FireFilled,
  HistoryOutlined,
  LockOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import { CASE_STATUS } from "../../../constants/lab.constants";
import { calculateTATProgress } from "../../../utils/tatUtils";
import { useTheme } from "../../../contexts/ThemeContext";
import type { SystemSetting } from "../../../types/system";

dayjs.extend(relativeTime);
const { Text } = Typography;

export interface WorklistRow {
  id: number;
  case_id?: number;
  accession_no?: string;
  version_no?: number;
  is_express?: boolean;
  is_frozen_section?: boolean;
  is_pending?: boolean;
  registered_at?: string;
  reported_at?: string;
  status?: string;
  pathologist_name?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  hn?: string;
  patient?: { title?: { title?: string }; name?: string; ln?: string };
  case_type?: string;
}

interface SurgicalCaseWorklistProps {
  dataSource: WorklistRow[];
  loading: boolean;
  total: number;
  pagination: { current: number; pageSize: number };
  setPagination: React.Dispatch<React.SetStateAction<{ current: number; pageSize: number }>>;
  selectedStatus: string;
  setSelectedStatus: (s: string) => void;
  onSearch: (value: string) => void;
  onSelectCase: (id: number) => void;
  settings?: SystemSetting | null;
  holidays: string[];
  category?: "SURGICAL" | "NON_GYNE";
  slideSentCount?: number;
  pendingCount?: number;
  coSignCount?: number;
}

const SurgicalCaseWorklist: React.FC<SurgicalCaseWorklistProps> = ({
  dataSource,
  loading,
  total,
  pagination,
  setPagination,
  selectedStatus,
  setSelectedStatus,
  onSearch,
  onSelectCase,
  settings,
  holidays,
  category = "SURGICAL",
  slideSentCount,
  pendingCount,
  coSignCount,
}) => {
  const { isDarkMode } = useTheme();

  const isCoSignMode = selectedStatus === "CO_SIGNER";

  const columns: TableProps<WorklistRow>["columns"] = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 180,
      fixed: "left",
      sorter: (a, b) => (a.accession_no || "").localeCompare(b.accession_no || ""),
      defaultSortOrder: "ascend" as const,
      render: (text: string, record) => (
        <Space size={8}>
          <Text strong style={{ color: isDarkMode ? "#40a9ff" : "#1890ff" }}>
            {text}
          </Text>
          {/* แสดง Version ถ้าเป็นโหมด Co-Sign */}
          {record.version_no && (
            <Tag color="processing">v.{record.version_no}</Tag>
          )}
          {record.is_express && (
            <Tooltip title="URGENT CASE">
              <Tag
                color="#f5222d"
                icon={<FireFilled />}
                style={{ margin: 0, fontWeight: "bold" }}
              >
                URG
              </Tag>
            </Tooltip>
          )}
          {record.is_frozen_section && (
            <Tooltip title="Frozen Section">
              <Tag color="cyan" style={{ margin: 0, padding: "0 4px", fontSize: "10px", fontWeight: "bold" }}>
                ❄ FS
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Patient",
      key: "patient_info",
      render: (_, record) => {
        const patientName =
          [
            record.patient?.title?.title,
            record.patient?.name ?? record.patient_name,
            record.patient?.ln ?? record.patient_ln,
          ]
            .filter(Boolean)
            .join(" ") ||
          "Unknown";
        const hn = record.patient_hn || record.hn || "N/A";
        return (
          <div>
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>
              {patientName}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: isDarkMode ? "rgba(255,255,255,0.45)" : "#8c8c8c",
              }}
            >
              HN: {hn}
            </div>
          </div>
        );
      },
    },
    {
      title: isCoSignMode ? "Report At" : "Register At",
      dataIndex: isCoSignMode ? "reported_at" : "registered_at",
      key: "date_col",
      width: 150,
      render: (value: string) =>
        value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: (
        <Space size={4}>
          TAT / PROGRESS
          <Tooltip
            title={
              <div>
                SLA Settings:
                <br />• Surgical: {settings?.surgical_tat_days} days
                <br />• Non-Gyne: {settings?.non_gyne_tat_days} days
                <br />• Gyne: {settings?.gyne_tat_days} days
              </div>
            }
          >
            <HistoryOutlined
              style={{
                color: isDarkMode ? "rgba(255,255,255,0.45)" : "#8c8c8c",
                cursor: "help",
              }}
            />
          </Tooltip>
        </Space>
      ),
      dataIndex: "registered_at",
      width: 200,
      render: (value: string, record) => {
        const s = record.status?.toUpperCase();
        const isSignedOut = s === "COMPLETED" || s === "PUBLISHED" || s === "SIGNED OUT";
        if (isSignedOut) {
          return (
            <CheckCircleFilled style={{ color: "#52c41a", fontSize: 20 }} />
          );
        }

        const tat = calculateTATProgress(
          record.registered_at,
          category,
          settings,
          record.is_express,
          holidays || [],
        );
        if (!tat)
          return (
            <Text type="secondary">
              {value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-"}
            </Text>
          );

        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              width: "160px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: tat.isOverdue ? "#f5222d" : "inherit",
                }}
              >
                {tat.displayTime}
              </Text>
              <Text type="secondary" style={{ fontSize: "10px" }}>
                {tat.percent}%
              </Text>
            </div>
            <Progress
              percent={tat.percent}
              showInfo={false}
              strokeColor={tat.statusColor}
              size={[160, 6]}
              trailColor={isDarkMode ? "rgba(255,255,255,0.1)" : "#f0f0f0"}
              status={tat.isOverdue ? "exception" : "active"}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "2px",
              }}
            >
              <Text type="secondary" style={{ fontSize: "11px" }}>
                Due:{" "}
                <Text
                  strong={tat.isOverdue}
                  style={{
                    fontSize: "11px",
                    color: tat.isOverdue ? "#f5222d" : "#595959",
                  }}
                >
                  {tat.dueDate ? dayjs(tat.dueDate).format("DD/MM/YYYY") : "-"}
                </Text>
              </Text>
              {tat.isOverdue && (
                <Text
                  style={{
                    fontSize: "10px",
                    color: "#f5222d",
                    fontWeight: "bold",
                  }}
                >
                  OVERDUE
                </Text>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (status, record) => {
        // 🚩 ถ้าเป็น Co-Sign Mode ให้เน้น Status ของ Sign-off
        if (isCoSignMode) {
          return (
            <Tag color="orange" icon={<HistoryOutlined />}>
              PENDING CO-SIGN
            </Tag>
          );
        }

        const s = status?.toUpperCase();
        const isSignedOut = s === "COMPLETED" || s === "PUBLISHED" || s === "SIGNED OUT";
        if (isSignedOut) {
          return (
            <Tag color="green" icon={!record.is_pending ? <LockOutlined /> : undefined}>
              {s === "SIGNED OUT" ? "SIGNED" : s}
            </Tag>
          );
        }
        if (s === "DRAFT") return <Tag color="warning">DRAFT</Tag>;
        return <Tag color="blue">{s}</Tag>;
      },
    },
    // เพิ่มคอลัมน์ "Pathologist" เฉพาะหน้า Co-Sign เพื่อดูว่าใครส่งมา
    ...(isCoSignMode
      ? [
          {
            title: "Primary Pathologist",
            dataIndex: "pathologist_name",
            key: "pathologist_name",
            render: (text: string) => (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                {text}
              </Text>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <Space>
          <Text type="secondary"></Text>
          <Segmented
            options={[
              {
                label: (
                  <span>
                    Slide Sent
                    {slideSentCount !== undefined && slideSentCount > 0 && (
                      <Badge
                        count={slideSentCount}
                        size="small"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </span>
                ),
                value: CASE_STATUS.SLIDE_SENT,
              },
              {
                label: (
                  <span>
                    Pending
                    {pendingCount !== undefined && pendingCount > 0 && (
                      <Badge count={pendingCount} size="small" style={{ marginLeft: 6 }} />
                    )}
                  </span>
                ),
                value: CASE_STATUS.PENDING_DIAGNOSIS,
              },
              {
                label: (
                  <span>
                    Co-sign
                    {coSignCount !== undefined && coSignCount > 0 && (
                      <Badge count={coSignCount} size="small" style={{ marginLeft: 6, backgroundColor: "#fa8c16" }} />
                    )}
                  </span>
                ),
                value: "CO_SIGNER",
              },
              { label: "All", value: "ALL" },
            ]}
            value={selectedStatus}
            onChange={(value) => {
              setSelectedStatus(value as string);
              setPagination({ ...pagination, current: 1 });
            }}
          />
        </Space>
        <Input
          placeholder="Search Accession / Patient"
          prefix={<SearchOutlined />}
          style={{ width: 300 }}
          allowClear
          onChange={(e) => {
            onSearch(e.target.value);
            setPagination({ ...pagination, current: 1 });
          }}
        />
      </div>

      <Table
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowKey="id"
        size="middle"
        onRow={(record) => ({
          onClick: () => {
            // 🚩 ถ้าเป็นโหมด Co-sign ให้ส่ง case_id แทน id (เพราะ record.id คือ report_id)
            onSelectCase(isCoSignMode ? record.case_id : record.id);
          },
          style: { cursor: "pointer" },
        })}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50"],
          showTotal: (total) => `Total ${total} cases`,
        }}
        onChange={(p) => setPagination({ current: p.current ?? 1, pageSize: p.pageSize ?? 20 })}
      />
    </>
  );
};

export default SurgicalCaseWorklist;
