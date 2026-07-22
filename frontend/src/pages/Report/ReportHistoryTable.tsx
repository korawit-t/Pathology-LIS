import React, { useRef, useState } from "react";
import { Input, Tabs, Typography } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";
import SurgicalReportHistory, { ReportHistoryHandle } from "./components/SurgicalReportHistory";
import GyneReportHistory from "./components/GyneReportHistory";
import NonGyneReportHistory from "./components/NonGyneReportHistory";
import MolecularReportHistory from "./components/MolecularReportHistory";

const { Title } = Typography;

interface Props {
  onBack?: () => void;
  user?: unknown;
}

const ReportHistoryTable: React.FC<Props> = ({ onBack: _ }) => {
  const [activeTab, setActiveTab] = useState("surgical");

  const surgicalRef = useRef<ReportHistoryHandle>(null);
  const gyneRef = useRef<ReportHistoryHandle>(null);
  const nongyneRef = useRef<ReportHistoryHandle>(null);
  const molecularRef = useRef<ReportHistoryHandle>(null);

  const activeRef =
    activeTab === "surgical" ? surgicalRef :
    activeTab === "gyne" ? gyneRef :
    activeTab === "nongyne" ? nongyneRef :
    molecularRef;

  const items = [
    {
      key: "surgical",
      label: "Surgical Pathology",
      children: <SurgicalReportHistory ref={surgicalRef} />,
    },
    {
      key: "gyne",
      label: "Gyne Cytology",
      children: <GyneReportHistory ref={gyneRef} />,
    },
    {
      key: "nongyne",
      label: "Non-Gyne Cytology",
      children: <NonGyneReportHistory ref={nongyneRef} />,
    },
    {
      key: "molecular",
      label: "Molecular Pathology",
      children: <MolecularReportHistory ref={molecularRef} />,
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
      cardProps={{ bodyStyle: { paddingTop: 8 } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        tabBarStyle={{ marginBottom: 16 }}
        tabBarExtraContent={
          <Input.Search
            key={activeTab}
            placeholder="Search HN, Name, Accession No..."
            onSearch={(value) => activeRef.current?.search(value)}
            style={{ width: 300 }}
            allowClear
            enterButton
          />
        }
      />
    </PageContainer>
  );
};

export default ReportHistoryTable;
