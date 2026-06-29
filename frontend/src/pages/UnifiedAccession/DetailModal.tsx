import React from "react";
import {
  Modal,
  Table,
  Tag,
  Typography,
  Space,
  Spin,
  Empty,
  Divider,
  Button,
} from "antd";
import {
  FileTextOutlined,
  BlockOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { TYPE_TAG, STAIN_STATUS_COLOR } from "./constants";
import { UnifiedRow, ReportListItem, OutlabStainRun, OutlabRunDetail } from "./types";
import { SurgicalCase } from "../../types/surgical";
import type { OutlabConsultRunResponse } from "../../services/outlabConsultRunService";

const { Text } = Typography;

interface DetailModalProps {
  open: boolean;
  row: UnifiedRow | null;
  onCancel: () => void;
  // reports
  reports: ReportListItem[];
  reportsLoading: boolean;
  loadingPdfKey: string | null;
  onViewPdf: (type: "surgical" | "gyne" | "nongyne", reportId: number, key: string) => void;
  // surgical detail
  caseData: SurgicalCase | null;
  caseLoading: boolean;
  blockLocationMap: Record<number, string>;
  // IHC outlab
  outlabRuns: OutlabStainRun[];
  outlabLoading: boolean;
  // consult
  consultRuns: OutlabConsultRunResponse[];
  consultLoading: boolean;
}

const DetailModal: React.FC<DetailModalProps> = ({
  open,
  row,
  onCancel,
  reports,
  reportsLoading,
  loadingPdfKey,
  onViewPdf,
  caseData,
  caseLoading,
  blockLocationMap,
  outlabRuns,
  outlabLoading,
  consultRuns,
  consultLoading,
}) => (
  <Modal
    open={open}
    title={
      <Space>
        <Text strong>Case Detail</Text>
        {row && (
          <Tag color={TYPE_TAG[row.type]?.color}>
            {row.accession_no}
          </Tag>
        )}
      </Space>
    }
    onCancel={onCancel}
    footer={null}
    width={720}
    destroyOnHidden
    styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
  >
    {/* Reports */}
    <Divider orientationMargin={0}>
      <Space size={6}>
        <FileTextOutlined />
        <Text strong>Reports</Text>
      </Space>
    </Divider>
    {reportsLoading ? (
      <div style={{ textAlign: "center", padding: "24px 0" }}><Spin /></div>
    ) : reports.length === 0 ? (
      <Empty description="No reports" imageStyle={{ height: 40 }} />
    ) : (
      <Table
        dataSource={reports}
        rowKey="id"
        size="small"
        pagination={false}
        bordered={false}
        columns={[
          {
            title: "Report ID",
            dataIndex: "id",
            width: 90,
            render: (v: number) => <Text strong>#{v}</Text>,
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 120,
            render: (s: string) => (
              <Tag color={s === "published" ? "green" : "orange"}>{s?.toUpperCase()}</Tag>
            ),
          },
          {
            title: "Published",
            dataIndex: "published_at",
            width: 160,
            render: (v: string) => v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "-",
          },
          {
            title: "",
            width: 120,
            render: (_: unknown, report: ReportListItem) => {
              const btnStyle =
                row?.type === "gyne"
                  ? { background: "#722ed1", borderColor: "#722ed1" }
                  : row?.type === "nongyne"
                    ? { background: "#13c2c2", borderColor: "#13c2c2" }
                    : undefined;
              return (
                <Button
                  type="primary"
                  danger={row?.type === "surgical"}
                  ghost={row?.type === "surgical"}
                  style={btnStyle}
                  size="small"
                  icon={<FileSearchOutlined />}
                  loading={loadingPdfKey === `modal-${report.id}`}
                  onClick={() => onViewPdf(row!.type, report.id, `modal-${report.id}`)}
                >
                  View PDF
                </Button>
              );
            },
          },
        ]}
      />
    )}

    {/* Surgical-only sections */}
    {row?.type === "surgical" && (
      <>
        <Divider orientationMargin={0} style={{ marginTop: 24 }}>
          <Space size={6}>
            <BlockOutlined />
            <Text strong>Block History</Text>
          </Space>
        </Divider>
        {caseLoading ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}><Spin /></div>
        ) : caseData?.specimens?.length ? (
          caseData.specimens.map((sp) => (
            <div key={sp.id} style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 13 }}>
                {sp.specimen_label}. {sp.specimen_name}
              </Text>
              <div style={{ marginTop: 6 }}>
                {sp.blocks?.length ? (
                  <Table
                    dataSource={sp.blocks}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    bordered
                    columns={[
                      {
                        title: "Block",
                        dataIndex: "block_code",
                        width: 80,
                        render: (v: string) => <b>{v}</b>,
                      },
                      {
                        title: "Status",
                        dataIndex: "status",
                        width: 140,
                        render: (s: string) => {
                          if (caseData?.is_out_lab_consult && caseData?.consult_status !== "completed") {
                            return <Tag color="purple">Sent to Consult</Tag>;
                          }
                          return <Tag color={s === "completed" ? "green" : "blue"}>{s}</Tag>;
                        },
                      },
                      {
                        title: "Stains",
                        dataIndex: "stains",
                        render: (stains: { id: number; status: string; stain_type: string }[]) =>
                          stains?.length ? (
                            <Space wrap size={4}>
                              {stains.map((s) => (
                                <Tag key={s.id} color={STAIN_STATUS_COLOR[s.status] ?? "default"} style={{ fontSize: 11 }}>
                                  {s.stain_type}
                                </Tag>
                              ))}
                            </Space>
                          ) : (
                            <Text type="secondary">—</Text>
                          ),
                      },
                      {
                        title: "Location",
                        key: "location",
                        width: 120,
                        render: (_: unknown, block: { id: number; status: string }) =>
                          block.status === "stored" ? (
                            blockLocationMap[block.id] ? (
                              <Tag color="cyan" style={{ fontSize: 11 }}>{blockLocationMap[block.id]}</Tag>
                            ) : (
                              <Text type="secondary">—</Text>
                            )
                          ) : null,
                      },
                    ]}
                  />
                ) : (
                  <Text type="secondary">No blocks</Text>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty description="No specimens" imageStyle={{ height: 40 }} />
        )}

        {/* IHC Outlab Tracking */}
        <Divider orientationMargin={0} style={{ marginTop: 24 }}>
          <Space size={6}>
            <ExperimentOutlined />
            <Text strong>IHC Outlab Tracking</Text>
          </Space>
        </Divider>
        {outlabLoading ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}><Spin /></div>
        ) : outlabRuns.length ? (
          <Table
            dataSource={outlabRuns}
            rowKey="id"
            size="small"
            pagination={false}
            bordered
            expandable={{
              expandedRowRender: (run: OutlabStainRun) => {
                const items = (run.details ?? []).filter((d) => d.accession_no === row?.accession_no);
                return (
                  <Table
                    dataSource={items}
                    rowKey={(d) => d.block_id + "-" + d.stain_order?.id}
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: "Block",
                        dataIndex: "block_code",
                        width: 80,
                        render: (v: string) => <b>{v || "—"}</b>,
                      },
                      {
                        title: "Stain",
                        render: (_: unknown, d: OutlabRunDetail) => d.stain_order?.test?.name || "—",
                      },
                      {
                        title: "Category",
                        render: (_: unknown, d: OutlabRunDetail) =>
                          d.stain_order?.test?.category ? (
                            <Tag color="purple">{d.stain_order.test.category}</Tag>
                          ) : "—",
                      },
                    ]}
                  />
                );
              },
              rowExpandable: (run: OutlabStainRun) =>
                (run.details ?? []).some((d) => d.accession_no === row?.accession_no),
            }}
            columns={[
              {
                title: "Run No.",
                dataIndex: "run_no",
                width: 100,
                render: (v: string) => <b>{v || "—"}</b>,
              },
              {
                title: "Destination Lab",
                dataIndex: "destination_lab",
                width: 160,
              },
              {
                title: "Sent At",
                dataIndex: "sent_at",
                width: 140,
                render: (v: string) => v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—",
              },
              {
                title: "Received At",
                dataIndex: "received_at",
                width: 140,
                render: (v: string) =>
                  v ? (
                    <Space size={4}>
                      <CheckCircleOutlined style={{ color: "#52c41a" }} />
                      <Text>{dayjs(v).format("DD/MM/YYYY HH:mm")}</Text>
                    </Space>
                  ) : (
                    <Tag color="orange">Pending</Tag>
                  ),
              },
              {
                title: "Slides",
                width: 70,
                render: (_: unknown, run: OutlabStainRun) => {
                  const count = (run.details ?? []).filter((d) => d.accession_no === row?.accession_no).length;
                  return <Tag color="blue">{count}</Tag>;
                },
              },
            ]}
          />
        ) : (
          <Empty description="No IHC outlab runs for this case" imageStyle={{ height: 40 }} />
        )}
      </>
    )}

    {/* Consult History — all types */}
    <Divider orientationMargin={0} style={{ marginTop: 24 }}>
      <Space size={6}>
        <CheckCircleOutlined />
        <Text strong>Consult History</Text>
      </Space>
    </Divider>
    {consultLoading ? (
      <div style={{ textAlign: "center", padding: "24px 0" }}><Spin /></div>
    ) : consultRuns.length ? (
      <Table
        dataSource={consultRuns}
        rowKey="id"
        size="small"
        pagination={false}
        bordered
        columns={[
          {
            title: "Run No.",
            dataIndex: "run_no",
            width: 100,
            render: (v: string) => <Text strong>{v || "—"}</Text>,
          },
          {
            title: "Destination Lab",
            dataIndex: "destination_lab",
            width: 180,
          },
          {
            title: "Sent At",
            dataIndex: "sent_at",
            width: 150,
            render: (v: string) => v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—",
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 110,
            render: (v: string) => (
              <Tag color={v === "completed" ? "green" : v === "processing" ? "blue" : "orange"}>
                {v?.toUpperCase() || "—"}
              </Tag>
            ),
          },
        ]}
      />
    ) : (
      <Empty description="No consult history" imageStyle={{ height: 40 }} />
    )}
  </Modal>
);

export default DetailModal;
