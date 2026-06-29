import React from "react";
import { Col, Spin, Card } from "antd";
import { useOutlabConsultStats } from "./hooks/useOutlabConsultStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";

interface OutlabConsultSectionProps {
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const OutlabConsultSection: React.FC<OutlabConsultSectionProps> = ({ onNavigate, hideZero }) => {
  const { stats, loading } = useOutlabConsultStats();
  const nav = (view: string) => onNavigate?.(view);

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        <SectionHeader title="Outlab Consult" color="#fa8c16" />
        <Spin spinning={loading}>
          <CompactStatRow label="Surgical Pending" value={stats.surgicalPending} color="#fa8c16" onClick={() => nav("outlab-consult-list")} hideZero={hideZero} />
          <CompactStatRow label="Gyne Cyto Pending" value={stats.gynePending} color="#fa8c16" onClick={() => nav("outlab-consult-list")} hideZero={hideZero} />
          <CompactStatRow label="Non-Gyne Cyto Pending" value={stats.nongynePending} color="#fa8c16" onClick={() => nav("outlab-consult-list")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default OutlabConsultSection;
