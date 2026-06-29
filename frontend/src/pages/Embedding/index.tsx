import React, { useState } from "react";
import { Button, Space, Typography } from "antd";
import {
  PlayCircleOutlined,
  HistoryOutlined,
  PlusOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import EmbeddingRunList from "./components/EmbeddingRunList";
import CreateEmbeddingRun from "./components/CreateEmbeddingRun";
import EmbeddingRunDetail from "./components/EmbeddingRunDetail";
import { EmbeddingViewMode } from "../../types/embedding";
import PageContainer from "../../components/Layout/PageContainer";

const { Title } = Typography;

const EmbeddingManager: React.FC = () => {
  const [currentView, setCurrentView] = useState<EmbeddingViewMode>("list");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleBack = (): void => {
    setCurrentView("list");
    setSelectedRunId(null);
  };

  const handleSelectRun = (id: number): void => {
    setSelectedRunId(id);
    setCurrentView("details");
  };

  const pageTitle = (() => {
    if (currentView === "details")
      return (
        <Title level={3} style={{ margin: 0 }}>
          <EyeOutlined style={{ marginRight: 8, color: "#595959" }} />
          Embedding Run Details
        </Title>
      );
    if (currentView === "create")
      return (
        <Title level={3} style={{ margin: 0 }}>
          <PlusOutlined style={{ marginRight: 8, color: "#595959" }} />
          New Embedding Run
        </Title>
      );
    return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <HistoryOutlined style={{ marginRight: 8, color: "#595959" }} />
        Embedding History
      </Title>
    );
  })();

  const pageExtra =
    currentView === "list" ? (
      <Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Refresh
        </Button>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => setCurrentView("create")}
        >
          เริ่มรอบใหม่
        </Button>
      </Space>
    ) : null;

  return (
    <PageContainer
      withCard
      title={pageTitle}
      extra={pageExtra}
      onBack={currentView !== "list" ? handleBack : undefined}
      cardProps={{ bodyStyle: { paddingTop: 8 } }}
    >
      {currentView === "list" && (
        <EmbeddingRunList
          onCreateClick={() => setCurrentView("create")}
          onSelectRun={handleSelectRun}
          refreshKey={refreshKey}
        />
      )}

      {currentView === "create" && (
        <CreateEmbeddingRun
          onBack={() => {
            handleBack();
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {currentView === "details" && selectedRunId !== null && (
        <EmbeddingRunDetail runId={selectedRunId} />
      )}
    </PageContainer>
  );
};

export default EmbeddingManager;
