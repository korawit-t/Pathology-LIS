import React, { useEffect, useState } from "react";

import HospitalService from "../../services/hospitalService";
import GrossExaminationService from "../../services/grossExaminationService";
import SystemSettingService from "../../services/systemSettingService";
import type { SurgicalCase } from "../../types/surgical";
import type { SystemSetting } from "../../types/system";
import type { User } from "../../types/user";
import logger from "../../utils/logger";

import GrossListView from "./GrossListView";
import GrossEditView from "./GrossEditView";

interface Props {
  isSidebarCollapsed?: boolean;
  isSideLayout?: boolean;
}

const GrossExamination: React.FC<Props> = ({ isSidebarCollapsed, isSideLayout }) => {
  const [viewMode, setViewMode] = useState<"list" | "edit">("list");
  const [activeCase, setActiveCase] = useState<SurgicalCase | null>(null);
  const [listRefreshToken, setListRefreshToken] = useState(0);

  const [users, setUsers] = useState<User[]>([]);
  const [hospitals, setHospitals] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<SystemSetting | null>(null);

  useEffect(() => {
    Promise.all([
      SystemSettingService.getSettings(),
      HospitalService.getHospitals(),
      GrossExaminationService.getUsers(),
    ])
      .then(([s, h, u]) => {
        setSettings(s);
        setHospitals(h);
        setUsers(u);
      })
      .catch((err) => logger.error("Failed to load shared data", err));
  }, []);

  const handleEditClick = (record: SurgicalCase) => {
    setActiveCase(record);
    setViewMode("edit");
  };

  const handleBack = () => {
    setViewMode("list");
    setActiveCase(null);
  };

  const handleCaseSaved = () => {
    setListRefreshToken((t) => t + 1);
  };

  return (
    <>
      <div style={{ display: viewMode === "list" ? "block" : "none" }}>
        <GrossListView
          hospitals={hospitals}
          onEditClick={handleEditClick}
          refreshToken={listRefreshToken}
        />
      </div>
      {viewMode === "edit" && activeCase && (
        <GrossEditView
          activeCase={activeCase}
          onBack={handleBack}
          onCaseSaved={handleCaseSaved}
          users={users}
          settings={settings}
          isSidebarCollapsed={isSidebarCollapsed}
          isSideLayout={isSideLayout}
        />
      )}
    </>
  );
};

export default GrossExamination;
