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
import type { User } from "../../types/user";

const { Text } = Typography;

interface Props {
  user: User;
  onNavigate?: (view: string) => void;
}

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

  const WORKLIST = [
    {
      key: "diagnosis",
      label: "Pending Diagnosis",
      sublabel: "Slides ready to read",
      value: stats.pendingDiagnosis,
      color: "#eb2f96",
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
      color: "#722ed1",
      icon: <ScissorOutlined />,
      action: "grossing",
    },
    {
      key: "stains",
      label: "Special Stains",
      sublabel: "Awaiting stain results",
      value: stats.pendingSpecialStains,
      color: "#fa541c",
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
      color: "#2f54eb",
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
      color: "#13c2c2",
      icon: <EyeOutlined />,
      action: "pathologist-page",
    },
    {
      key: "addendum",
      label: "Addendum",
      sublabel: "Post-report amendments",
      value: stats.pendingAddendum,
      color: "#faad14",
      icon: <FileDoneOutlined />,
      action: "pathologist-page",
    },
  ];

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
        {[
          { label: "Total Assigned", value: totalPending, color: "#1890ff", suffix: "cases" },
          { label: "Pending Diagnosis", value: stats.pendingDiagnosis, color: "#eb2f96", suffix: "cases" },
          {
            label: "TAT Overdue",
            value: totalOverdue,
            color: totalOverdue > 0 ? "#f5222d" : "#52c41a",
            suffix: "cases",
            extra: totalOverdue === 0
              ? <CheckCircleOutlined style={{ color: "#52c41a", marginLeft: 6 }} />
              : <WarningOutlined style={{ color: "#f5222d", marginLeft: 6 }} />,
          },
          { label: "Awaiting Workup", value: awaitingWorkup, color: "#fa541c", suffix: "stains/IHC" },
        ].map((s) => (
          <Col xs={12} sm={6} key={s.label}>
            <Card
              style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", background: cardBg }}
              styles={{ body: { padding: "16px 20px" } }}
            >
              <Statistic
                title={
                  <Text style={{ fontSize: 12, color: "#8c8c8c" }}>{s.label}</Text>
                }
                value={s.value}
                valueStyle={{ fontSize: 26, fontWeight: 600, color: s.color, lineHeight: 1 }}
                suffix={
                  <span style={{ fontSize: 11, color: "#bfbfbf", marginLeft: 4 }}>
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
          <Row gutter={[16, 16]}>
            {WORKLIST.filter((item) => item.value > 0).map((item) => {
              const hasOverdue = (item.tatOverdue || 0) > 0;
              const hasWarning = !hasOverdue && (item.tatWarning || 0) > 0;

              return (
                <Col xs={24} sm={12} lg={8} key={item.key}>
                  <Card
                    className="path-worklist-card"
                    bordered={false}
                    onClick={() => nav(item.action)}
                    style={{ background: subBg }}
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
                          background: hasOverdue ? "#ff4d4f" : "#faad14",
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
                          <Text strong style={{ fontSize: 13, color: isDarkMode ? "#ddd" : "#595959" }}>
                            {item.label}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {item.sublabel}
                          </Text>
                        </Space>
                      }
                      value={item.value}
                      valueStyle={{
                        fontSize: 32, fontWeight: 600,
                        color: item.color,
                        lineHeight: 1.1, marginTop: 4,
                      }}
                      suffix={
                        <span style={{ fontSize: 12, color: "#bfbfbf", marginLeft: 4 }}>
                          Cases
                        </span>
                      }
                    />

                    {/* Action link */}
                    <div className="card-action" style={{ color: item.color }}>
                      <Text style={{ fontSize: 12, color: item.color }}>Open worklist</Text>
                      <ArrowRightOutlined style={{ fontSize: 11 }} />
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
        </Spin>
      </Card>

    </div>
  );
};

export default PathologistDashboard;
