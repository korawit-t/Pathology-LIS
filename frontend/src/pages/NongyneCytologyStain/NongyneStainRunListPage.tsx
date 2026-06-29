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
import NongyneStainRunTable from "./NongyneStainRunTable";
import NongyneStainBatchPage from "./NongyneStainBatchPage";
import NongyneQuickPrintTab from "./PrintStickerNongyne/components/NongyneQuickPrintTab";

const { Title } = Typography;

type ViewMode = "list" | "create";

const NongyneStainRunListPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>("list");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleBack = () => setCurrentView("list");

  if (currentView === "create") return <NongyneStainBatchPage onBack={handleBack} />;

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8, color: "#595959" }} />
          Non-Gyne Cytology Staining
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
            label: <span><HistoryOutlined /> Non-Gyne Staining History</span>,
            children: <NongyneStainRunTable refreshKey={refreshKey} />,
          },
          {
            key: "quick-print",
            label: <span><ScanOutlined /> Quick Print</span>,
            children: <NongyneQuickPrintTab />,
          },
        ]}
      />
    </PageContainer>
  );
};

export default NongyneStainRunListPage;
