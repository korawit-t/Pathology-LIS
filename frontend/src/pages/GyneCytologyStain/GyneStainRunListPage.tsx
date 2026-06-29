import React, { useState } from "react";
import { Button, Space, Tabs, Typography } from "antd";
import {
  ExperimentOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";
import GyneStainRunTable from "./GyneStainRunTable";
import GyneStainBatchPage from "./GyneStainBatchPage";
import GyneStainRunDetailView from "./GyneStainRunDetailView";
import GyneQuickPrintTab from "./PrintStickerGyne/components/GyneQuickPrintTab";
import { GyneStainRun } from "../../types/gyne-stain";

const { Title } = Typography;

type ViewMode = "list" | "create" | "details";

const GyneStainRunListPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>("list");
  const [selectedRun, setSelectedRun] = useState<GyneStainRun | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleBack = () => {
    setCurrentView("list");
    setSelectedRun(null);
  };

  const handleSelectRun = (run: GyneStainRun) => {
    setSelectedRun(run);
    setCurrentView("details");
  };

  if (currentView === "create") return <GyneStainBatchPage onBack={handleBack} />;
  if (currentView === "details" && selectedRun) return (
    <GyneStainRunDetailView initialRun={selectedRun} onBack={handleBack} />
  );

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8, color: "#595959" }} />
          Gyne Staining
        </Title>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCurrentView("create")}
            style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
          >
            New Batch
          </Button>
        </Space>
      }
    >
      <Tabs
        type="card"
        items={[
          {
            key: "history",
            label: <span><HistoryOutlined /> Gyne Staining History</span>,
            children: (
              <GyneStainRunTable
                onSelectRun={handleSelectRun}
                refreshKey={refreshKey}
              />
            ),
          },
          {
            key: "quick-print",
            label: <span><ScanOutlined /> Quick Print</span>,
            children: <GyneQuickPrintTab />,
          },
        ]}
      />
    </PageContainer>
  );
};

export default GyneStainRunListPage;
