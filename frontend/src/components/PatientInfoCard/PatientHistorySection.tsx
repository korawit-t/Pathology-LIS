import React from "react";
import { Table, Tag, Button, Space, Divider, Typography } from "antd";
import {
  HistoryOutlined,
  LinkOutlined,
  EditOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { SurgicalCase } from "../../types/surgical";
import {
  GyneCytoHistoryItem,
  NongyneCytoHistoryItem,
} from "../../services/patientService";
import SurgicalReportService from "../../services/surgicalReportService";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import NongyneReportService from "../../services/nongyneReportService";
import { ActiveCaseType, MarkTarget } from "./types";

const { Text } = Typography;

interface PatientHistorySectionProps {
  history: SurgicalCase[];
  loading: boolean;
  gyneHistory: GyneCytoHistoryItem[];
  gyneLoading: boolean;
  nongyneHistory: NongyneCytoHistoryItem[];
  nongyneLoading: boolean;
  corrMap: Record<string, number>;
  openMarkModal: (rowCaseId: number, rowAccession: string, rowCaseType: MarkTarget["rowCaseType"]) => void;
  activeCaseType?: ActiveCaseType;
  hideMarkRelated: boolean;
  previewLoading: boolean;
  previewTitle: string;
  openPdfPreview: (fetchFn: () => Promise<Blob>, loadingTitle: string, displayTitle: string) => Promise<void>;
}

const EmptyHistory: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ padding: "10px", textAlign: "center", background: "#fafafa", borderRadius: "4px" }}>
    <Text type="secondary">{text}</Text>
  </div>
);

const SectionDivider: React.FC<{ title: string; count: number }> = ({ title, count }) => (
  <Divider style={{ margin: "0 0 12px 0" }}>
    <Space>
      <HistoryOutlined />
      <Text strong style={{ color: "#8c8c8c" }}>{title} ({count})</Text>
    </Space>
  </Divider>
);

const renderCorrelationCell = (
  corrKey: string,
  rowCaseId: number,
  rowAccession: string,
  rowCaseType: MarkTarget["rowCaseType"],
  corrMap: Record<string, number>,
  openMarkModal: PatientHistorySectionProps["openMarkModal"],
  hideMarkRelated: boolean,
  linkedLabel = "Correlated",
  linkedColor = "purple",
) => {
  if (hideMarkRelated) return null;
  if (corrMap[corrKey]) {
    return (
      <Space size={4}>
        <Tag color={linkedColor} icon={<LinkOutlined />} style={{ margin: 0, fontSize: "11px" }}>
          {linkedLabel}
        </Tag>
        <Button size="small" type="text" icon={<EditOutlined />}
          onClick={() => openMarkModal(rowCaseId, rowAccession, rowCaseType)} />
      </Space>
    );
  }
  return (
    <Button size="small" type="dashed" icon={<LinkOutlined />}
      onClick={() => openMarkModal(rowCaseId, rowAccession, rowCaseType)}>
      Mark Related
    </Button>
  );
};

const PatientHistorySection: React.FC<PatientHistorySectionProps> = ({
  history,
  loading,
  gyneHistory,
  gyneLoading,
  nongyneHistory,
  nongyneLoading,
  corrMap,
  openMarkModal,
  activeCaseType,
  hideMarkRelated,
  previewLoading,
  previewTitle,
  openPdfPreview,
}) => {
  const tableStyle = { border: "1px solid #f0f0f0", borderRadius: "4px" };

  return (
    <div style={{ marginTop: 20 }}>

      {/* Surgical History */}
      <SectionDivider title="Previous Case History" count={history.length} />
      {history.length > 0 ? (
        <Table
          dataSource={history}
          rowKey="id"
          size="small"
          pagination={false}
          loading={loading}
          style={tableStyle}
          locale={{ emptyText: "No previous history found" }}
          columns={[
            {
              title: "Accession",
              dataIndex: "accession_no",
              width: 150,
              render: (text) => <Text strong style={{ color: "#003a8c" }}>{text}</Text>,
            },
            {
              title: "Date",
              dataIndex: "registered_at",
              width: 120,
              render: (date) => dayjs(date).format("DD/MM/YYYY"),
            },
            ...(activeCaseType === "gyne" || activeCaseType === "nongyne"
              ? [{
                  title: "",
                  key: "correlation",
                  width: 130,
                  render: (_: unknown, record: SurgicalCase) =>
                    renderCorrelationCell(
                      `surgical-${record.accession_no}`,
                      record.id, record.accession_no, "surgical",
                      corrMap, openMarkModal, hideMarkRelated,
                    ),
                }]
              : activeCaseType === "surgical"
              ? [{
                  title: "",
                  key: "surg_surg_correlation",
                  width: 130,
                  render: (_: unknown, record: SurgicalCase) =>
                    renderCorrelationCell(
                      `surg_surg-${record.id}`,
                      record.id, record.accession_no, "surgical",
                      corrMap, openMarkModal, hideMarkRelated,
                      "Linked", "volcano",
                    ),
                }]
              : []),
            {
              title: "Specimen & Diagnosis",
              key: "summary",
              render: (_: unknown, record: SurgicalCase) => (
                <div style={{ fontSize: "12px" }}>
                  <div style={{ marginBottom: record.reports?.length ? 6 : 0 }}>
                    {record.specimens?.length > 0 ? (
                      record.specimens.map((sp, i) => (
                        <Tag key={i} color="blue" style={{ marginBottom: 2 }}>{sp.specimen_name}</Tag>
                      ))
                    ) : (
                      <Text type="secondary" style={{ fontSize: "11px" }}>—</Text>
                    )}
                    {record.has_malignancy && (
                      <Tag color="error" style={{ fontSize: "10px" }}>MALIGNANCY</Tag>
                    )}
                  </div>
                  {record.reports
                    ?.filter((r) => ["published", "completed"].includes(r.status?.toLowerCase()))
                    .map((r) => (
                      <Button
                        key={r.id}
                        type="link"
                        size="small"
                        icon={<FilePdfOutlined style={{ color: "#ff4d4f" }} />}
                        loading={previewLoading && previewTitle === `report_${r.id}`}
                        style={{ padding: "0 4px", fontSize: "11px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPdfPreview(
                            () => SurgicalReportService.getReportPdf(r.id),
                            `report_${r.id}`,
                            `Report ${record.accession_no}`,
                          );
                        }}
                      >
                        Report PDF
                      </Button>
                    ))}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <EmptyHistory text="No previous surgical history found." />
      )}

      {/* Gyne Cytology History */}
      <div style={{ marginTop: 20 }}>
        <SectionDivider title="Gyne Cytology History" count={gyneHistory.length} />
        {gyneHistory.length > 0 ? (
          <Table
            dataSource={gyneHistory}
            rowKey="id"
            size="small"
            pagination={false}
            loading={gyneLoading}
            style={tableStyle}
            locale={{ emptyText: "No gyne cytology history found" }}
            columns={[
              {
                title: "Accession",
                dataIndex: "accession_no",
                width: 140,
                render: (text: string) => <Text strong style={{ color: "#003a8c" }}>{text}</Text>,
              },
              {
                title: "Date",
                dataIndex: "registered_at",
                width: 110,
                render: (date: string) => date ? dayjs(date).format("DD/MM/YYYY") : "—",
              },
              {
                title: "Main Category",
                key: "cat1",
                render: (_: unknown, record: GyneCytoHistoryItem) =>
                  record.category_1 ? (
                    <Tag color="purple" style={{ fontSize: "11px" }}>
                      <b>{record.category_1.code}</b> — {record.category_1.text}
                    </Tag>
                  ) : (
                    <Text type="secondary" style={{ fontSize: "11px" }}>—</Text>
                  ),
              },
              {
                title: "Sub Category",
                key: "cat2",
                render: (_: unknown, record: GyneCytoHistoryItem) =>
                  record.category_2 ? (
                    <Tag color="geekblue" style={{ fontSize: "11px" }}>
                      <b>{record.category_2.code}</b> — {record.category_2.text}
                    </Tag>
                  ) : (
                    <Text type="secondary" style={{ fontSize: "11px" }}>—</Text>
                  ),
              },
              ...(activeCaseType === "surgical"
                ? [{
                    title: "",
                    key: "correlation",
                    width: 130,
                    render: (_: unknown, record: GyneCytoHistoryItem) =>
                      renderCorrelationCell(
                        `gyne-${record.id}`,
                        record.id, record.accession_no, "gyne",
                        corrMap, openMarkModal, hideMarkRelated,
                      ),
                  }]
                : []),
              {
                title: "Report",
                key: "report",
                width: 110,
                render: (_: unknown, record: GyneCytoHistoryItem) =>
                  record.latest_report_id ? (
                    <Button
                      type="link"
                      size="small"
                      icon={<FilePdfOutlined style={{ color: "#ff4d4f" }} />}
                      loading={previewLoading && previewTitle === `gyne_report_${record.latest_report_id}`}
                      style={{ padding: "0 4px", fontSize: "11px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openPdfPreview(
                          () => GyneDiagnosisService.getReportPdf(record.latest_report_id!),
                          `gyne_report_${record.latest_report_id}`,
                          `Report ${record.accession_no}`,
                        );
                      }}
                    >
                      Report PDF
                    </Button>
                  ) : (
                    <Text type="secondary" style={{ fontSize: "11px" }}>—</Text>
                  ),
              },
            ]}
          />
        ) : (
          <EmptyHistory text="No previous gyne cytology history found." />
        )}
      </div>

      {/* Non-Gyne Cytology History */}
      <div style={{ marginTop: 20 }}>
        <SectionDivider title="Non-Gyne Cytology History" count={nongyneHistory.length} />
        {nongyneHistory.length > 0 ? (
          <Table
            dataSource={nongyneHistory}
            rowKey="id"
            size="small"
            pagination={false}
            loading={nongyneLoading}
            style={tableStyle}
            locale={{ emptyText: "No non-gyne cytology history found" }}
            columns={[
              {
                title: "Accession",
                dataIndex: "accession_no",
                width: 140,
                render: (text: string) => <Text strong style={{ color: "#003a8c" }}>{text}</Text>,
              },
              {
                title: "Date",
                dataIndex: "registered_at",
                width: 110,
                render: (date: string) => date ? dayjs(date).format("DD/MM/YYYY") : "—",
              },
              {
                title: "Specimen Type",
                dataIndex: "specimen_type",
                render: (v: string) =>
                  v ? (
                    <Tag color="orange" style={{ fontSize: "11px" }}>{v}</Tag>
                  ) : (
                    <Text type="secondary" style={{ fontSize: "11px" }}>—</Text>
                  ),
              },
              ...(activeCaseType === "surgical"
                ? [{
                    title: "",
                    key: "correlation",
                    width: 130,
                    render: (_: unknown, record: NongyneCytoHistoryItem) =>
                      renderCorrelationCell(
                        `nongyne-${record.id}`,
                        record.id, record.accession_no, "nongyne",
                        corrMap, openMarkModal, hideMarkRelated,
                      ),
                  }]
                : []),
              {
                title: "Report",
                width: 110,
                render: (_: unknown, record: NongyneCytoHistoryItem) =>
                  record.latest_report_id ? (
                    <Button
                      type="link"
                      size="small"
                      icon={<FilePdfOutlined style={{ color: "#ff4d4f" }} />}
                      loading={previewLoading && previewTitle === `nongyne_report_${record.latest_report_id}`}
                      style={{ padding: "0 4px", fontSize: "11px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openPdfPreview(
                          () => NongyneReportService.getReportPdf(record.latest_report_id!),
                          `nongyne_report_${record.latest_report_id}`,
                          `Report ${record.accession_no}`,
                        );
                      }}
                    >
                      Report PDF
                    </Button>
                  ) : (
                    <Text type="secondary" style={{ fontSize: "11px" }}>—</Text>
                  ),
              },
            ]}
          />
        ) : (
          <EmptyHistory text="No previous non-gyne cytology history found." />
        )}
      </div>

    </div>
  );
};

export default PatientHistorySection;
