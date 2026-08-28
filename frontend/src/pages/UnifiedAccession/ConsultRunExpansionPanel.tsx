import React from "react";
import { Space, Typography, Tag, Tooltip } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import AccessionTag from "../../components/AccessionTag";
import { TYPE_TAG } from "./constants";
import type { OutlabConsultRunDetailResponse } from "../../services/outlabConsultRunService";

const { Text } = Typography;

interface ConsultRunExpansionPanelProps {
  details: OutlabConsultRunDetailResponse[];
}

/**
 * The per-run "Cases in this run" expansion body for the Accession page's
 * Out Lab tab — same shape as OutlabManagement's RunExpansionPanel (group by
 * accession_no, one chip per dispatched item), but for consult runs: the
 * per-item chip tracks the physical block's return, while the right-hand tags
 * track the case's own result. Those are deliberately separate — a run bundles
 * several cases, so the shipment coming back and any one case's result being
 * in are different events (see `_attach_live_case_consult_status` in
 * app/crud/outlab_consult.py, which is what fills case_consult_status).
 * Read-only: receiving the run is the row-level action in the parent table,
 * and marking blocks returned lives in the Out-Lab Consult page.
 */
const resultStatusTag = (status?: string): React.ReactElement | null => {
  if (status === "received") {
    return <Tag color="success" icon={<CheckCircleOutlined />}>Result received</Tag>;
  }
  if (status === "processing") {
    return <Tag color="blue" icon={<ClockCircleOutlined />}>Awaiting result</Tag>;
  }
  if (!status) return null;
  return <Tag icon={<ClockCircleOutlined />}>{status}</Tag>;
};

export const ConsultRunExpansionPanel: React.FC<ConsultRunExpansionPanelProps> = ({ details }) => {
  const grouped: Record<string, OutlabConsultRunDetailResponse[]> = {};
  details.forEach((d) => {
    const acc = d.accession_no || "N/A";
    if (!grouped[acc]) grouped[acc] = [];
    grouped[acc].push(d);
  });

  const accessions = Object.keys(grouped).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <div style={{ padding: "8px 16px" }}>
      <Space style={{ marginBottom: 10, width: "100%", justifyContent: "space-between" }}>
        <Text strong>Cases in this run:</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {accessions.length} case(s) · {details.length} item(s)
        </Text>
      </Space>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {accessions.map((acc) => {
          const groupDetails = grouped[acc];
          const first = groupDetails[0];
          const reportOutAt = groupDetails.find((d) => d.report_out_at)?.report_out_at;
          return (
            <div key={acc} style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <Space size={6} style={{ minWidth: 210, paddingTop: 2 }}>
                <Tag
                  color={TYPE_TAG[first.case_type]?.color || "default"}
                  style={{ margin: 0 }}
                >
                  {TYPE_TAG[first.case_type]?.label || first.case_type}
                </Tag>
                <AccessionTag value={acc} />
              </Space>
              <Text style={{ minWidth: 160, paddingTop: 2 }}>{first.patient_name || "—"}</Text>
              <Space wrap size={[8, 4]}>
                {groupDetails.map((d) => (
                  <Space
                    key={d.id}
                    size={4}
                    style={{ border: "1px solid #f0f0f0", borderRadius: 4, padding: "2px 6px" }}
                  >
                    {d.block_returned ? (
                      <Tooltip
                        title={`Block returned${d.block_returned_at ? ` ${dayjs(d.block_returned_at).format("DD/MM/YY HH:mm")}` : ""}`}
                      >
                        <CheckCircleOutlined style={{ color: "#52c41a" }} />
                      </Tooltip>
                    ) : (
                      <Tooltip title="Block still at the external lab">
                        <ClockCircleOutlined style={{ color: "#faad14" }} />
                      </Tooltip>
                    )}
                    <Tag color="cyan" style={{ margin: 0 }}>{d.block_code || "Whole case"}</Tag>
                  </Space>
                ))}
              </Space>
              <Space wrap size={4} style={{ paddingTop: 2 }}>
                {resultStatusTag(first.case_consult_status)}
                {first.consult_pdf_uploaded && (
                  <Tag color="purple" icon={<FilePdfOutlined />}>PDF uploaded</Tag>
                )}
                {reportOutAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Report out {dayjs(reportOutAt).format("DD/MM/YY HH:mm")}
                  </Text>
                )}
              </Space>
            </div>
          );
        })}
      </Space>
    </div>
  );
};

export default ConsultRunExpansionPanel;
