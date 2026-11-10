import React, { useMemo, useState } from "react";
import { Alert, Card, Col, Row, Segmented, Select, Statistic, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { Hospital } from "../../../types/hospital";
import type {
  LegacyHospitalValueMatch,
  LegacyImportIssue,
  LegacyPreviewResult,
  LegacyTargetField,
} from "../../../services/legacyImportService";

const { Text } = Typography;

const MATCHED_BY_LABEL: Record<string, string> = {
  mapping: "เลือกเอง",
  code: "ตรงกับรหัส",
  name: "ตรงกับชื่อ",
};

const formatDate = (v: unknown) => (typeof v === "string" && v ? dayjs(v).format("DD/MM/YYYY") : "—");

interface Props {
  preview: LegacyPreviewResult;
  targets: LegacyTargetField[];
  hospitals: Hospital[];
  hospitalValues: Record<string, number>;
  onHospitalValueChange: (value: string, hospitalId: number | null) => void;
  onDuplicate: "skip" | "update";
  stale: boolean;
}

const PreviewStep: React.FC<Props> = ({
  preview,
  targets,
  hospitals,
  hospitalValues,
  onHospitalValueChange,
  onDuplicate,
  stale,
}) => {
  const [level, setLevel] = useState<"all" | "error" | "warning">("all");

  const fieldLabel = useMemo(() => Object.fromEntries(targets.map((t) => [t.key, t.label])), [targets]);
  const hospitalOptions = useMemo(
    () => hospitals.map((h) => ({ value: h.id, label: h.code ? `${h.name} (${h.code})` : h.name })),
    [hospitals],
  );

  const issues = level === "all" ? preview.issues : preview.issues.filter((i) => i.level === level);

  const hospitalColumns = [
    { title: "ค่าในไฟล์", dataIndex: "value", key: "value" },
    { title: "จำนวนแถว", dataIndex: "count", key: "count", width: 100 },
    {
      title: "โรงพยาบาลในระบบ",
      key: "hospital",
      width: 360,
      render: (_: unknown, m: LegacyHospitalValueMatch) => (
        <Select
          style={{ width: "100%" }}
          allowClear
          showSearch={{ optionFilterProp: "label" }}
          placeholder="เลือกโรงพยาบาล"
          status={m.hospital_id || hospitalValues[m.value] ? undefined : "error"}
          options={hospitalOptions}
          value={hospitalValues[m.value] ?? m.hospital_id ?? undefined}
          onChange={(v?: number) => onHospitalValueChange(m.value, v ?? null)}
        />
      ),
    },
    {
      title: "จับคู่โดย",
      key: "matched_by",
      width: 120,
      render: (_: unknown, m: LegacyHospitalValueMatch) =>
        m.matched_by ? <Tag color={m.matched_by === "mapping" ? "blue" : "green"}>{MATCHED_BY_LABEL[m.matched_by]}</Tag> : <Tag color="red">ยังไม่ได้เลือก</Tag>,
    },
  ];

  const issueColumns = [
    { title: "แถว", dataIndex: "row", key: "row", width: 80 },
    {
      title: "ระดับ",
      dataIndex: "level",
      key: "level",
      width: 110,
      render: (v: LegacyImportIssue["level"]) =>
        v === "error" ? <Tag color="error">ข้อผิดพลาด</Tag> : <Tag color="warning">คำเตือน</Tag>,
    },
    {
      title: "ช่อง",
      dataIndex: "field",
      key: "field",
      width: 200,
      render: (v?: string | null) => (v ? fieldLabel[v] ?? v : "—"),
    },
    { title: "รายละเอียด", dataIndex: "message", key: "message" },
  ];

  const sampleColumns = [
    { title: "แถว", dataIndex: "row", key: "row", width: 70 },
    {
      title: "Accession No.",
      key: "accession_no",
      render: (_: unknown, r: LegacyPreviewResult["sample"][number]) => String(r.values.accession_no ?? "—"),
    },
    {
      title: "ผู้ป่วย",
      key: "patient",
      render: (_: unknown, r: LegacyPreviewResult["sample"][number]) =>
        [r.values.patient_title, r.values.patient_name, r.values.patient_ln].filter(Boolean).join(" "),
    },
    { title: "HN", key: "hn", render: (_: unknown, r: LegacyPreviewResult["sample"][number]) => String(r.values.patient_hn ?? "—") },
    {
      title: "โรงพยาบาล",
      key: "hospital",
      render: (_: unknown, r: LegacyPreviewResult["sample"][number]) => String(r.values.hospital_name ?? "—"),
    },
    {
      title: "วันที่ออกรายงาน",
      key: "reported_at",
      render: (_: unknown, r: LegacyPreviewResult["sample"][number]) => formatDate(r.values.reported_at),
    },
    {
      title: "สถานะ",
      key: "existing",
      width: 140,
      render: (_: unknown, r: LegacyPreviewResult["sample"][number]) =>
        r.existing ? (
          <Tag>{onDuplicate === "update" ? "มีแล้ว → อัปเดต" : "มีแล้ว → ข้าม"}</Tag>
        ) : (
          <Tag color="green">ใหม่</Tag>
        ),
    },
  ];

  return (
    <div style={{ opacity: stale ? 0.55 : 1 }}>
      {preview.same_file_batches.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={`ไฟล์นี้เคยนำเข้าแล้ว (ชุดที่ ${preview.same_file_batches.map((b) => `#${b.id}`).join(", ")})`}
          description="แถวที่นำเข้าไปแล้วจะถูกข้ามหรืออัปเดตตามที่เลือกไว้ ไม่เกิดรายงานซ้ำ"
        />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="แถวในไฟล์" value={preview.total_rows} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="รายงานใหม่" value={preview.new_rows} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={onDuplicate === "update" ? "มีอยู่แล้ว (จะอัปเดต)" : "มีอยู่แล้ว (จะข้าม)"}
              value={preview.existing_rows}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="แถวที่มีข้อผิดพลาด"
              value={preview.error_rows}
              styles={{ content: { color: preview.error_rows ? "#cf1322" : undefined } }}
            />
          </Card>
        </Col>
      </Row>

      {preview.hospital_values.length > 0 && (
        <>
          <Typography.Title level={5}>โรงพยาบาลในไฟล์</Typography.Title>
          <Table
            size="small"
            rowKey="value"
            dataSource={preview.hospital_values}
            columns={hospitalColumns}
            pagination={preview.hospital_values.length > 10 ? { pageSize: 10 } : false}
            style={{ marginBottom: 24 }}
          />
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          ปัญหาที่พบ
        </Typography.Title>
        <Segmented
          size="small"
          value={level}
          onChange={(v) => setLevel(v as typeof level)}
          options={[
            { value: "all", label: `ทั้งหมด (${preview.issues.length})` },
            { value: "error", label: "ข้อผิดพลาด" },
            { value: "warning", label: "คำเตือน" },
          ]}
        />
      </div>
      {preview.issues_truncated && (
        <Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
          แสดงเฉพาะ {preview.issues.length.toLocaleString()} รายการแรก
        </Text>
      )}
      <Table
        size="small"
        rowKey={(i) => `${i.row}-${i.level}-${i.field}-${i.message}`}
        dataSource={issues}
        columns={issueColumns}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: "ไม่พบปัญหา" }}
        style={{ marginBottom: 24 }}
      />

      <Typography.Title level={5}>ตัวอย่างข้อมูลที่จะนำเข้า</Typography.Title>
      <Table
        size="small"
        rowKey="row"
        dataSource={preview.sample}
        columns={sampleColumns}
        pagination={false}
        scroll={{ x: 800 }}
        locale={{ emptyText: "ไม่มีแถวที่นำเข้าได้" }}
      />
    </div>
  );
};

export default PreviewStep;
