import React from "react";
import {
  Row, Col, Card, Typography, Space, Alert,
  Statistic, Tooltip, Spin, Button, Divider,
} from "antd";
import {
  ScissorOutlined, FileSearchOutlined, TagsOutlined,
  ExperimentOutlined, EyeOutlined, FileDoneOutlined,
  WarningOutlined, ArrowRightOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import { useTheme } from "../../contexts/ThemeContext";
import { usePathologistStats } from "./PendingTask/Pathologist/hooks/usePathologistStats";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { UI_COLOR, WORKFLOW_COLOR } from "../../constants/theme";
import type { User } from "../../types/user";

const { Text } = Typography;

interface Props {
  user: User;
  onNavigate?: (view: string) => void;
}

// Work-type identity colors — reuses this app's existing WORKFLOW_COLOR constants
// (already the brand palette for AccessionTag/section headers/type badges) where a
// named stage matches; the 3 without a named stage (IHC, Peer Review, Addendum) get
// antd-preset-consistent hues instead of inventing an unrelated palette. Dark-mode
// steps are re-picked per hue (not a flat flip) and the whole set is CVD-validated
// via the dataviz skill's validate_palette.js — worst adjacent CVD deltaE 16.1 (light)
// / 10.5 (dark, floor band — relief covered by the always-visible text label).
const CATEGORICAL = {
  diagnosis: { light: WORKFLOW_COLOR.diagnosis, dark: WORKFLOW_COLOR.diagnosis },
  grossing: { light: WORKFLOW_COLOR.grossing, dark: "#9254de" },
  staining: { light: WORKFLOW_COLOR.staining, dark: WORKFLOW_COLOR.staining },
  immuno: { light: "#13c2c2", dark: "#08979c" },
  review: { light: "#fa8c16", dark: "#d46b08" },
  addendum: { light: "#2f54eb", dark: "#597ef7" },
} as const;

// Fixed status scale — reuses this app's existing UI_COLOR semantics (already used
// for status tags/alerts everywhere else), reserved for state and never for identity.
const STATUS = {
  good: UI_COLOR.success,
  warning: UI_COLOR.warning,
  critical: UI_COLOR.danger,
};

const CSS = `
  .path-worklist-card {
    border-radius: 8px; cursor: pointer; height: 100%; position: relative; overflow: hidden;
    transition: all 0.2s ease;
  }
  .path-worklist-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .path-worklist-card .card-icon {
    width: 44px; height: 44px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; margin-bottom: 10px;
    transition: transform 0.2s ease;
  }
  .path-worklist-card:hover .card-icon { transform: scale(1.05); }
  .path-worklist-card .card-action {
    margin-top: 10px; display: flex; align-items: center; gap: 4px;
    opacity: 0.6; transition: opacity 0.2s;
  }
  .path-worklist-card:hover .card-action { opacity: 1; }
  .path-worklist-card .bg-icon {
    position: absolute; right: -6px; bottom: -8px;
    font-size: 60px; opacity: 0.04; pointer-events: none; transform: rotate(-15deg);
  }
`;


const PathologistDashboard: React.FC<Props> = ({ user, onNavigate }) => {
  const { isDarkMode } = useTheme();
  const { stats, loading: statsLoading } = usePathologistStats(user?.id);
  const { summary } = useDashboardSummary();

  const nav = (v: string) => onNavigate?.(v);
  const hue = (name: keyof typeof CATEGORICAL) => CATEGORICAL[name][isDarkMode ? "dark" : "light"];

  const inkPrimary = isDarkMode ? "#ffffff" : "#0b0b0b";
  const inkSecondary = isDarkMode ? "#c3c2b7" : "#52514e";
  const inkMuted = "#898781";

  const overdueByStatus = summary.tat_overdue.by_status;
  const warningByStatus = summary.tat_warning.by_status;
  const totalOverdue = summary.tat_overdue.total;
  const totalWarning = summary.tat_warning.total;

  const totalPending =
    stats.pendingDiagnosis + stats.pendingGross +
    stats.pendingSpecialStains + stats.pendingImmuno +
    stats.pendingPeerReview + stats.pendingAddendum;
  const awaitingWorkup = stats.pendingSpecialStains + stats.pendingImmuno;

  const cardBg = isDarkMode ? "#1f1f1f" : "#fff";
  const subBg = isDarkMode ? "rgba(255,255,255,0.04)" : "#fafafa";

  // Only tiles that carry real meaning (a single category, or a state) get color;
  // plain aggregate counts stay in neutral ink so color keeps doing identity/status work.
  const KPIS = [
    { key: "total", label: "Total Assigned", value: totalPending, suffix: "cases", color: inkPrimary },
    { key: "diagnosis", label: "Pending Diagnosis", value: stats.pendingDiagnosis, suffix: "cases", color: hue("diagnosis") },
    {
      key: "tat",
      label: "TAT Overdue",
      value: totalOverdue,
      suffix: "cases",
      color: totalOverdue > 0 ? STATUS.critical : STATUS.good,
      extra: totalOverdue === 0
        ? <CheckCircleOutlined style={{ color: STATUS.good, marginLeft: 6 }} />
        : <WarningOutlined style={{ color: STATUS.critical, marginLeft: 6 }} />,
    },
    { key: "workup", label: "Awaiting Workup", value: awaitingWorkup, suffix: "stains/IHC", color: inkPrimary },
  ];

  const WORKLIST = [
    {
      key: "diagnosis",
      label: "Pending Diagnosis",
      sublabel: "Slides ready to read",
      value: stats.pendingDiagnosis,
      color: hue("diagnosis"),
      icon: <FileSearchOutlined />,
      action: "pathologist-page",
      tatOverdue: overdueByStatus["slide sent"] || 0,
      tatWarning: warningByStatus["slide sent"] || 0,
    },
    {
      key: "gross",
      label: "Pending Gross",
      sublabel: "Awaiting gross examination",
      value: stats.pendingGross,
      color: hue("grossing"),
      icon: <ScissorOutlined />,
      action: "grossing",
    },
    {
      key: "stains",
      label: "Special Stains",
      sublabel: "Awaiting stain results",
      value: stats.pendingSpecialStains,
      color: hue("staining"),
      icon: <TagsOutlined />,
      action: "pathologist-page",
      tatOverdue: overdueByStatus["pending special stains"] || 0,
      tatWarning: warningByStatus["pending special stains"] || 0,
    },
    {
      key: "immuno",
      label: "IHC / Immuno",
      sublabel: "Awaiting IHC results",
      value: stats.pendingImmuno,
      color: hue("immuno"),
      icon: <ExperimentOutlined />,
      action: "pathologist-page",
      tatOverdue: overdueByStatus["pending immuno"] || 0,
      tatWarning: warningByStatus["pending immuno"] || 0,
    },
    {
      key: "review",
      label: "Peer Review",
      sublabel: "Cases for peer consultation",
      value: stats.pendingPeerReview,
      color: hue("review"),
      icon: <EyeOutlined />,
      action: "pathologist-page",
    },
    {
      key: "addendum",
      label: "Addendum",
      sublabel: "Post-report amendments",
      value: stats.pendingAddendum,
      color: hue("addendum"),
      icon: <FileDoneOutlined />,
      action: "pathologist-page",
    },
  ];

  const activeWorklist = WORKLIST.filter((item) => item.value > 0);

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      {/* ── TAT alerts ─────────────────────────────────────────── */}
      {totalOverdue > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={`${totalOverdue} case${totalOverdue > 1 ? "s have" : " has"} exceeded the SLA turnaround time`}
          description="Please prioritize these cases in your worklist immediately."
          style={{ marginBottom: 16, borderRadius: 8 }}
          action={
            <Button size="small" danger onClick={() => nav("pathologist-page:tat-overdue")}>
              View Now
            </Button>
          }
        />
      )}
      {totalOverdue === 0 && totalWarning > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${totalWarning} case${totalWarning > 1 ? "s are" : " is"} approaching the SLA deadline`}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {/* ── Summary row ────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {KPIS.map((s) => (
          <Col xs={12} sm={6} key={s.key}>
            <Card
              style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", background: cardBg }}
              styles={{ body: { padding: "16px 20px" } }}
            >
              <Statistic
                title={
                  <Text style={{ fontSize: 12, color: inkMuted }}>{s.label}</Text>
                }
                value={s.value}
                valueStyle={{ fontSize: 26, fontWeight: 600, color: s.color, lineHeight: 1 }}
                suffix={
                  <span style={{ fontSize: 11, color: inkMuted, marginLeft: 4 }}>
                    {s.suffix}{s.extra}
                  </span>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Worklist cards ─────────────────────────────────────── */}
      <Card
        style={{ borderRadius: 8, marginBottom: 20, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", background: cardBg }}
        styles={{ body: { padding: "16px 20px 20px" } }}
      >
        <Row align="middle" justify="space-between" style={{ marginBottom: 14 }}>
          <Text strong style={{ fontSize: 15 }}>My Worklist</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>Click a card to open directly</Text>
        </Row>
        <Divider style={{ margin: "0 0 16px" }} />

        <Spin spinning={statsLoading}>
          {activeWorklist.length === 0 && !statsLoading ? (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <CheckCircleOutlined style={{ fontSize: 40, color: STATUS.good, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: inkPrimary }}>You&apos;re all caught up</div>
              <div style={{ fontSize: 12, color: inkSecondary, marginTop: 4 }}>No pending work items right now</div>
            </div>
          ) : (
            <Row gutter={[16, 16]}>
              {activeWorklist.map((item) => {
                const hasOverdue = (item.tatOverdue || 0) > 0;
                const hasWarning = !hasOverdue && (item.tatWarning || 0) > 0;

                return (
                  <Col xs={24} sm={12} lg={8} key={item.key}>
                    <Card
                      className="path-worklist-card"
                      bordered={false}
                      onClick={() => nav(item.action)}
                      style={{ background: subBg, borderLeft: `3px solid ${item.color}` }}
                      styles={{ body: { padding: "18px 20px 14px" } }}
                    >
                      {/* TAT badge */}
                      {(hasOverdue || hasWarning) && (
                        <Tooltip title={hasOverdue
                          ? `${item.tatOverdue} cases exceeded SLA`
                          : `${item.tatWarning} cases near SLA`
                        }>
                          <div style={{
                            position: "absolute", top: 10, right: 10,
                            background: hasOverdue ? STATUS.critical : STATUS.warning,
                            color: "#fff", borderRadius: 20,
                            padding: "2px 8px", fontSize: 11, fontWeight: 700,
                            display: "flex", alignItems: "center", gap: 3,
                          }}>
                            <WarningOutlined style={{ fontSize: 10 }} />
                            {hasOverdue ? item.tatOverdue : item.tatWarning}
                          </div>
                        </Tooltip>
                      )}

                      {/* Icon */}
                      <div
                        className="card-icon"
                        style={{ background: `${item.color}18`, color: item.color }}
                      >
                        {item.icon}
                      </div>

                      {/* Stats */}
                      <Statistic
                        title={
                          <Space direction="vertical" size={0}>
                            <Text strong style={{ fontSize: 13, color: inkSecondary }}>
                              {item.label}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11, color: inkMuted }}>
                              {item.sublabel}
                            </Text>
                          </Space>
                        }
                        value={item.value}
                        valueStyle={{
                          fontSize: 32, fontWeight: 600,
                          color: inkPrimary,
                          lineHeight: 1.1, marginTop: 4,
                        }}
                        suffix={
                          <span style={{ fontSize: 12, color: inkMuted, marginLeft: 4 }}>
                            Cases
                          </span>
                        }
                      />

                      {/* Action link */}
                      <div className="card-action">
                        <Text style={{ fontSize: 12, color: inkSecondary }}>Open worklist</Text>
                        <ArrowRightOutlined style={{ fontSize: 11, color: item.color }} />
                      </div>

                      {/* BG icon */}
                      <div className="bg-icon" style={{ color: item.color }}>
                        {item.icon}
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </Spin>
      </Card>

    </div>
  );
};

export default PathologistDashboard;
