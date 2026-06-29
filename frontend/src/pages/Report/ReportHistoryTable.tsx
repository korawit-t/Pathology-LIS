import React, { useState } from "react";
import { Tabs, Typography } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";
import SurgicalReportHistory from "./components/SurgicalReportHistory";
import GyneReportHistory from "./components/GyneReportHistory";
import NonGyneReportHistory from "./components/NonGyneReportHistory";

const { Title } = Typography;

interface Props {
  onBack?: () => void;
  user?: unknown;
}

const ReportHistoryTable: React.FC<Props> = ({ onBack: _ }) => {
  const [activeTab, setActiveTab] = useState("surgical");

  const items = [
    {
      key: "surgical",
      label: "Surgical Pathology",
      children: <SurgicalReportHistory />,
    },
    {
      key: "gyne",
      label: "Gyne Cytology",
      children: <GyneReportHistory />,
    },
    {
      key: "nongyne",
      label: "Non-Gyne Cytology",
      children: <NonGyneReportHistory />,
    },
  ];

  return (
    <PageContainer
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <HistoryOutlined style={{ marginRight: 12, color: "#595959" }} />
          Report Archive
        </Title>
      }
      withCard
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
    </PageContainer>
  );
};

export default ReportHistoryTable;
