import React from "react";
import { Col, Spin, Card } from "antd";
import { useSurgicalStats } from "./hooks/useSurgicalStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";
import { CASE_STATUS } from "../../../../constants/lab.constants";

interface SurgicalSectionProps {
  tatOverdue?: Record<string, number>;
  tatWarning?: Record<string, number>;
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const SurgicalSection: React.FC<SurgicalSectionProps> = ({ tatOverdue = {}, tatWarning = {}, onNavigate, hideZero }) => {
  const { stats, loading } = useSurgicalStats();
  const nav = (view: string) => onNavigate?.(view);

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        <SectionHeader title="Surgical Pathology" color="#1890ff" />
        <Spin spinning={loading}>
          <CompactStatRow label="Registered" value={stats.registeredCount} color="#1890ff" onClick={() => nav("accession")} tatOverdue={tatOverdue[CASE_STATUS.REGISTERED] || 0} tatWarning={tatWarning[CASE_STATUS.REGISTERED] || 0} hideZero={hideZero} />
          <CompactStatRow label="Fixation" value={stats.pendingFixation} color="#1890ff" onClick={() => nav("accession")} tatOverdue={tatOverdue[CASE_STATUS.FORMALIN_FIXING] || 0} tatWarning={tatWarning[CASE_STATUS.FORMALIN_FIXING] || 0} hideZero={hideZero} />
          <CompactStatRow label="Gross In-Progress" value={stats.draftCasesCount} color="#1890ff" onClick={() => nav("grossing")} tatOverdue={tatOverdue[CASE_STATUS.GROSS_IN_PROGRESS] || 0} tatWarning={tatWarning[CASE_STATUS.GROSS_IN_PROGRESS] || 0} hideZero={hideZero} />
          <CompactStatRow label="Tissue Processing" value={stats.pendingProcessing} color="#1890ff" onClick={() => nav("sur:tissue-processing")} tatOverdue={tatOverdue[CASE_STATUS.GROSSED] || 0} tatWarning={tatWarning[CASE_STATUS.GROSSED] || 0} hideZero={hideZero} />
          <CompactStatRow label="Decal Queue" value={stats.decalCount} color="#1890ff" onClick={() => nav("decal-queue")} hideZero={hideZero} />
          <CompactStatRow label="Additional Sections" value={stats.additionalSectionsCount} color="#1890ff" onClick={() => nav("grossing")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default SurgicalSection;
