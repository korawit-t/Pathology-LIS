import { useCallback, useEffect, useState } from "react";
import {
  Layout,
  Card,
  Button,
  Space,
  Alert,
  Tabs,
  Statistic,
  Badge,
  Row,
  Col,
  Select,
} from "antd";
import {
  LogoutOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../hooks/useAuth";
import SurgicalCaseService from "../../services/surgicalCaseService";
import { useTheme } from "../../contexts/ThemeContext";
import SurgicalReportHistory from "../Report/components/SurgicalReportHistory";
import GyneReportHistory from "../Report/components/GyneReportHistory";
import NonGyneReportHistory from "../Report/components/NonGyneReportHistory";

const { Header, Content } = Layout;

type StatusCardKey = "all" | "published" | "in_progress" | "unread";

const HospitalResultPage = () => {
  const { user, logout } = useAuth();
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState("surgical");
  const [noHospital, setNoHospital] = useState(false);
  const [counts, setCounts] = useState({ all: 0, published: 0, in_progress: 0, unread: 0 });
  const [activeCard, setActiveCard] = useState<StatusCardKey>("all");
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | undefined>(undefined);

  const fetchCounts = useCallback(async () => {
    try {
      const [all, pub, unread] = await Promise.all([
        SurgicalCaseService.listHospitalCases({ page: 1, size: 1 }),
        SurgicalCaseService.listHospitalCases({ page: 1, size: 1, status: "published" }),
        SurgicalCaseService.getHospitalUnreadCount(),
      ]);
      setCounts({
        all: all.total,
        published: pub.total,
        in_progress: all.total - pub.total,
        unread,
      });
    } catch (err: any) {
      if (err?.response?.status === 403) setNoHospital(true);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const summaryCards = [
    { key: "all" as StatusCardKey, title: "All Cases", value: counts.all, icon: <AppstoreOutlined style={{ fontSize: 24 }} />, color: "#1890ff", bg: "#e6f7ff" },
    { key: "published" as StatusCardKey, title: "Final Report", value: counts.published, icon: <CheckCircleOutlined style={{ fontSize: 24 }} />, color: "#52c41a", bg: "#f6ffed" },
    { key: "in_progress" as StatusCardKey, title: "In Progress", value: counts.in_progress, icon: <ClockCircleOutlined style={{ fontSize: 24 }} />, color: "#faad14", bg: "#fffbe6" },
    { key: "unread" as StatusCardKey, title: "Unread Reports", value: counts.unread, icon: <EyeOutlined style={{ fontSize: 24 }} />, color: "#f5222d", bg: "#fff1f0" },
  ];

  const hospitalIds = user?.hospital_ids || [];
  const hospitalNames = user?.hospital_names || [];
  const hospitalName = hospitalNames.length === 1 ? hospitalNames[0] : undefined;

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Header
        style={{
          background: isDarkMode ? "rgba(0,21,41,0.95)" : "rgba(255,255,255,0.95)",
          padding: "0 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: 56,
        }}
      >
        <Space align="center" size={12}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #1890ff 0%, #096dd9 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BankOutlined style={{ color: "#fff", fontSize: 18 }} />
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: isDarkMode ? "#e8e8e8" : "#1d1d1d" }}>
              Hospital Pathology Portal
            </div>
            {hospitalName && (
              <div style={{ fontSize: 12, color: "#1890ff", fontWeight: 500 }}>{hospitalName}</div>
            )}
          </div>
        </Space>
        <Button type="text" icon={<LogoutOutlined />} onClick={logout}>Sign out</Button>
      </Header>

      <Content style={{ padding: "24px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          {noHospital ? (
            <Alert
              type="warning"
              showIcon
              message="Account Not Linked to a Hospital"
              description="Your account is not linked to any hospital. Please contact the system administrator."
            />
          ) : (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {summaryCards.map((c) => (
                  <Col xs={24} sm={12} md={6} key={c.key}>
                    <Card
                      hoverable
                      onClick={() => setActiveCard(c.key)}
                      style={{
                        borderRadius: 10,
                        cursor: "pointer",
                        border: activeCard === c.key ? `2px solid ${c.color}` : "1px solid #f0f0f0",
                        background: activeCard === c.key ? c.bg : undefined,
                        transition: "all 0.2s",
                      }}
                      styles={{ body: { padding: "16px 20px" } }}
                    >
                      <Space>
                        <div style={{ color: c.color }}>{c.icon}</div>
                        <Statistic
                          title={<span style={{ fontSize: 13 }}>{c.title}</span>}
                          value={c.value}
                          valueStyle={{ color: c.color, fontSize: 24, fontWeight: 700 }}
                        />
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>

              <Card
                style={{ borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                styles={{ body: { paddingTop: 12 } }}
              >
                {hospitalIds.length > 1 && (
                  <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                    <Select
                      value={selectedHospitalId}
                      onChange={setSelectedHospitalId}
                      style={{ minWidth: 220 }}
                      placeholder="All assigned hospitals"
                      allowClear
                      options={[
                        { value: undefined, label: "All assigned hospitals" },
                        ...hospitalIds.map((id, i) => ({ value: id, label: hospitalNames[i] || `Hospital #${id}` })),
                      ]}
                    />
                  </div>
                )}
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  items={[
                    {
                      key: "surgical",
                      label: (
                        <Badge count={counts.unread} size="small" offset={[6, -2]}>
                          <span style={{ paddingRight: counts.unread > 0 ? 10 : 0 }}>
                            Surgical Pathology
                          </span>
                        </Badge>
                      ),
                      children: <SurgicalReportHistory hospital_id={selectedHospitalId} />,
                    },
                    {
                      key: "gyne",
                      label: "Gyne Cytology",
                      children: <GyneReportHistory hospital_id={selectedHospitalId} />,
                    },
                    {
                      key: "nongyne",
                      label: "Non-Gyne Cytology",
                      children: <NonGyneReportHistory hospital_id={selectedHospitalId} />,
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default HospitalResultPage;
