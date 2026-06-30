import React, { useEffect, useState } from "react";
import { Tabs, Button, Badge, Modal, Typography, Tag, Space, Alert, Table, Spin } from "antd";
import {
  ReloadOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  GlobalOutlined,
  CommentOutlined,
  QuestionCircleOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserSwitchOutlined,
  FileTextOutlined,
  FormOutlined,
  FilePdfOutlined,
  LockOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;
import { useSurgicalCaseWorklist } from "./hooks/useCaseWorklist";
import SurgicalCaseWorklist, { WorklistRow } from "./SurgicalDiagnosisReportForm/SurgicalCaseWorklist";
import type { User } from "../../types/user";
import PathologistService from "../../services/pathologistService";
import { calculateTATProgress } from "../../utils/tatUtils";
import { CASE_STATUS } from "../../constants/lab.constants";
import GyneCytoWorklist from "../GyneCytoDiagnosis/GyneCytoWorklist";
import PathologistNongyneWorklist from "../NongyneCytoDiagnosis/PathologistNongyneWorklist";
import MySlideDispatches from "./components/MySlideDispatches";
import MyReadyStains from "./components/MyReadyStains";
import MyWorkloadSummary from "./components/MyWorkloadSummary";
import MyConsultCases from "./components/MyConsultCases";
import InternalConsultWorklistPanel from "../../components/InternalConsult/InternalConsultWorklistPanel";
import PageContainer from "../../components/Layout/PageContainer";
import { useTheme } from "../../contexts/ThemeContext";
import api from "../../services/httpClient";

interface ReadyStainCase {
  stains: Array<{ status: string }>;
}

const PathologistPage: React.FC<{
  user: User;
  onSelectCase: (id: number, type?: "surgical" | "gyne" | "nongyne") => void;
  defaultTab?: string;
}> = ({ user, onSelectCase, defaultTab }) => {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(defaultTab || "surgical");
  const [readyStainCount, setReadyStainCount] = useState(0);
  const [cytoRefreshTrigger, setCytoRefreshTrigger] = useState(0);
  const [pendingConsultCount, setPendingConsultCount] = useState(0);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [tatCases, setTatCases] = useState<(WorklistRow & { tatPercent: number; tatDisplay: string })[]>([]);
  const [tatLoading, setTatLoading] = useState(false);

  const {
    filteredData,
    slideSentTotal,
    pendingTotal,
    coSignTotal,
    loading,
    setSearchText,
    systemSettings,
    refresh,
    pagination,
    setPagination,
    currentStatus,
    setCurrentStatus,
    holidays,
  } = useSurgicalCaseWorklist(user?.id);

  const handleRefresh = () => {
    refresh();
    setCytoRefreshTrigger((n) => n + 1);
  };

  useEffect(() => {
    if (activeTab !== "tat-overdue" || !user?.id || !systemSettings) return;
    setTatLoading(true);
    PathologistService.getMyWorklist(user.id, 0, 500, "", "ALL")
      .then((data: any) => {
        const items: WorklistRow[] = Array.isArray(data) ? data : (data.items ?? []);
        const overdue = items
          .flatMap((row) => {
            const tat = calculateTATProgress(row.registered_at ?? "", "SURGICAL", systemSettings, row.is_express, holidays);
            if (!tat?.isOverdue) return [];
            return [{ ...row, tatPercent: tat.percent, tatDisplay: tat.displayTime }];
          })
          .sort((a, b) => b.tatPercent - a.tatPercent);
        setTatCases(overdue);
      })
      .catch(() => {})
      .finally(() => setTatLoading(false));
  }, [activeTab, user?.id, systemSettings, holidays]);

  useEffect(() => {
    if (!user?.id) return;
    api
      .get("/surgical-block-stains/ready-additional", {
        params: { pathologist_id: user.id },
      })
      .then((res) => {
        const cases = res.data as ReadyStainCase[];
        const readyCount = cases.reduce(
          (sum: number, c: ReadyStainCase) =>
            sum + c.stains.filter((s) => s.status === "stained").length,
          0,
        );
        setReadyStainCount(readyCount);
      })
      .catch(() => {});
  }, [user?.id]);

const renderWorklist = (
    data: WorklistRow[],
    totalCount: number,
    category: "SURGICAL" | "NON_GYNE" = "SURGICAL",
  ) => (
    <SurgicalCaseWorklist
      dataSource={data}
      loading={loading}
      total={totalCount}
      pagination={pagination}
      setPagination={setPagination}
      selectedStatus={currentStatus}
      setSelectedStatus={setCurrentStatus}
      onSearch={setSearchText}
      onSelectCase={onSelectCase}
      settings={systemSettings}
      holidays={holidays}
      category={category}
      slideSentCount={slideSentTotal}
      pendingCount={pendingTotal}
      coSignCount={coSignTotal}
    />
  );

  const tatColumns = [
    {
      title: "Accession No",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      render: (v: string) => <Text strong style={{ fontFamily: "monospace" }}>{v ?? "-"}</Text>,
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, row: WorklistRow) => {
        const name = [row.patient?.title?.title, row.patient?.name, row.patient?.ln]
          .filter(Boolean).join(" ") || row.patient_name || "-";
        return <Text>{name}</Text>;
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (s: string) => <Tag color={s === CASE_STATUS.SLIDE_SENT ? "blue" : "orange"}>{s}</Tag>,
    },
    {
      title: "TAT Elapsed",
      key: "tat",
      width: 120,
      render: (_: unknown, row: WorklistRow & { tatDisplay: string }) => (
        <Tag color="red" icon={<WarningOutlined />}>{row.tatDisplay}</Tag>
      ),
    },
  ];

  const renderTATOverdue = () => {
    if (!tatLoading && tatCases.length === 0) {
      return (
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a", marginBottom: 12 }} />
          <div style={{ fontSize: 15, color: "#52c41a", fontWeight: 600 }}>All your cases are on track</div>
          <div style={{ fontSize: 13, color: "#8c8c8c", marginTop: 4 }}>No cases exceeding SLA turnaround time</div>
        </div>
      );
    }
    return (
      <Spin spinning={tatLoading}>
        {tatCases.length > 0 && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            message={`${tatCases.length} case${tatCases.length > 1 ? "s" : ""} exceeded turnaround time — most overdue shown first`}
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}
        <Table<WorklistRow & { tatPercent: number; tatDisplay: string }>
          dataSource={tatCases}
          columns={tatColumns}
          rowKey="id"
          size="small"
          pagination={false}
          onRow={(row) => ({ onClick: () => onSelectCase(row.id), style: { cursor: "pointer" } })}
          locale={{ emptyText: tatLoading ? " " : "No overdue cases" }}
        />
      </Spin>
    );
  };

  const tabItems = [
    {
      key: "surgical",
      label: (
        <span>
          Surgical <Badge count={slideSentTotal || 0} size="small" color="blue" />
        </span>
      ),
      children: renderWorklist(filteredData.surgical, filteredData.total, "SURGICAL"),
    },
    {
      key: "gyne",
      label: (
        <span>
          Gyne Cytology <Badge count={filteredData.gyneTotal || 0} size="small" color="blue" />
        </span>
      ),
      children: (
        <GyneCytoWorklist onSelectCase={(id) => onSelectCase(id, "gyne")} standAlone={false} refreshTrigger={cytoRefreshTrigger} />
      ),
    },
    {
      key: "nongyne",
      label: (
        <span>
          Non-Gyne <Badge count={filteredData.nonGyneTotal || 0} size="small" color="blue" />
        </span>
      ),
      children: (
        <PathologistNongyneWorklist onSelectCase={(id) => onSelectCase(id, "nongyne")} standAlone={false} refreshTrigger={cytoRefreshTrigger} />
      ),
    },
    {
      key: "ready-stains",
      label: (
        <span>
          <ExperimentOutlined style={{ marginRight: 6 }} />
          Special/IHC <Badge count={readyStainCount} size="small" color="purple" />
        </span>
      ),
      children: (
        <MyReadyStains onSelectCase={(id) => onSelectCase(id, "surgical")} pathologistId={user?.id} />
      ),
    },
    {
      key: "consult",
      label: (
        <span>
          <GlobalOutlined style={{ marginRight: 6 }} />
          External Consult
        </span>
      ),
      children: (
        <MyConsultCases pathologistId={user?.id} onSelectCase={(id) => onSelectCase(id, "surgical")} />
      ),
    },
    {
      key: "internal-consult",
      label: (
        <span>
          <CommentOutlined style={{ marginRight: 6 }} />
          Internal Consult{" "}
          <Badge count={pendingConsultCount} size="small" color="orange" />
        </span>
      ),
      children: <InternalConsultWorklistPanel onCountChange={setPendingConsultCount} />,
    },
    {
      key: "dispatches",
      label: (
        <span>
          <DeploymentUnitOutlined style={{ marginRight: 6 }} />
          My Slide Dispatches
        </span>
      ),
      children: user?.id ? <MySlideDispatches pathologistId={user.id} /> : null,
    },
    {
      key: "workload",
      label: (
        <span>
          <BarChartOutlined style={{ marginRight: 6 }} />
          My Workload
        </span>
      ),
      children: user?.id ? <MyWorkloadSummary pathologistId={user.id} /> : null,
    },
    {
      key: "tat-overdue",
      label: (
        <span>
          <ClockCircleOutlined style={{ marginRight: 6, color: tatCases.length > 0 ? "#ff4d4f" : undefined }} />
          TAT Overdue
          {tatCases.length > 0 && <Badge count={tatCases.length} size="small" color="red" style={{ marginLeft: 6 }} />}
        </span>
      ),
      children: renderTATOverdue(),
    },
  ];

  return (
    <PageContainer
      withCard
      title="My Diagnosis Worklist"
      // ใส่ปุ่ม Refresh ไว้ที่มุมบนขวาของ Page Header
      extra={
        <Space>
          <Button icon={<QuestionCircleOutlined />} onClick={() => setWorkflowOpen(true)}>
            Workflow
          </Button>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={handleRefresh}
            loading={loading}
            type={isDarkMode ? "default" : "primary"}
            ghost={isDarkMode}
          >
            Refresh
          </Button>
        </Space>
      }
      cardProps={{
        bodyStyle: { paddingTop: 8 },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        type="line"
        size="large"
        tabBarStyle={{ marginBottom: 24 }}
      />

      <Modal
        title={
          <Space>
            <QuestionCircleOutlined style={{ color: "#1677ff" }} />
            <span>คู่มือ Workflow</span>
          </Space>
        }
        open={workflowOpen}
        onCancel={() => setWorkflowOpen(false)}
        footer={null}
        width={660}
      >
        <Tabs
          type="card"
          size="small"
          items={[
            {
              key: "surgical-report",
              label: (
                <span><FileTextOutlined style={{ marginRight: 6 }} />Surgical Report</span>
              ),
              children: (
                <div style={{ padding: "8px 4px" }}>
                  {[
                    {
                      icon: <FileTextOutlined style={{ color: "#1677ff" }} />,
                      title: "เปิด Case",
                      desc: (
                        <>
                          เลือก Case จาก Worklist ที่มีสถานะ{" "}
                          <Tag color="blue">Slide Sent</Tag>{" "}
                          หรือ <Tag color="orange">Pending Diagnosis</Tag>{" "}
                          → คลิกเปิดฟอร์ม Report
                        </>
                      ),
                      status: <Tag color="blue">Slide Sent</Tag>,
                    },
                    {
                      icon: <FormOutlined style={{ color: "#1677ff" }} />,
                      title: "เลือก Diagnosis Mode",
                      desc: (
                        <>
                          เลือกรูปแบบ Diagnosis:{" "}
                          <Tag>Individual</Tag> (แยกตัวอย่าง),{" "}
                          <Tag>Integrated</Tag> (รวมทุกตัวอย่าง), หรือ{" "}
                          <Tag>Free Text</Tag> (อิสระ)
                        </>
                      ),
                      status: null,
                    },
                    {
                      icon: <FormOutlined style={{ color: "#faad14" }} />,
                      title: "เขียน Diagnosis",
                      desc: (
                        <>
                          กรอก pathology findings ในช่อง Diagnosis — ระบบ auto-save ทุก 45 วินาที;
                          กด <Tag>Ctrl/⌘ + S</Tag> เพื่อ save ด้วยตนเอง
                        </>
                      ),
                      status: <Tag color="gold">Draft</Tag>,
                    },
                    {
                      icon: <FilePdfOutlined style={{ color: "#1677ff" }} />,
                      title: "Preview PDF",
                      desc: (
                        <>
                          กด <Tag>Preview</Tag> หรือ <Tag>Ctrl/⌘ + Shift + P</Tag>{" "}
                          เพื่อดูตัวอย่าง PDF ก่อน Finalize
                        </>
                      ),
                      status: null,
                    },
                    {
                      icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
                      title: "Finalize / Sign Off",
                      desc: (
                        <>
                          คลิก <Tag color="green">Finalize</Tag>{" "}
                          → ประเมิน Color / Tissue / Slide Quality → เลือกสถานะ:
                          <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: "3px solid #f0f0f0" }}>
                            <div>
                              <Tag color="green">Finalized</Tag>{" "}
                              → Report สมบูรณ์ ระบบสร้าง PDF snapshot และ Lock case
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag color="orange">Pending</Tag>{" "}
                              → รอผล IHC / Stain / Consult — ต้องระบุเหตุผล
                            </div>
                          </div>
                        </>
                      ),
                      status: <Tag color="green">Published</Tag>,
                    },
                    {
                      icon: <LockOutlined style={{ color: "#ff4d4f" }} />,
                      title: "Report ถูก Lock",
                      desc: (
                        <>
                          Report กลายเป็น Immutable Snapshot — หากต้องแก้ไขภายหลัง ให้ใช้{" "}
                          <Tag color="blue">Add Addendum</Tag> และเลือกประเภท:
                          <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: "3px solid #f0f0f0" }}>
                            <div><Tag>Addendum</Tag> — เพิ่มข้อมูล ไม่เปลี่ยนผล</div>
                            <div style={{ marginTop: 4 }}><Tag color="orange">Corrected</Tag> — แก้ typo / ข้อมูลเล็กน้อย</div>
                            <div style={{ marginTop: 4 }}><Tag color="red">Revised</Tag> — เปลี่ยนผลกระทบต่อการดูแลผู้ป่วย</div>
                          </div>
                        </>
                      ),
                      status: <Tag color="default">Signed Out</Tag>,
                    },
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, marginBottom: 20 }}>
                      <div style={{ flexShrink: 0, paddingTop: 2, fontSize: 18 }}>{step.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <Text strong>{step.title}</Text>
                          {step.status}
                        </div>
                        <Text style={{ fontSize: 13, color: "#595959" }}>{step.desc}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: "internal-consult",
              label: (
                <span><MessageOutlined style={{ marginRight: 6 }} />Internal Consult</span>
              ),
              children: (
                <div style={{ padding: "8px 4px" }}>
                  {[
                    {
                      icon: <MessageOutlined style={{ color: "#1677ff" }} />,
                      title: "ขอ Consult",
                      desc: (
                        <>
                          เปิด case ที่ต้องการขอความเห็น → ในส่วน Signatories คลิก{" "}
                          <Tag color="blue">Request Internal Consult</Tag>{" "}
                          → เลือกแพทย์ที่จะขอความเห็น + ระบุคำถาม/เหตุผล
                        </>
                      ),
                      status: <Tag color="orange">Pending</Tag>,
                    },
                    {
                      icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
                      title: "ตอบ Consult",
                      desc: (
                        <>
                          แพทย์ที่ถูกขอจะเห็น Consult ในแท็บ{" "}
                          <Tag color="orange">Internal Consult</Tag>{" "}
                          ของ Dashboard → คลิก <Tag>Respond</Tag> → กรอกความเห็น
                        </>
                      ),
                      status: <Tag color="blue">Responded</Tag>,
                    },
                    {
                      icon: <UserSwitchOutlined style={{ color: "#722ed1" }} />,
                      title: "Promote หรือ Close",
                      desc: (
                        <>
                          ผู้ขอเห็น opinion แล้วเลือกได้ 2 ทาง:
                          <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: "3px solid #f0f0f0" }}>
                            <div>
                              <Tag color="purple">Promote to Co-signer</Tag>{" "}
                              → แพทย์ที่ถูกขอเข้าสู่ระบบ Signatories และต้อง Co-sign report
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag color="default">Close</Tag>{" "}
                              → ปิด Consult โดยไม่เพิ่มเป็น Co-signer (บันทึกเพื่อ audit เท่านั้น)
                            </div>
                          </div>
                        </>
                      ),
                      status: <Tag color="default">Closed</Tag>,
                    },
                    {
                      icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
                      title: "ข้อจำกัด",
                      desc: (
                        <>
                          <div>• Consult ต้องทำบน Report ที่ไม่ใช่ Draft (ต้องอยู่ใน{" "}
                          <Tag color="gold">Pending Approval</Tag> ขึ้นไป)</div>
                          <div style={{ marginTop: 4 }}>• Promote to Co-signer ได้เฉพาะตอน Report อยู่ใน{" "}
                          <Tag color="gold">Pending Approval</Tag> เท่านั้น</div>
                          <div style={{ marginTop: 4 }}>• ผู้ขอและผู้ถูกขอต้องเป็นคนละคน</div>
                        </>
                      ),
                      status: null,
                    },
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, marginBottom: 20 }}>
                      <div style={{ flexShrink: 0, paddingTop: 2, fontSize: 18 }}>{step.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <Text strong>{step.title}</Text>
                          {step.status}
                        </div>
                        <Text style={{ fontSize: 13, color: "#595959" }}>{step.desc}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </PageContainer>
  );
};

export default PathologistPage;
