import React from "react";
import { Col, Spin, Card } from "antd";
import { useHistoStats } from "./hooks/useHistoStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";

interface HistoSectionProps {
  tatOverdue?: Record<string, number>;
  tatWarning?: Record<string, number>;
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const HistoSection: React.FC<HistoSectionProps> = ({ tatOverdue = {}, tatWarning = {}, onNavigate, hideZero }) => {
  const { stats, loading } = useHistoStats();
  const nav = (view: string) => onNavigate?.(view);

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        <SectionHeader title="Histology" color="#13c2c2" />
        <Spin spinning={loading}>
          <CompactStatRow label="Pending Embedding" value={stats.pendingEmbedding} color="#13c2c2" onClick={() => nav("embedding")} tatOverdue={tatOverdue["processed"] || 0} tatWarning={tatWarning["processed"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Pending Sectioning" value={stats.pendingSectioning} color="#13c2c2" onClick={() => nav("sectioning")} tatOverdue={tatOverdue["embedded"] || 0} tatWarning={tatWarning["embedded"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Pending H&E Staining" value={stats.pendingStaining} color="#13c2c2" onClick={() => nav("he-staining-manager")} tatOverdue={tatOverdue["sectioned"] || 0} tatWarning={tatWarning["sectioned"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Pending Slide Dispatch" value={stats.pendingDispatch} color="#13c2c2" onClick={() => nav("slide-dispatch")} tatOverdue={tatOverdue["stained"] || 0} tatWarning={tatWarning["stained"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Recut" value={stats.pendingRecut} color="#13c2c2" onClick={() => nav("internal-stain-order")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default HistoSection;
