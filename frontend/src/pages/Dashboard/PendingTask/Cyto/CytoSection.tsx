import React from "react";
import { Col, Spin, Card } from "antd";
import { useCytoStats } from "./hooks/useCytoStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";

interface CytoSectionProps {
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const CytoSection: React.FC<CytoSectionProps> = ({ onNavigate, hideZero }) => {
  const { stats, loading } = useCytoStats();
  const nav = (view: string) => onNavigate?.(view);

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        <SectionHeader title="Cytology" color="#eb2f96" />
        <Spin spinning={loading}>
          <CompactStatRow label="Gyne Staining" value={stats.gynePendingStain} color="#eb2f96" onClick={() => nav("gyne-cyto-run-list")} hideZero={hideZero} />
          <CompactStatRow label="Gyne Diagnosis" value={stats.gynePendingDiagnosis} color="#eb2f96" onClick={() => nav("gyne-cyto-work-list")} hideZero={hideZero} />
          <CompactStatRow label="Non-Gyne Staining" value={stats.nongynePendingStain} color="#eb2f96" onClick={() => nav("nongyne-cyto-stains")} hideZero={hideZero} />
          <CompactStatRow label="Non-Gyne Diagnosis" value={stats.nongynePendingDiagnosis} color="#eb2f96" onClick={() => nav("nongyne-cyto-work-list")} hideZero={hideZero} />
          <CompactStatRow label="Cell Block Pending" value={stats.cellBlockPending} color="#eb2f96" onClick={() => nav("nongyne-cell-block")} hideZero={hideZero} />
          <CompactStatRow label="Cell Block Processing" value={stats.cellBlockProcessing} color="#eb2f96" onClick={() => nav("nongyne-cell-block")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default CytoSection;
