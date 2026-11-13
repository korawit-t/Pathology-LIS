import React, { useState } from "react";
import { Button, Space, Typography } from "antd";
import { PlayCircleOutlined, ClockCircleOutlined, PlusOutlined, LogoutOutlined } from "@ant-design/icons";
import ProcessingRunList from "./components/ProcessingRunList";
import CreateProcessingRun from "./components/CreateProcessingRun/CreateProcessingRun";
import PageContainer from "../../components/Layout/PageContainer";

const { Title } = Typography;

type ViewMode = "list" | "create";

interface ProcessingManagerProps {
  /** Dashboard view key. Histology's "his:process-out" opens the runs still in the processor. */
  currentView?: string;
}

const ProcessingManager: React.FC<ProcessingManagerProps> = ({ currentView: dashboardView }) => {
  const isProcessOut = dashboardView === "his:process-out";
  const [currentView, setCurrentView] = useState<ViewMode>("list");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleBack = (): void => setCurrentView("list");

  const pageTitle =
    currentView === "create" ? (
      <Title level={3} style={{ margin: 0 }}>
        <PlusOutlined style={{ marginRight: 8, color: "#595959" }} />
        Create Processing Run
      </Title>
    ) : isProcessOut ? (
      <Title level={3} style={{ margin: 0 }}>
        <LogoutOutlined style={{ marginRight: 8, color: "#595959" }} />
        Process Out
      </Title>
    ) : (
      <Title level={3} style={{ margin: 0 }}>
        <PlayCircleOutlined style={{ marginRight: 8, color: "#595959" }} />
        Tissue Processing History
      </Title>
    );

  const pageExtra =
    currentView === "list" ? (
      <Space>
        <Button
          icon={<ClockCircleOutlined />}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Refresh
        </Button>
        {/* Loading a run is the Surgical step; Process Out only takes runs out. */}
        {!isProcessOut && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCurrentView("create")}
          >
            Create New Run
          </Button>
        )}
      </Space>
    ) : null;

  return (
    <PageContainer
      withCard
      title={pageTitle}
      extra={pageExtra}
      onBack={currentView === "create" ? handleBack : undefined}
    >
      {currentView === "list" && (
        <ProcessingRunList
          refreshKey={refreshKey}
          status={isProcessOut ? "processing" : undefined}
          emptyText={isProcessOut ? "No runs in the processor" : undefined}
        />
      )}
      {currentView === "create" && <CreateProcessingRun onBack={handleBack} />}
    </PageContainer>
  );
};

export default ProcessingManager;
