import React, { useState } from "react";
import StainingRunList from "./StainingRunList";
import CreateStainingRun from "./CreateStainingRun";
import StainingRunDetails from "./StainingRunDetails";
import { StainingViewMode } from "../../../types/stains";

const StainingRun: React.FC = () => {
  const [currentView, setCurrentView] = useState<StainingViewMode>(() =>
    localStorage.getItem("stainrun_preselect") ? "create" : "list"
  );
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const handleBack = (): void => {
    setCurrentView("list");
    setSelectedRunId(null);
  };

  const handleSelectRun = (id: number): void => {
    setSelectedRunId(id);
    setCurrentView("details");
  };

  return (
    <>
      {currentView === "list" && (
        <StainingRunList
          onCreateClick={() => setCurrentView("create")}
          onSelectRun={handleSelectRun}
        />
      )}

      {currentView === "create" && <CreateStainingRun onBack={handleBack} />}

      {currentView === "details" && selectedRunId !== null && (
        <StainingRunDetails runId={selectedRunId} onBack={handleBack} />
      )}
    </>
  );
};

export default StainingRun;
