import React, { useState, useEffect } from "react";
import {
  Card,
  Col,
  Row,
  Statistic,
  Spin,
  DatePicker,
  Space,
  Button,
  Divider,
  Tag,
  Select,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ScissorOutlined,
  ExperimentOutlined,
  PrinterOutlined,
  SendOutlined,
  InboxOutlined,
  FileProtectOutlined,
  PartitionOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalReportService from "../../services/surgicalReportService";
import UserService from "../../services/userService";
import { LabTechStatResponse } from "../../types/surgicalReport";
import type { User } from "../../types/user";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, suffix = "items", icon, color, bg, border }) => (
  <Col xs={24} sm={12} md={8}>
    <Card
      style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8 }}
      bodyStyle={{ padding: "20px 24px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: `${color}20`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          {icon}
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#595959" }}>{label}</span>
      </div>
      <Statistic
        value={value}
        valueStyle={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}
        suffix={
          <span style={{ fontSize: 12, color: "#8c8c8c", marginLeft: 4 }}>{suffix}</span>
        }
      />
    </Card>
  </Col>
);

const LAB_TECH_ROLES = ["histo", "gross", "immuno", "cytotechnologist", "register", "lab_manager", "admin"];

const LabTechStatPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LabTechStatResponse | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs().subtract(30, "days"),
    dayjs(),
  ]);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    UserService.getUsers().then((all: User[]) => {
      const filtered = all.filter((u) =>
        u.roles?.some((r: string) => LAB_TECH_ROLES.includes(r))
      );
      setUsers(filtered.length > 0 ? filtered : all);
    }).catch((e) => logger.error(e));
  }, []);

  useEffect(() => {
    fetchStats();
  }, [dateRange, selectedUserId]);

  const fetchStats = async () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return;
    setLoading(true);
    try {
      const res = await SurgicalReportService.getLabTechStatistics(
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
        selectedUserId,
      );
      setStats(res);
    } catch (e) {
      logger.error(e);
    } finally {
      setLoading(false);
    }
  };

  const WORKFLOW_CARDS: StatCardProps[] = [
    {
      label: "Grossing",
      value: stats?.grossed_cases ?? 0,
      suffix: "cases",
      icon: <ScissorOutlined />,
      color: "#722ed1",
      bg: "#f9f0ff",
      border: "#d3adf7",
    },
    {
      label: "Embedding",
      value: stats?.embedded_blocks ?? 0,
      suffix: "blocks",
      icon: <InboxOutlined />,
      color: "#1890ff",
      bg: "#e6f7ff",
      border: "#91d5ff",
    },
    {
      label: "Sectioning",
      value: stats?.sectioned_blocks ?? 0,
      suffix: "blocks",
      icon: <PartitionOutlined />,
      color: "#13c2c2",
      bg: "#e6fffb",
      border: "#87e8de",
    },
    {
      label: "Staining",
      value: stats?.stained_blocks ?? 0,
      suffix: "blocks",
      icon: <ExperimentOutlined />,
      color: "#fa8c16",
      bg: "#fff7e6",
      border: "#ffd591",
    },
    {
      label: "Sticker (Slides)",
      value: stats?.total_slides ?? 0,
      suffix: "slides",
      icon: <PrinterOutlined />,
      color: "#eb2f96",
      bg: "#fff0f6",
      border: "#ffadd2",
    },
    {
      label: "Dispatch",
      value: stats?.dispatched_cases ?? 0,
      suffix: "cases",
      icon: <FileProtectOutlined />,
      color: "#52c41a",
      bg: "#f6ffed",
      border: "#b7eb8f",
    },
    {
      label: "Send Outlab",
      value: stats?.outlab_sent_blocks ?? 0,
      suffix: "blocks",
      icon: <SendOutlined />,
      color: "#faad14",
      bg: "#fffbe6",
      border: "#ffe58f",
    },
  ];

  return (
    <div>
      {/* Filter bar */}
      <Card style={{ marginBottom: 24 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(dates) => { if (dates) setDateRange(dates); }}
            format="DD/MM/YYYY"
          />
          <Select
            allowClear
            placeholder="All Staff"
            value={selectedUserId}
            onChange={setSelectedUserId}
            style={{ width: 220 }}
            options={users.map((u) => ({
              value: u.id,
              label: u.full_name || u.username,
            }))}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={fetchStats}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setDateRange([dayjs().subtract(30, "days"), dayjs()]);
              setSelectedUserId(undefined);
            }}
          >
            Reset
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        {/* Workflow stats */}
        <Row gutter={[16, 16]}>
          {WORKFLOW_CARDS.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </Row>

        {/* Specimen complexity */}
        <Divider
          titlePlacement="left"
          style={{ marginTop: 28, marginBottom: 16, fontWeight: 600, color: "#595959" }}
        >
          Specimen Complexity
        </Divider>
        <Row gutter={[16, 16]}>
          {(
            [
              { key: "small",  label: "Small",  color: "#52c41a", bg: "#f6ffed", border: "#b7eb8f" },
              { key: "medium", label: "Medium", color: "#faad14", bg: "#fffbe6", border: "#ffe58f" },
              { key: "large",  label: "Large",  color: "#f5222d", bg: "#fff1f0", border: "#ffa39e" },
            ] as const
          ).map(({ key, label, color, bg, border }) => (
            <Col xs={24} sm={8} key={key}>
              <Card
                style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8 }}
                bodyStyle={{ padding: "20px 24px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Tag
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "2px 12px",
                      borderRadius: 20,
                      color: "#fff",
                      background: color,
                      border: "none",
                    }}
                  >
                    {label}
                  </Tag>
                </div>
                <Statistic
                  title={<span style={{ color: "#595959", fontSize: 13 }}>Specimen (items)</span>}
                  value={stats?.complexity_breakdown?.[key] ?? 0}
                  valueStyle={{ fontSize: 32, fontWeight: 800, color }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Spin>
    </div>
  );
};

export default LabTechStatPage;
