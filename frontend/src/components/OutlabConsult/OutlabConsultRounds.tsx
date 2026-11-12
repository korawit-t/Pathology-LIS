import React, { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, FilePdfOutlined, HistoryOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import StyledCard from "../Layout/StyledCard";
import ConsultRoundTag from "./ConsultRoundTag";
import ExternalLabService from "../../services/externalLabService";
import {
  CONCORDANCE_LABELS,
  Concordance,
  ConsultCaseType,
  ConsultRoundDetailsPatch,
  ConsultRoundStatus,
  OutlabConsultRound,
  OutlabConsultService,
  isOpenRound,
} from "../../services/outlabConsultService";
import { getErrorDetail } from "../../utils/errorHandler";

const { Text } = Typography;
const { TextArea } = Input;

const STATUS_TAG: Record<ConsultRoundStatus, { color: string; label: string }> = {
  requested: { color: "orange", label: "Queued for dispatch" },
  sent: { color: "blue", label: "Sent to lab" },
  result_received: { color: "gold", label: "Result in — awaiting approval" },
  approved: { color: "purple", label: "Approved — ready to release" },
  reported: { color: "green", label: "Released on report" },
  cancelled: { color: "default", label: "Cancelled" },
};

const CONCORDANCE_COLOR: Record<Concordance, string> = {
  concordant: "green",
  minor_discordant: "gold",
  major_discordant: "red",
};

const fmt = (v?: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : null);

export interface OutlabConsultRoundsProps {
  caseType: ConsultCaseType;
  caseId: number;
  /** Re-reads the rounds when it changes — pass the case's cached consult
   * state so an upload/approve elsewhere on the page shows up here. */
  refreshKey?: unknown;
  /** Called after this panel requests a round or edits one, so the page can
   * refetch the case (its consult_* cache moved). */
  onChanged?: () => void;
  /** Offer "Request another consult" here. Surgical leaves it off — its Case
   * Actions panel already has the Out-Lab Consult button. */
  canRequestAnother?: boolean;
  readOnly?: boolean;
}

/**
 * Every out-lab consult round of one case (S26-01234-C1, -C2, …): where it
 * went, when it came back, who approved it, the destination lab's own
 * reference, who read it there and whether they agreed. A case can be sent
 * again once its latest round is released.
 */
const OutlabConsultRounds: React.FC<OutlabConsultRoundsProps> = ({
  caseType,
  caseId,
  refreshKey,
  onChanged,
  canRequestAnother = true,
  readOnly = false,
}) => {
  const [rounds, setRounds] = useState<OutlabConsultRound[]>([]);
  const [version, setVersion] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [editing, setEditing] = useState<OutlabConsultRound | null>(null);
  const [saving, setSaving] = useState(false);
  const [labs, setLabs] = useState<string[]>([]);
  const [requestForm] = Form.useForm<{ reason: string; destination_lab?: string }>();
  const [detailsForm] = Form.useForm<ConsultRoundDetailsPatch>();

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    OutlabConsultService.listForCase(caseType, caseId)
      .then((r) => {
        if (!cancelled) setRounds(r);
      })
      .catch(() => {
        if (!cancelled) setRounds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [caseType, caseId, refreshKey, version]);

  useEffect(() => {
    if (!requestOpen || labs.length) return;
    ExternalLabService.getExternalLabs(true)
      .then((list) => setLabs(list.map((l) => l.name)))
      .catch(() => {});
  }, [requestOpen, labs.length]);

  if (rounds.length === 0) return null;

  const hasOpenRound = rounds.some(isOpenRound);
  const reload = () => {
    setVersion((v) => v + 1);
    onChanged?.();
  };

  const handleRequest = async () => {
    const values = await requestForm.validateFields();
    setSaving(true);
    try {
      const round = await OutlabConsultService.request(
        caseType,
        caseId,
        values.reason.trim(),
        values.destination_lab,
      );
      message.success(`${round.consult_no} queued for Out-Lab Consult`);
      setRequestOpen(false);
      requestForm.resetFields();
      reload();
    } catch (err) {
      message.error(getErrorDetail(err) ?? "Failed to request another consult");
    } finally {
      setSaving(false);
    }
  };

  const openDetails = (round: OutlabConsultRound) => setEditing(round);

  const handleSaveDetails = async () => {
    if (!editing) return;
    const values = detailsForm.getFieldsValue();
    // A released round is frozen except for concordance (recorded later is fine).
    const patch: ConsultRoundDetailsPatch =
      editing.status === "reported"
        ? { concordance: values.concordance ?? null }
        : {
            destination_lab: values.destination_lab?.trim() || null,
            external_ref: values.external_ref?.trim() || null,
            external_pathologist: values.external_pathologist?.trim() || null,
            concordance: values.concordance ?? null,
          };
    setSaving(true);
    try {
      await OutlabConsultService.updateDetails(editing.id, patch);
      message.success(`${editing.consult_no} updated`);
      setEditing(null);
      reload();
    } catch (err) {
      message.error(getErrorDetail(err) ?? "Failed to save consult details");
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async (round: OutlabConsultRound) => {
    try {
      const blob = await OutlabConsultService.getResultPdfBlob(round.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      message.error("Failed to load the consult PDF");
    }
  };

  const columns: ColumnsType<OutlabConsultRound> = [
    {
      title: "Round",
      dataIndex: "consult_no",
      width: 70,
      render: (v: string) => <ConsultRoundTag consultNo={v} />,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 190,
      render: (v: ConsultRoundStatus) => {
        const cfg = STATUS_TAG[v] ?? { color: "default", label: v };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: "Sent to",
      key: "destination",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text>{r.destination_lab || "—"}</Text>
          {r.external_ref && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ref: {r.external_ref}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Requested",
      key: "requested",
      width: 150,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{fmt(r.requested_at) ?? "—"}</Text>
          {r.requested_by_name && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.requested_by_name}
            </Text>
          )}
          {r.reason && (
            <Tooltip title={r.reason}>
              <Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 140 }}>
                {r.reason}
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Result",
      key: "result",
      width: 170,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>
            {fmt(r.result_received_at) ? `Received ${fmt(r.result_received_at)}` : "—"}
          </Text>
          {r.approved_by_name && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Approved by {r.approved_by_name}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Read by",
      key: "reader",
      width: 170,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12 }}>{r.external_pathologist || "—"}</Text>
          {r.concordance && (
            <Tag color={CONCORDANCE_COLOR[r.concordance as Concordance] ?? "default"}>
              {CONCORDANCE_LABELS[r.concordance as Concordance] ?? r.concordance}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_, r) => (
        <Space size={4}>
          {r.has_result_pdf && (
            <Tooltip title="Open the consult PDF">
              <Button
                size="small"
                icon={<FilePdfOutlined />}
                aria-label={`Open ${r.consult_no} PDF`}
                onClick={() => openPdf(r)}
              />
            </Tooltip>
          )}
          {!readOnly && r.status !== "cancelled" && (
            <Tooltip title="Reference, reader and concordance">
              <Button
                size="small"
                icon={<EditOutlined />}
                aria-label={`Edit ${r.consult_no} details`}
                onClick={() => openDetails(r)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const isReleased = editing?.status === "reported";

  return (
    <StyledCard
      size="small"
      style={{ borderRadius: 12 }}
      title={
        <Space>
          <HistoryOutlined style={{ color: "#722ed1" }} />
          <Text strong style={{ color: "#722ed1" }}>
            Out-Lab Consult Rounds
          </Text>
        </Space>
      }
      extra={
        canRequestAnother && !readOnly && !hasOpenRound ? (
          <Button
            size="small"
            icon={<PlusOutlined />}
            style={{ color: "#722ed1", borderColor: "#722ed1" }}
            onClick={() => setRequestOpen(true)}
          >
            Request another consult
          </Button>
        ) : null
      }
    >
      <Table
        size="small"
        rowKey="id"
        dataSource={rounds}
        columns={columns}
        pagination={false}
        scroll={{ x: 900 }}
      />

      <Modal
        title="Request another Out-Lab Consult"
        open={requestOpen}
        onCancel={() => setRequestOpen(false)}
        onOk={handleRequest}
        okText="Queue for dispatch"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={requestForm} layout="vertical" preserve={false}>
          <Form.Item
            name="reason"
            label="Reason"
            rules={[{ required: true, whitespace: true, message: "Please enter a reason for the consult." }]}
          >
            <TextArea rows={3} placeholder="What should the consultant look at?" />
          </Form.Item>
          <Form.Item name="destination_lab" label="Destination lab (optional)">
            <Select
              allowClear
              showSearch
              placeholder="Chosen again when the run is sent"
              options={labs.map((name) => ({ label: name, value: name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? `${editing.consult_no} — details` : ""}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSaveDetails}
        okText="Save"
        confirmLoading={saving}
        destroyOnHidden
      >
        {isReleased && (
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            This round has been released on a report — only the concordance can still be recorded.
          </Text>
        )}
        <Form
          form={detailsForm}
          layout="vertical"
          key={editing?.id}
          preserve={false}
          initialValues={{
            destination_lab: editing?.destination_lab ?? undefined,
            external_ref: editing?.external_ref ?? undefined,
            external_pathologist: editing?.external_pathologist ?? undefined,
            concordance: (editing?.concordance as Concordance | null) ?? undefined,
          }}
        >
          <Form.Item name="destination_lab" label="Destination lab">
            <Input disabled={isReleased} />
          </Form.Item>
          <Form.Item name="external_ref" label="Destination lab's reference no.">
            <Input disabled={isReleased} />
          </Form.Item>
          <Form.Item name="external_pathologist" label="Read by">
            <Input disabled={isReleased} />
          </Form.Item>
          <Form.Item name="concordance" label="Concordance with our diagnosis">
            <Select
              allowClear
              placeholder="Not recorded"
              options={(Object.keys(CONCORDANCE_LABELS) as Concordance[]).map((k) => ({
                value: k,
                label: CONCORDANCE_LABELS[k],
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </StyledCard>
  );
};

export default OutlabConsultRounds;
