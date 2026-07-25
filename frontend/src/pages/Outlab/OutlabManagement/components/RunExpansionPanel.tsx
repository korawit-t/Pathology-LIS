import React from "react";
import { Space, Typography, Button, Checkbox, Tag, Tooltip } from "antd";
import { CheckCircleOutlined, HistoryOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { OutlabRunDetail } from "../../../../services/surgicalBlockStainService";
import { AccessionNoText } from "./OutlabCellRenderers";

const { Text } = Typography;

interface RunExpansionPanelProps {
  details: OutlabRunDetail[];
  selectedIds: Set<number>;
  onToggleDetail: (detailId: number, checked: boolean) => void;
  onToggleIds: (ids: number[], checked: boolean) => void;
  onReceiveSelected: () => void;
  onBlockClick: (block: { id: number | null; block_code?: string; accession_no?: string }) => void;
}

/**
 * The per-run "Slides in this run" expansion body shared by TrackingTab's
 * expandable row — groups slides by accession_no, with select-all /
 * per-group / per-slide checkboxes feeding a single selection Set owned by
 * the parent. Select-all and per-group toggles both use the same
 * add/remove-ids semantics (not a full-set replace) — equivalent in every
 * reachable case here, since selection only ever contains currently
 * unreceived ids.
 */
export const RunExpansionPanel: React.FC<RunExpansionPanelProps> = ({
  details,
  selectedIds,
  onToggleDetail,
  onToggleIds,
  onReceiveSelected,
  onBlockClick,
}) => {
  const grouped: Record<string, OutlabRunDetail[]> = {};
  details.forEach((d) => {
    const acc = d.accession_no || "N/A";
    if (!grouped[acc]) grouped[acc] = [];
    grouped[acc].push(d);
  });

  const unreceivedIds = details.filter((d) => !d.received_at).map((d) => d.id);
  const unreceivedCount = unreceivedIds.length;
  const allSelected = unreceivedCount > 0 && unreceivedIds.every((id) => selectedIds.has(id));

  return (
    <div style={{ padding: "8px 16px" }}>
      <Space style={{ marginBottom: 10, width: "100%", justifyContent: "space-between" }}>
        <Text strong>Slides in this run:</Text>
        {unreceivedCount > 0 && (
          <Space size="small">
            <Button size="small" onClick={() => onToggleIds(unreceivedIds, !allSelected)}>
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={selectedIds.size === 0}
              onClick={onReceiveSelected}
            >
              Receive selected ({selectedIds.size})
            </Button>
          </Space>
        )}
      </Space>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {Object.entries(grouped).map(([acc, groupDetails]) => {
          const groupUnreceivedIds = groupDetails.filter((d) => !d.received_at).map((d) => d.id);
          const groupAllSelected = groupUnreceivedIds.length > 0 && groupUnreceivedIds.every((id) => selectedIds.has(id));
          const groupSomeSelected = groupUnreceivedIds.some((id) => selectedIds.has(id));
          return (
            <div key={acc} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <Space size={6} style={{ minWidth: 120, paddingTop: 2 }}>
                {groupUnreceivedIds.length > 0 && (
                  <Checkbox
                    checked={groupAllSelected}
                    indeterminate={groupSomeSelected && !groupAllSelected}
                    onChange={(e) => onToggleIds(groupUnreceivedIds, e.target.checked)}
                  />
                )}
                <AccessionNoText text={acc} />
              </Space>
              <Space wrap size={[8, 4]}>
                {groupDetails.map((d) => (
                  <Space
                    key={d.id}
                    size={4}
                    style={{ border: "1px solid #f0f0f0", borderRadius: 4, padding: "2px 6px" }}
                  >
                    {!d.received_at ? (
                      <Checkbox
                        checked={selectedIds.has(d.id)}
                        onChange={(e) => onToggleDetail(d.id, e.target.checked)}
                      />
                    ) : (
                      <Tooltip title={`Received ${dayjs(d.received_at).format("DD/MM/YYYY HH:mm")}`}>
                        <CheckCircleOutlined style={{ color: "#52c41a" }} />
                      </Tooltip>
                    )}
                    <Tag
                      color="geekblue"
                      style={{ cursor: "pointer", margin: 0 }}
                      icon={<HistoryOutlined />}
                      onClick={() =>
                        onBlockClick({
                          id: d.block_id || d.stain_order?.block_id || null,
                          block_code: d.block_code || undefined,
                          accession_no: d.accession_no || undefined,
                        })
                      }
                    >
                      {d.block_code || "-"} — {d.stain_order?.test?.name || "Unknown"}
                    </Tag>
                  </Space>
                ))}
              </Space>
            </div>
          );
        })}
      </Space>
    </div>
  );
};
