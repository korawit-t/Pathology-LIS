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
import { useHisConfigured } from "../../../hooks/useHisConfigured";
import { PendingQueueTab } from "./PendingQueueTab";
import { TrackingTab } from "./TrackingTab";
import { CaseViewTab } from "./CaseViewTab";
import { HosxpKeyTab } from "./HosxpKeyTab";
import { TodayPatientsTab } from "./TodayPatientsTab";

const { Title } = Typography;

/** Tab keys that cannot work without a HIS connection. */
const HIS_ONLY_TABS = ["hosxp-key", "today"];

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

  const { hisConfigured } = useHisConfigured();

  // The last two tabs both query HOSxP and are meaningless without it: one
  // lists a patient's HIS appointments, the other asks the HIS who checked in
  // today. On a site with no HIS configured they only ever 503, so they are
  // dropped rather than shown broken. Kept while the lookup is undefined so
  // the common (configured) case doesn't flash a shorter tab bar.
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
  ].filter((tab) => hisConfigured !== false || !HIS_ONLY_TABS.includes(tab.key));

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
