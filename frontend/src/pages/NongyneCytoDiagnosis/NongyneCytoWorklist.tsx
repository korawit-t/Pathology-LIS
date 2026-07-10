import React, { useEffect, useState } from "react";
import { Button, Input, Table, Tag, message, Segmented, Space, Tooltip } from "antd";
import {
  ReloadOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  LinkOutlined,
  FireFilled,
} from "@ant-design/icons";

import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NongyneReportService from "../../services/nongyneReportService";
import UserService from "../../services/userService";
import { NongyneCytologyCase } from "../../types/nongyne";
import type { User } from "../../types/user";
import AccessionTag from "../../components/AccessionTag";

interface NongyneCytoWorklistProps {
  onSelectCase: (id: number, type: "nongyne") => void;
  standAlone?: boolean;
  refreshTrigger?: number;
}

const NongyneCytoWorklist: React.FC<NongyneCytoWorklistProps> = ({
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

  useEffect(() => {
    UserService.getCurrentUser()
      .then(setCurrentUser)
      .catch(() => {});
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
      if (activeTab === "slide_sent") params.status = "slide sent";
      else if (activeTab === "pending") { params.status = "screened"; params.is_reported = false; }
      else if (activeTab === "my_cases") { params.assigned_to_me = true; params.stain_status = "stained"; params.is_reported = false; params.is_screened = false; }
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
          {record.is_rose && (
            <Tooltip title="Rapid On-Site Evaluation">
              <Tag color="purple" style={{ margin: 0, padding: "0 4px", fontSize: "10px", fontWeight: "bold" }}>
                ROSE
              </Tag>
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
      key: "registered_at",
      sorter: (a: NongyneCytologyCase, b: NongyneCytologyCase) =>
        (a.registered_at || "").localeCompare(b.registered_at || ""),
      render: (val: string) =>
        val ? (
          <div>
            <div style={{ fontSize: 13 }}>{dayjs(val).format("DD/MM/YYYY")}</div>
            <div style={{ fontSize: 11, color: "#8c8c8c" }}>{dayjs(val).format("HH:mm")}</div>
          </div>
        ) : "—",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string, record: NongyneCytologyCase) => {
        const s = record.is_screened ? "screened" : (status ? status.toLowerCase() : "");
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
            { label: "Screened", value: "pending" },
            { label: "Sign Required", value: "co_sign" },
            { label: "All", value: "all" },
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
      title="Non-Gyne Cytology Worklist (Cytotechnologist)"
      subTitle={`Total Cases: ${total}`}
      withCard
    >
      {content}
    </PageContainer>
  );
};

export default NongyneCytoWorklist;
