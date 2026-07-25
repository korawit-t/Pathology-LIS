import React from "react";
import { Drawer, Timeline, Typography, Space, Tag } from "antd";
import type { GyneDiagnosisResponse } from "../../../types/gyne-diagnosis";

const { Text } = Typography;

interface GyneDiagnosisHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  historyList: GyneDiagnosisResponse[];
}

/** Diagnosis version history drawer shared by both the Pathologist and
 * cytotechnologist Gyne diagnosis pages — identical in both, so it lives
 * here once instead of being copy-pasted. */
const GyneDiagnosisHistoryDrawer: React.FC<GyneDiagnosisHistoryDrawerProps> = ({
  open,
  onClose,
  historyList,
}) => (
  <Drawer title="Diagnosis History" open={open} onClose={onClose} width={480}>
    <Timeline
      items={historyList.map((h) => ({
        color: h.is_current ? "green" : "gray",
        children: (
          <div>
            <Space>
              <Text strong>Version {h.version}</Text>
              {h.is_current && <Tag color="green">Current</Tag>}
            </Space>
            <div style={{ color: "#595959", fontSize: 12, marginTop: 2 }}>
              {h.updated_at
                ? new Date(h.updated_at).toLocaleString()
                : new Date(h.created_at).toLocaleString()}
            </div>
            {h.revised_reason && (
              <div style={{ marginTop: 4, color: "#fa8c16", fontSize: 12 }}>
                Reason: {h.revised_reason}
              </div>
            )}
            {h.adequacy_obj && (
              <div style={{ fontSize: 12, marginTop: 2, color: "#434343" }}>
                Adequacy: {h.adequacy_obj.text}
              </div>
            )}
            {h.category_1_obj && (
              <div style={{ fontSize: 12, color: "#434343" }}>
                Category: {h.category_1_obj.code} — {h.category_1_obj.text}
              </div>
            )}
            {h.category_2_obj && (
              <div style={{ fontSize: 12, color: "#434343" }}>
                Sub Category: {h.category_2_obj.code} — {h.category_2_obj.text}
              </div>
            )}
          </div>
        ),
      }))}
    />
  </Drawer>
);

export default GyneDiagnosisHistoryDrawer;
