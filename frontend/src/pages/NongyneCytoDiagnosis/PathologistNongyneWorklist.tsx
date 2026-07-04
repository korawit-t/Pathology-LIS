import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Table, Tag, Typography, message, Segmented, Space, Tooltip, Progress } from "antd";

const { Text } = Typography;
import {
  ReloadOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  SearchOutlined,
  LinkOutlined,
  FireFilled,
  HistoryOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";

import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NongyneReportService from "../../services/nongyneReportService";
import UserService from "../../services/userService";
import SystemSettingService from "../../services/systemSettingService";
import HolidayService from "../../services/holidayService";
import { NongyneCytologyCase } from "../../types/nongyne";
import type { User } from "../../types/user";
import type { SystemSetting } from "../../types/system";
import AccessionTag from "../../components/AccessionTag";
import { calculateTATProgress } from "../../utils/tatUtils";
import { renderConsultBadge } from "../../utils/consultBadge";

interface PathologistNongyneWorklistProps {
  onSelectCase: (id: number, type: "nongyne") => void;
  standAlone?: boolean;
  refreshTrigger?: number;
}

const PathologistNongyneWorklist: React.FC<PathologistNongyneWorklistProps> = ({
  onSelectCase,
  standAlone = true,
  refreshTrigger,
}) => {
  const [cases, setCases] = useState<NongyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("my_cases");
  const [searchText, setSearchText] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    UserService.getCurrentUser().then(setCurrentUser).catch(() => {});
    SystemSettingService.getSettings().then(setSettings).catch(() => {});
    HolidayService.getHolidayDateList().then(setHolidays).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) loadCases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, activeTab, searchText]);

  useEffect(() => {
    if (refreshTrigger && currentUser) loadCases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const loadCases = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);

      if (activeTab === "co_sign") {
        const data = await NongyneReportService.getPendingCosignWorklist(1, 50, searchText || undefined);
        const normalized = (data.items as Array<NongyneCytologyCase & { case_id: number }>).map((r) => ({ ...r, id: r.case_id }));
        setCases(normalized);
        setTotal(data.total);
        return;
      }

      const params: Record<string, unknown> = { limit: 50 };
      if (activeTab === "my_cases") {
        params.assigned_to_me = true;
        params.is_reported = false;
      } else if (activeTab === "pending") {
        params.is_pending = true;
      } else if (activeTab === "express") {
        params.assigned_to_me = true;
        params.is_express = true;
      }
      // "all" → no extra params
      if (searchText.trim()) params.search = searchText.trim();

      const data = await NongyneCytologyCaseService.getAll(params);
      setCases(data.items);
      setTotal(data.total);
    } catch {
      message.error("ไม่สามารถโหลดข้อมูลเคสได้");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      sorter: (a: NongyneCytologyCase, b: NongyneCytologyCase) =>
        (a.accession_no || "").localeCompare(b.accession_no || ""),
      defaultSortOrder: "ascend" as const,
      render: (text: string, record: NongyneCytologyCase) => (
        <Space size={4}>
          <AccessionTag value={text} />
          {record.is_express && (
            <Tooltip title="Express / Urgent">
              <FireFilled style={{ color: "#ff4d4f", fontSize: 12 }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Patient / Hospital",
      key: "patient",
      render: (_: unknown, record: NongyneCytologyCase) => (
        <div>
          <div className="font-medium">
            {[record.patient?.title?.title, record.patient?.name, record.patient?.ln].filter(Boolean).join(" ")}
          </div>
          <div className="text-xs text-gray-500">{record.hospital?.name || "ไม่ระบุหน่วยงาน"}</div>
          <div className="text-xs text-gray-400">HN: {record.hn}</div>
        </div>
      ),
    },
    {
      title: "Specimen",
      dataIndex: "specimen_type",
      key: "specimen_type",
      render: (text: string, record: NongyneCytologyCase) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-xs text-gray-500">{record.collection_site}</div>
        </div>
      ),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      key: "registered_at_col",
      width: 110,
      render: (val: string) =>
        val ? (
          <div>
            <div style={{ fontSize: 13 }}>{dayjs(val).format("DD/MM/YYYY")}</div>
            <div style={{ fontSize: 11, color: "#8c8c8c" }}>{dayjs(val).format("HH:mm")}</div>
          </div>
        ) : "—",
    },
    {
      title: (
        <Space size={4}>
          TAT / PROGRESS
          <Tooltip title={`SLA: Non-Gyne ${settings?.non_gyne_tat_days ?? "—"} days`}>
            <HistoryOutlined style={{ color: "#8c8c8c", cursor: "help" }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: "registered_at",
      key: "registered_at",
      width: 200,
      render: (val: string, record: NongyneCytologyCase) => {
        const s = record.status?.toLowerCase();
        const isTerminal = s === "reported" || s === "completed" || s === "published" || s === "cancelled";
        if (isTerminal) {
          return <CheckCircleFilled style={{ color: "#52c41a", fontSize: 20 }} />;
        }

        const tat = calculateTATProgress(val, "non_gyne", settings, record.is_express, holidays);
        if (!tat) {
          return val ? (
            <div>
              <div style={{ fontSize: 13 }}>{dayjs(val).format("DD/MM/YYYY")}</div>
              <div style={{ fontSize: 11, color: "#8c8c8c" }}>{dayjs(val).format("HH:mm")}</div>
            </div>
          ) : "—";
        }

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 160 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: 500, color: tat.isOverdue ? "#f5222d" : "inherit" }}>
                {tat.displayTime}
              </Text>
              <Text type="secondary" style={{ fontSize: 10 }}>{tat.percent}%</Text>
            </div>
            <Progress
              percent={tat.percent}
              showInfo={false}
              strokeColor={tat.statusColor}
              size={[160, 6]}
              status={tat.isOverdue ? "exception" : "active"}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Due:{" "}
                <Text strong={tat.isOverdue} style={{ fontSize: 11, color: tat.isOverdue ? "#f5222d" : "#595959" }}>
                  {tat.dueDate ? dayjs(tat.dueDate).format("DD/MM/YYYY") : "-"}
                </Text>
              </Text>
              {tat.isOverdue && (
                <Text style={{ fontSize: 10, color: "#f5222d", fontWeight: "bold" }}>OVERDUE</Text>
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
      render: (status: string, record: NongyneCytologyCase) => {
        const rawStatus = status ? status.toLowerCase() : "";
        const TERMINAL = ["reported", "completed", "published", "cancelled", "pending_approval"];
        const s = (!TERMINAL.includes(rawStatus) && record.is_screened) ? "screened" : rawStatus;
        let color = "default";
        let icon = <ClockCircleOutlined />;
        let label = status ? status.toUpperCase() : "UNKNOWN";

        if (s === "registered") { color = "cyan"; label = "Registered"; }
        else if (s === "stained") { color = "blue"; icon = <ExperimentOutlined />; label = "Stained"; }
        else if (s === "screening") { color = "geekblue"; icon = <SyncOutlined spin />; label = "Screening"; }
        else if (s === "screened") { color = "geekblue"; icon = <CheckCircleOutlined />; label = "Screened"; }
        else if (s === "revised") { color = "volcano"; icon = <ExclamationCircleOutlined />; label = "Revised"; }
        else if (s === "pending_approval") { color = "gold"; label = "Pending Approval"; }
        else if (s === "reported" || s === "completed") { color = "green"; icon = <CheckCircleOutlined />; label = "Completed"; }
        else if (s === "published") { color = "purple"; icon = <FileDoneOutlined />; label = "Published"; }
        else if (s === "cancelled") { color = "red"; icon = <ExclamationCircleOutlined />; label = "Cancelled"; }

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <Tag color={color} icon={icon} className="px-3 py-1 text-sm font-medium rounded-full shadow-sm">
              {label}
            </Tag>
            {record.has_correlation && (
              <Tag color="blue" icon={<LinkOutlined />} style={{ fontSize: 11 }}>
                Correlated
              </Tag>
            )}
            {renderConsultBadge(record)}
          </div>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      align: "center" as const,
      render: (_: unknown, record: NongyneCytologyCase) => (
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={(e) => { e.stopPropagation(); onSelectCase(record.id, "nongyne"); }}
          className="bg-indigo-600 hover:bg-indigo-700 border-none"
        >
          Diagnosis
        </Button>
      ),
    },
  ];

  const content = (
    <div className={standAlone ? "" : "bg-white rounded-lg"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Segmented
          options={[
            { label: "My New Cases", value: "my_cases" },
            { label: "Pending", value: "pending" },
            { label: "Sign Required", value: "co_sign" },
            { label: "Express", value: "express" },
            { label: "All", value: "all" },
          ]}
          value={activeTab}
          onChange={(value) => { setActiveTab(value as string); setSearchText(""); }}
        />
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search Accession / Patient"
            style={{ width: 260 }}
            allowClear
            value={searchText}
            onChange={(e) => {
              const val = e.target.value;
              if (searchTimer.current) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => setSearchText(val), 400);
            }}
          />
          {!standAlone && (
            <Button icon={<ReloadOutlined />} onClick={loadCases} loading={loading} size="small">
              Refresh
            </Button>
          )}
        </Space>
      </div>

      <Table
        key={activeTab}
        columns={columns}
        dataSource={cases}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => onSelectCase(record.id, "nongyne"),
          style: { cursor: "pointer" },
        })}
        pagination={{ total, pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
        className={standAlone ? "border rounded-lg" : ""}
        size={standAlone ? "large" : "middle"}
      />
    </div>
  );

  if (!standAlone) return content;

  return (
    <PageContainer
      title="Non-Gyne Cytology Worklist (Pathologist)"
      subTitle={`Total Cases: ${total}`}
      extra={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={loadCases} loading={loading}>
          รีเฟรชข้อมูล
        </Button>,
      ]}
      withCard
    >
      {content}
    </PageContainer>
  );
};

export default PathologistNongyneWorklist;
