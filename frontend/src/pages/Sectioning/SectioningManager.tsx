import React, { useState } from "react";
import { Button, Typography, message } from "antd";
import {
  ScissorOutlined,
  PlusOutlined,
  HistoryOutlined,
} from "@ant-design/icons";

import SectioningRunList from ".";
import CreateSectioningRun from "./components/CreateSectioningRun";
import SectioningDetails from "./components/SectioningDetails";
import { SectioningRunResponse } from "../../types/sectioning";
import PageContainer from "../../components/Layout/PageContainer";

const { Title } = Typography;

type ViewType = "list" | "create" | "details";

const SectioningManager: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>("list");
  const [selectedRun, setSelectedRun] = useState<SectioningRunResponse | null>(
    null,
  );

  const handleBack = (): void => {
    setCurrentView("list");
    setSelectedRun(null);
  };

  const handleCreateSuccess = (run: SectioningRunResponse): void => {
    message.success(`Sectioning run ${run?.run_no || ""} saved successfully`);
    handleBack();
  };

  const handleSelectRun = (run: SectioningRunResponse): void => {
    setSelectedRun(run);
    setCurrentView("details");
  };

  const pageTitle = (() => {
    if (currentView === "details") return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <HistoryOutlined style={{ marginRight: 12, color: "#595959" }} />
        Sectioning Run Details: {selectedRun?.run_no}
      </Title>
    );
    if (currentView === "create") return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <PlusOutlined style={{ marginRight: 12, color: "#595959" }} />
        New Sectioning Run
      </Title>
    );
    return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <ScissorOutlined style={{ marginRight: 12, color: "#595959" }} />
        Sectioning
      </Title>
    );
  })();

  const pageExtra = currentView === "list" ? (
    <Button
      type="primary"
      size="large"
      icon={<PlusOutlined />}
      onClick={() => setCurrentView("create")}
    >
      New Sectioning Run
    </Button>
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
        <SectioningRunList onSelectRun={handleSelectRun} />
      )}

      {currentView === "create" && (
        <CreateSectioningRun
          onBack={handleBack}
          onSuccess={handleCreateSuccess}
        />
      )}

      {currentView === "details" && (
        <SectioningDetails run={selectedRun} />
      )}
    </PageContainer>
  );
};

export default SectioningManager;
