import React, { useEffect, useState } from "react";
import { Input, Table, Typography, message, Segmented, Space, Tooltip, Progress, Badge } from "antd";

const { Text } = Typography;
import { FireFilled, HistoryOutlined, CheckCircleFilled } from "@ant-design/icons";

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
import {
  formatRegisteredAt,
  renderCytotechnologistCell,
  renderPatientCell,
  renderSpecimenCell,
  renderStatusCell,
} from "./nongyneWorklistCells";

interface PathologistNongyneWorklistProps {
  onSelectCase: (id: number, type: "nongyne") => void;
  standAlone?: boolean;
  refreshTrigger?: number;
}

// One line under the filter, as the Gyne tab has.
const TAB_DESCRIPTIONS: Record<string, string> = {
  all: "All cases assigned to you",
  my_cases: "Cases assigned to you that are not reported yet",
  pending: "Cases put on hold (Pending)",
  co_sign: "Reports awaiting your signature to complete",
  express: "Urgent (Express/Urgent) cases assigned to you",
};

const PathologistNongyneWorklist: React.FC<PathologistNongyneWorklistProps> = ({
  onSelectCase,
  standAlone = true,
  refreshTrigger,
}) => {
  const [cases, setCases] = useState<NongyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [myNewCasesCount, setMyNewCasesCount] = useState(0);

  useEffect(() => {
    UserService.getCurrentUser().then(setCurrentUser).catch(() => {});
    SystemSettingService.getSettings().then(setSettings).catch(() => {});
    HolidayService.getHolidayDateList().then(setHolidays).catch(() => {});
  }, []);

  const loadMyNewCasesCount = async () => {
    try {
      const data = await NongyneCytologyCaseService.getAll({
        assigned_to_me: true,
        is_reported: false,
        limit: 1,
      });
      setMyNewCasesCount(data.total);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    if (currentUser) loadCases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, activeTab, searchText]);

  useEffect(() => {
    if (currentUser) loadMyNewCasesCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    if (refreshTrigger && currentUser) {
      loadCases();
      loadMyNewCasesCount();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Keep the badge in sync with the exact total once "My New Cases" is the active tab
  useEffect(() => {
    if (activeTab === "my_cases") setMyNewCasesCount(total);
  }, [activeTab, total]);

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
      } else if (activeTab === "all") {
        // Scoped to cases assigned to me (including already-reported ones),
        // matching how the Surgical and Gyne worklists scope their "All" tab.
        params.assigned_to_me = true;
        // ...and, like Surgical's "All" (prioritize_status), the work still to
        // be done comes first. This has to be the server's ORDER BY: the Table
        // sorter below only reaches the rows already fetched, so an unreported
        // case sitting past the page limit would never reach the top.
        params.prioritize_unreported = true;
      }
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
      sorter: (a: NongyneCytologyCase, b: NongyneCytologyCase) => {
        // Orders within the fetched page, on the same rule the server sorts by
        // (prioritize_unreported) so the two agree: unreported first, then by
        // accession. The server decides which cases land on the page at all.
        const isMyNewCase = (c: NongyneCytologyCase) =>
          !!currentUser &&
          (c.pathologist_id === currentUser.id || c.cytotechnologist_id === currentUser.id) &&
          !c.is_reported;
        const aPriority = isMyNewCase(a) ? 0 : 1;
        const bPriority = isMyNewCase(b) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.accession_no || "").localeCompare(b.accession_no || "");
      },
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
      title: "Registered At",
      dataIndex: "registered_at",
      key: "registered_at_col",
      width: 150,
      render: (val: string) => formatRegisteredAt(val),
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, record: NongyneCytologyCase) => renderPatientCell(record),
    },
    {
      title: "Specimen",
      dataIndex: "specimen_type",
      key: "specimen_type",
      width: 140,
      render: (_: string, record: NongyneCytologyCase) => renderSpecimenCell(record),
    },
    {
      title: "Cytotechnologist",
      key: "cytotechnologist",
      width: 170,
      render: (_: unknown, record: NongyneCytologyCase) => renderCytotechnologistCell(record),
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
        // TAT can't be worked out (no SLA set): a short grey date, as Gyne shows it.
        if (!tat) {
          return (
            <Tooltip title={formatRegisteredAt(val)}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {val ? dayjs(val).format("DD/MM/YY") : "-"}
              </Text>
            </Tooltip>
          );
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
      width: 160,
      render: (_: string, record: NongyneCytologyCase) => renderStatusCell(record, { consultBadge: true }),
    },
  ];

  const content = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <Segmented
          options={[
            { label: "All", value: "all" },
            {
              label: (
                <span>
                  My New Cases
                  {myNewCasesCount > 0 && (
                    <Badge count={myNewCasesCount} size="small" style={{ marginLeft: 6 }} />
                  )}
                </span>
              ),
              value: "my_cases",
            },
            { label: "Pending", value: "pending" },
            { label: "Sign Required", value: "co_sign" },
            { label: "Express", value: "express" },
          ]}
          value={activeTab}
          onChange={(value) => { setActiveTab(value as string); setSearchText(""); }}
        />
        <Space>
          <Input.Search
            key={activeTab}
            placeholder="Search Accession / Patient"
            style={{ width: 260 }}
            allowClear
            enterButton
            defaultValue={searchText}
            onSearch={(val) => setSearchText(val)}
          />
        </Space>
      </div>

      {TAB_DESCRIPTIONS[activeTab] && (
        <div style={{ marginBottom: 12, paddingLeft: 2 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {TAB_DESCRIPTIONS[activeTab]}
          </Text>
        </div>
      )}

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
        size={standAlone ? "large" : "middle"}
        bordered
      />
    </div>
  );

  if (!standAlone) return content;

  return (
    <PageContainer
      title="Non-Gyne Cytology Worklist (Pathologist)"
      subTitle={`Total Cases: ${total}`}
      withCard
    >
      {content}
    </PageContainer>
  );
};

export default PathologistNongyneWorklist;
