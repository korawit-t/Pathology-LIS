import React, { useState } from "react";
import { Switch, Space, Typography } from "antd";
import PendingTasks from "./PendingTask/PendingTasks";
import PageContainer from "../../components/Layout/PageContainer";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import PathologistDashboard from "./PathologistDashboard";

import type { User } from "../../types/user";

const { Text } = Typography;

interface DashboardHomeProps {
  user: User;
  onNavigate?: (view: string) => void;
}

const isPathologistOnly = (user: User) => {
  const roles: string[] = (user?.roles as string[]) || [];
  return roles.includes("pathologist") && !roles.includes("admin") && !roles.includes("lab_manager");
};

const DashboardHome: React.FC<DashboardHomeProps> = ({ user, onNavigate }) => {
  const { summary, loading: summaryLoading } = useDashboardSummary();
  const [hideZero, setHideZero] = useState(true);

  if (isPathologistOnly(user)) {
    return (
      <PageContainer>
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
