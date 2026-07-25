import React, { useState } from "react";
import { Tabs, Typography } from "antd";
import {
  ExperimentOutlined,
  SendOutlined,
  UnorderedListOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  BellOutlined,
} from "@ant-design/icons";
import PageContainer from "../../../components/Layout/PageContainer";
import { PendingQueueTab } from "./PendingQueueTab";
import { TrackingTab } from "./TrackingTab";
import { CaseViewTab } from "./CaseViewTab";
import { HosxpKeyTab } from "./HosxpKeyTab";
import { TodayPatientsTab } from "./TodayPatientsTab";

const { Title } = Typography;

const OutlabManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState("queue");
  const [sentTrigger, setSentTrigger] = useState(0);

  const handleSent = () => {
    setSentTrigger((n) => n + 1);
    setActiveTab("tracking");
  };

  const handleReceived = () => {
    setSentTrigger((n) => n + 1);
  };

  const items = [
    {
      key: "queue",
      label: (
        <span>
          <SendOutlined /> Send to Outlab
        </span>
      ),
      children: <PendingQueueTab onSent={handleSent} />,
    },
    {
      key: "tracking",
      label: (
        <span>
          <UnorderedListOutlined /> Tracking / Receive
        </span>
      ),
      children: <TrackingTab refreshTrigger={sentTrigger} onReceived={handleReceived} />,
    },
    {
      key: "by-case",
      label: (
        <span>
          <FileSearchOutlined /> By Case
        </span>
      ),
      children: <CaseViewTab refreshTrigger={sentTrigger} onReceived={handleReceived} />,
    },
    {
      key: "hosxp-key",
      label: (
        <span>
          <CheckCircleOutlined /> HosXP Key
        </span>
      ),
      children: <HosxpKeyTab refreshTrigger={sentTrigger} />,
    },
    {
      key: "today",
      label: (
        <span>
          <BellOutlined /> Today's Patients
        </span>
      ),
      children: <TodayPatientsTab refreshTrigger={sentTrigger} />,
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
          Outlab Management
        </Title>
      }
      subTitle="Manage external slide dispatch and track slide returns"
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        size="large"
        tabBarStyle={{ marginBottom: 16, borderBottom: "1px solid #f0f0f0" }}
      />

      <style>{`
        .outlab-row-received td {
          background-color: #f6ffed !important;
        }
        .outlab-row-partial td {
          background-color: #fffbe6 !important;
        }
        .hosxp-row-keyed td {
          background-color: #f6ffed !important;
          opacity: 0.7;
        }
      `}</style>
    </PageContainer>
  );
};

export default OutlabManagement;
