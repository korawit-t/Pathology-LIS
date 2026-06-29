import React from "react";
import { Col, Spin, Card } from "antd";
import { usePrintQueueStats } from "./hooks/usePrintQueueStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";

interface PrintQueueSectionProps {
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const PrintQueueSection: React.FC<PrintQueueSectionProps> = ({ onNavigate, hideZero }) => {
  const { stats, loading } = usePrintQueueStats();
  const total = stats.surgicalPending + stats.gynePending + stats.nongynePending;

  if (hideZero && total === 0) return null;

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        <SectionHeader title="Pending Print" color="#faad14" />
        <Spin spinning={loading}>
          <CompactStatRow label="Surgical" value={stats.surgicalPending} color="#faad14" onClick={() => onNavigate?.("print-report-queue")} hideZero={hideZero} />
          <CompactStatRow label="Gyne Cyto" value={stats.gynePending} color="#faad14" onClick={() => onNavigate?.("print-report-queue")} hideZero={hideZero} />
          <CompactStatRow label="NonGyne Cyto" value={stats.nongynePending} color="#faad14" onClick={() => onNavigate?.("print-report-queue")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default PrintQueueSection;
