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
import { useHisInfo } from "../../../hooks/useHisInfo";
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

  const { hisInfo } = useHisInfo();
  const hisName = hisInfo?.display_name ?? "HIS";

  // The last two tabs depend on the HIS, each on a different part of it.
  // "<HIS> Key" tracks keying results into whatever HIS the site runs, so it
  // stays for any connected HIS — only its per-row appointment lookup needs
  // the appointments feature. "Today's Patients" is entirely a "who checked
  // in today" query, which only some HIS adapters (HOSxP) implement.
  // Everything is kept while the lookup is undefined so the common
  // (connected) case doesn't flash a shorter tab bar.
  const tabAvailable: Record<string, boolean> = {
    "hosxp-key": hisInfo?.configured !== false,
    today: hisInfo?.features.visits_today !== false,
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
          <CheckCircleOutlined /> {hisName} Key
        </span>
      ),
      children: (
        <HosxpKeyTab
          refreshTrigger={sentTrigger}
          hisName={hisName}
          appointmentsAvailable={hisInfo?.features.appointments !== false}
        />
      ),
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
  ].filter((tab) => tabAvailable[tab.key] !== false);

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
