import React, { useCallback, useEffect, useState } from "react";
import { Modal, Descriptions, Table, Tag, Typography, Button, Space, Spin, Empty, message, Tooltip } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import OutlabConsultRunService, {
  OutlabRegistrationInfo,
  OutlabRegistrationBlock,
  OutlabRegistrationSlide,
} from "../../../services/outlabConsultRunService";
import { copyText } from "../../../utils/clipboard";
import logger from "../../../utils/logger";

const { Text, Paragraph } = Typography;

const DASH = "—";

const fmtDateTime = (v?: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "");
const fmtDate = (v?: string) => (v ? dayjs(v).format("DD/MM/YYYY") : "");

const CASE_TYPE_LABEL: Record<string, string> = {
  surgical: "Surgical",
  gyne: "Gyne Cyto",
  nongyne: "Non-Gyne Cyto",
};

/** A value with its own copy button — the destination lab's form has one
 *  field per part, so each part is copied on its own rather than as a blob. */
const CopyableValue: React.FC<{ value?: string; multiline?: boolean }> = ({ value, multiline }) => {
  if (!value) return <Text type="secondary">{DASH}</Text>;

  const handleCopy = () => {
    if (copyText(value)) message.success("Copied");
    else message.error("Copy failed — select the text and copy manually");
  };

  return (
    <Space size={4} align="start" style={{ width: "100%" }}>
      {multiline ? (
        <Paragraph style={{ margin: 0, whiteSpace: "pre-wrap", flex: 1 }}>{value}</Paragraph>
      ) : (
        <Text>{value}</Text>
      )}
      <Tooltip title="Copy">
        <Button type="text" size="small" icon={<CopyOutlined />} aria-label={`Copy ${value}`} onClick={handleCopy} />
      </Tooltip>
    </Space>
  );
};

const slideLine = (s: OutlabRegistrationSlide) =>
  [s.slide_label, s.test_name || "—", s.is_recut ? "(recut)" : ""].filter(Boolean).join(" ");

/** Plain-text dump of the whole bundle, one field per line — for staff who
 *  paste into a free-text field or a chat message instead of a form. */
export const buildRegistrationText = (info: OutlabRegistrationInfo): string => {
  const lines: [string, string | undefined][] = [
    ["Accession No.", info.accession_no],
    ["HN", info.hn],
    ["คำนำหน้า / Title", info.patient_title],
    ["ชื่อ / First name", info.patient_first_name],
    ["นามสกุล / Last name", info.patient_last_name],
    ["CID", info.cid],
    ["เพศ / Gender", info.gender],
    [
      "วันเกิด / Birth date",
      info.birth_date ? `${fmtDate(info.birth_date)}${info.age_display ? ` (${info.age_display})` : ""}` : undefined,
    ],
    ["แพทย์ผู้ส่งตรวจ / Referring doctor", info.clinician_name],
    ["วันที่เก็บสิ่งส่งตรวจ / Collected at", fmtDateTime(info.collect_at) || undefined],
    ["Hospital", info.hospital_name],
    ["Department", info.department_name],
    ["Specimen type", info.specimen_type],
    ["Collection site", info.collection_site],
    ["Clinical diagnosis", info.clinical_diagnosis],
    ["Clinical history", info.clinical_history],
    ["Consult reason", info.consult_reason],
  ];

  if (info.blocks.length > 0) {
    lines.push([
      `Blocks (${info.block_count})`,
      info.blocks.map((b) => [b.block_code, b.specimen_name && `(${b.specimen_name})`].filter(Boolean).join(" ")).join(", "),
    ]);
  }

  const allSlides = info.blocks.length > 0 ? info.blocks.flatMap((b) => b.slides) : info.slides;
  if (allSlides.length > 0) {
    lines.push([`Slides (${info.slide_count})`, allSlides.map(slideLine).join("; ")]);
  }

  return lines
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
};

interface Props {
  open: boolean;
  caseType?: string | null;
  caseId?: number | null;
  accessionNo?: string | null;
  onClose: () => void;
}

const OutlabRegistrationModal: React.FC<Props> = ({ open, caseType, caseId, accessionNo, onClose }) => {
  const [info, setInfo] = useState<OutlabRegistrationInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !caseType || !caseId) return;
    let cancelled = false;
    setLoading(true);
    setInfo(null);
    OutlabConsultRunService.getRegistrationInfo(caseType, caseId)
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((err) => {
        logger.error("Fetch outlab registration info error:", err);
        if (!cancelled) message.error("Failed to load registration details");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, caseType, caseId]);

  const handleCopyAll = useCallback(() => {
    if (!info) return;
    if (copyText(buildRegistrationText(info))) message.success("All registration details copied");
    else message.error("Copy failed — select the text and copy manually");
  }, [info]);

  const blockColumns: ColumnsType<OutlabRegistrationBlock> = [
    {
      title: "Block",
      dataIndex: "block_code",
      width: 90,
      render: (v) => <Tag color="cyan" style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: "Specimen",
      dataIndex: "specimen_name",
      render: (v, r) => (
        <Text>{[r.specimen_label, v].filter(Boolean).join(". ") || DASH}</Text>
      ),
    },
    {
      title: "Tissue",
      dataIndex: "tissue_count",
      width: 80,
      render: (v) => (v ?? DASH),
    },
    {
      title: "Slides / Stains",
      key: "slides",
      render: (_, r) =>
        r.slides.length === 0 ? (
          <Text type="secondary">{DASH}</Text>
        ) : (
          <Space size={4} wrap>
            {r.slides.map((s) => (
              <Tag key={s.id} color={s.is_recut ? "gold" : "blue"} style={{ margin: 0 }}>
                {s.test_name || `Slide ${s.slide_no}`}
                {s.is_recut ? " · recut" : ""}
              </Tag>
            ))}
          </Space>
        ),
    },
  ];

  const slideColumns: ColumnsType<OutlabRegistrationSlide> = [
    {
      title: "Slide",
      dataIndex: "slide_label",
      width: 160,
      render: (v, r) => <Text strong>{v || DASH} {r.slide_no > 1 ? `#${r.slide_no}` : ""}</Text>,
    },
    {
      title: "Stain",
      dataIndex: "test_name",
      render: (v) => v || DASH,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (v) => <Tag>{v || DASH}</Tag>,
    },
  ];

  const isSurgical = (info?.blocks.length ?? 0) > 0;

  return (
    <Modal
      title={
        <Space>
          <span>Registration Details</span>
          {(info?.accession_no || accessionNo) && (
            <Tag color="blue" style={{ margin: 0 }}>{info?.accession_no || accessionNo}</Tag>
          )}
          {info?.case_type && <Tag>{CASE_TYPE_LABEL[info.case_type] || info.case_type}</Tag>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={820}
      footer={[
        <Button key="copy-all" type="primary" icon={<CopyOutlined />} disabled={!info} onClick={handleCopyAll}>
          Copy All
        </Button>,
        <Button key="close" onClick={onClose}>Close</Button>,
      ]}
    >
      <Spin spinning={loading}>
        {!info && !loading ? (
          <Empty description="No details available" />
        ) : info ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions
              title="Patient / ผู้ป่วย"
              bordered
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: "title", label: "คำนำหน้า / Title", children: <CopyableValue value={info.patient_title} /> },
                { key: "first", label: "ชื่อ / First name", children: <CopyableValue value={info.patient_first_name} /> },
                { key: "last", label: "นามสกุล / Last name", children: <CopyableValue value={info.patient_last_name} /> },
                { key: "cid", label: "CID / เลขบัตรประชาชน", children: <CopyableValue value={info.cid} /> },
                { key: "hn", label: "HN", children: <CopyableValue value={info.hn} /> },
                {
                  key: "age",
                  label: "เพศ / อายุ",
                  children: (
                    <Text>
                      {[info.gender, info.age_display, fmtDate(info.birth_date)].filter(Boolean).join(" · ") || DASH}
                    </Text>
                  ),
                },
              ]}
            />

            <Descriptions
              title="Request / ข้อมูลส่งตรวจ"
              bordered
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                {
                  key: "clinician",
                  label: "แพทย์ผู้ส่งตรวจ / Referring doctor",
                  children: <CopyableValue value={info.clinician_name} />,
                },
                {
                  key: "collect",
                  label: "วันที่เก็บสิ่งส่งตรวจ / Collected at",
                  children: <CopyableValue value={fmtDateTime(info.collect_at)} />,
                },
                { key: "hospital", label: "Hospital", children: <CopyableValue value={info.hospital_name} /> },
                { key: "department", label: "Department", children: <CopyableValue value={info.department_name} /> },
                ...(info.specimen_type || info.collection_site
                  ? [
                      { key: "spectype", label: "Specimen type", children: <CopyableValue value={info.specimen_type} /> },
                      { key: "site", label: "Collection site", children: <CopyableValue value={info.collection_site} /> },
                    ]
                  : []),
                {
                  key: "dx",
                  label: "Clinical diagnosis",
                  span: 2,
                  children: <CopyableValue value={info.clinical_diagnosis} multiline />,
                },
                ...(info.clinical_history
                  ? [
                      {
                        key: "hx",
                        label: "Clinical history",
                        span: 2,
                        children: <CopyableValue value={info.clinical_history} multiline />,
                      },
                    ]
                  : []),
                ...(info.consult_reason
                  ? [
                      {
                        key: "reason",
                        label: "Consult reason",
                        span: 2,
                        children: <CopyableValue value={info.consult_reason} multiline />,
                      },
                    ]
                  : []),
              ]}
            />

            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                {isSurgical
                  ? `Blocks & Slides / บล็อกและสไลด์ (${info.block_count} block, ${info.slide_count} slide)`
                  : `Slides / สไลด์ (${info.slide_count})`}
              </Text>
              {isSurgical ? (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={blockColumns}
                  dataSource={info.blocks}
                />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={slideColumns}
                  dataSource={info.slides}
                  locale={{ emptyText: "No slides recorded for this case" }}
                />
              )}
            </div>
          </Space>
        ) : (
          <div style={{ minHeight: 160 }} />
        )}
      </Spin>
    </Modal>
  );
};

export default OutlabRegistrationModal;
