import React from "react";
import { Row } from "antd";
import type { User } from "../../../types/user";
import type { UserRole } from "../../../constants/roles.constants";

import SurgicalSection from "./Surgical/SurgicalSection";
import PathologistSection from "./Pathologist/PathologistSection";
import HistoSection from "./Histo/HistoSection";
import CytoSection from "./Cyto/CytoSection";
import ImmunoSection from "./Immuno/ImmunoSection";
import OutlabConsultSection from "./Outlab/OutlabConsultSection";
import PrintQueueSection from "./PrintQueue/PrintQueueSection";
import type { DashboardSummary } from "../hooks/useDashboardSummary";

interface PendingTasksProps {
  user: User;
  summary?: DashboardSummary;
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const hasRole = (roles: UserRole[], ...check: UserRole[]) =>
  check.some((r) => roles.includes(r));

const PendingTasks: React.FC<PendingTasksProps> = ({ user, summary, onNavigate, hideZero }) => {
  const roles = (user?.roles || []) as UserRole[];
  const overdueByStatus = summary?.tat_overdue.by_status ?? {};
  const warningByStatus = summary?.tat_warning.by_status ?? {};

  const showSurgicalAccession = hasRole(roles, "admin", "lab_manager", "gross", "register");
  const showHisto = hasRole(roles, "admin", "lab_manager", "histo");
  const showImmuno = hasRole(roles, "admin", "lab_manager", "immuno", "histo");
  const showCyto = hasRole(roles, "admin", "lab_manager", "cytotechnologist");
  const showPathologist = hasRole(roles, "admin", "lab_manager", "pathologist");
  const showOutlab = hasRole(roles, "admin", "lab_manager", "pathologist", "histo");

  return (
    <>
      <style>{`
        .compact-stat-row:hover { background: rgba(0,0,0,0.04); border-radius: 6px; }
        .compact-stat-row:active { background: rgba(0,0,0,0.08); }
      `}</style>
      <Row gutter={[24, 0]} wrap>
        {showSurgicalAccession && (
          <SurgicalSection tatOverdue={overdueByStatus} tatWarning={warningByStatus} onNavigate={onNavigate} hideZero={hideZero} />
        )}
        {showHisto && (
          <HistoSection tatOverdue={overdueByStatus} tatWarning={warningByStatus} onNavigate={onNavigate} hideZero={hideZero} />
        )}
        {showImmuno && (
          <ImmunoSection tatOverdue={overdueByStatus} tatWarning={warningByStatus} onNavigate={onNavigate} hideZero={hideZero} />
        )}
        {showCyto && <CytoSection onNavigate={onNavigate} hideZero={hideZero} />}
        {showPathologist && (
          <PathologistSection
            userId={user?.id}
            tatOverdue={overdueByStatus}
            tatWarning={warningByStatus}
            onNavigate={onNavigate}
            hideZero={hideZero}
          />
        )}
        {showOutlab && <OutlabConsultSection onNavigate={onNavigate} hideZero={hideZero} />}
        <PrintQueueSection onNavigate={onNavigate} hideZero={hideZero} />
      </Row>
    </>
  );
};

export default PendingTasks;
