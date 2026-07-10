import React, { useState } from "react";
import { Switch, Space, Typography, Input, message } from "antd";
import PendingTasks from "./PendingTask/PendingTasks";
import PageContainer from "../../components/Layout/PageContainer";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import PathologistDashboard from "./PathologistDashboard";
import SurgicalCaseService from "../../services/surgicalCaseService";
import logger from "../../utils/logger";

import type { User } from "../../types/user";

const { Text } = Typography;

interface DashboardHomeProps {
  user: User;
  onNavigate?: (view: string) => void;
  onSelectCase?: (id: number, type?: "surgical" | "gyne" | "nongyne") => void;
}

const isPathologistOnly = (user: User) => {
  const roles: string[] = (user?.roles as string[]) || [];
  return roles.includes("pathologist") && !roles.includes("admin") && !roles.includes("lab_manager");
};

const CASE_TYPE_MAP: Record<string, "surgical" | "gyne" | "nongyne"> = {
  SURGICAL: "surgical",
  GYNE: "gyne",
  NONGYNE: "nongyne",
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const DashboardHome: React.FC<DashboardHomeProps> = ({ user, onNavigate, onSelectCase }) => {
  const { summary, loading: summaryLoading } = useDashboardSummary();
  const [hideZero, setHideZero] = useState(true);
  const [accessionSearch, setAccessionSearch] = useState("");
  const [accessionLoading, setAccessionLoading] = useState(false);

  const handleAccessionSearch = async (value: string) => {
    const query = value.trim();
    if (!query) return;
    if (query.length < 3) {
      message.warning("กรุณากรอก Accession No อย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (!onSelectCase) return;
    setAccessionLoading(true);
    try {
      const res = await SurgicalCaseService.searchPublicAllCases(query, 1, 10);
      const match = res.items.find(
        (item) => item.accession_no.toLowerCase() === query.toLowerCase(),
      );
      if (!match) {
        message.error(`ไม่พบเคส Accession No "${query}"`);
        return;
      }
      onSelectCase(match.case_id, CASE_TYPE_MAP[match.case_type]);
      setAccessionSearch("");
    } catch (error) {
      logger.error("Accession lookup error:", error);
      message.error("ค้นหาเคสไม่สำเร็จ");
    } finally {
      setAccessionLoading(false);
    }
  };

  if (isPathologistOnly(user)) {
    return (
      <PageContainer
        withCard
        title={`${getGreeting()}, ${user?.full_name || user?.username}`}
        extra={
          <Input.Search
            placeholder="Accession No"
            allowClear
            enterButton
            style={{ width: 220 }}
            value={accessionSearch}
            onChange={(e) => setAccessionSearch(e.target.value)}
            onSearch={handleAccessionSearch}
            loading={accessionLoading}
          />
        }
        cardProps={{ bodyStyle: { paddingTop: 8 } }}
      >
        <PathologistDashboard user={user} onNavigate={onNavigate} />
      </PageContainer>
    );
  }

  return (
    <PageContainer withCard cardProps={{ bodyStyle: { padding: "8px 20px 24px 20px" } }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Space size={8}>
            <Text type="secondary" style={{ fontSize: 13 }}>Show all</Text>
            <Switch
              checked={hideZero}
              onChange={setHideZero}
              checkedChildren="Active only"
              unCheckedChildren="All"
            />
          </Space>
        </div>
        <PendingTasks user={user} summary={summary} onNavigate={onNavigate} hideZero={hideZero} />
      </div>
    </PageContainer>
  );
};

export default DashboardHome;
