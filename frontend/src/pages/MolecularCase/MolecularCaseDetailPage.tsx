import React, { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Select, Space, Switch, Tag, Typography, Input, Spin, message } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

import PageContainer from "../../components/Layout/PageContainer";
import ConsultPdfPanel from "../../components/OutlabConsult/ConsultPdfPanel";
import { MolecularCaseService, MolecularCaseResponse } from "../../services/molecularCaseService";
import UserService from "../../services/userService";
import type { User } from "../../types/user";

const { Text } = Typography;
const { TextArea } = Input;

const STATUS_COLOR: Record<string, string> = {
  pending: "gold",
  reported: "green",
};

interface MolecularCaseDetailPageProps {
  caseId: number;
  onBack: () => void;
  /** Registration-desk contexts (e.g. the Accession page) can view/cancel a
   * case but have no authority to enter or finalize its result — hides the
   * result textarea and the Save Draft/Finalize actions. Defaults to true
   * for the dedicated Molecular Pathology worklist page. */
  canEnterResult?: boolean;
}

const MolecularCaseDetailPage: React.FC<MolecularCaseDetailPageProps> = ({ caseId, onBack, canEnterResult = true }) => {
  const [record, setRecord] = useState<MolecularCaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultDraft, setResultDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [savingAssistPathologist, setSavingAssistPathologist] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await MolecularCaseService.getById(caseId);
      setRecord(fresh);
      setResultDraft(fresh.result_text || "");
    } catch {
      message.error("Failed to load Molecular case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    UserService.getUsers({ role: "pathologist" })
      .then(setPathologists)
      .catch(() => {});
  }, []);

  const isLocked = !!record && (record.status === "reported" || record.is_cancelled);

  const toggleOutlab = async (checked: boolean) => {
    if (!record) return;
    try {
      setRecord(await MolecularCaseService.update(record.id, { is_outlab: checked }));
    } catch {
      message.error("Failed to update Out-lab flag");
    }
  };

  const changeAssistPathologist = async (value: number | null) => {
    if (!record) return;
    setSavingAssistPathologist(true);
    try {
      setRecord(await MolecularCaseService.update(record.id, { assist_pathologist_id: value }));
    } catch {
      message.error("Failed to update Assist Pathologist");
    } finally {
      setSavingAssistPathologist(false);
    }
  };

  const saveDraft = async () => {
    if (!record) return;
    setSaving(true);
    try {
      setRecord(await MolecularCaseService.update(record.id, { result_text: resultDraft }));
      message.success("Draft saved");
    } catch {
      message.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!record) return;
    setFinalizing(true);
    try {
      setRecord(await MolecularCaseService.finalize(record.id, { result_text: resultDraft }));
      message.success("Molecular case finalized");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      message.error(axiosErr?.response?.data?.detail || "Failed to finalize");
    } finally {
      setFinalizing(false);
    }
  };

  const cancelCase = async () => {
    if (!record) return;
    try {
      await MolecularCaseService.cancel(record.id, {});
      message.success("Molecular case cancelled");
      onBack();
    } catch {
      message.error("Failed to cancel");
    }
  };

  return (
    <PageContainer
      withCard
      title={record ? `${record.accession_no} — ${record.test_name || "Molecular Test"}` : "Molecular Pathology"}
      onBack={onBack}
    >
      {loading || !record ? (
        <Spin size="large" style={{ display: "block", margin: "100px auto" }} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
          <Space direction="vertical" size={0}>
            <Text type="secondary">Parent case: {record.parent_case_accession_no || "Standalone (no parent case)"}</Text>
            <Text type="secondary">
              Patient: {record.patient_name || "—"} {record.hn ? `(HN ${record.hn})` : ""}
            </Text>
            <Space>
              <Tag color={STATUS_COLOR[record.status] || "default"}>{record.status}</Tag>
              {record.is_cancelled && <Tag color="red">Cancelled</Tag>}
            </Space>
          </Space>

          <Space align="center">
            <Text>Out-lab:</Text>
            <Switch checked={record.is_outlab} disabled={isLocked} onChange={toggleOutlab} />
          </Space>

          <Space align="center">
            <Text>Assist Pathologist:</Text>
            <Select
              allowClear
              style={{ minWidth: 220 }}
              placeholder="Select assist pathologist"
              disabled={isLocked}
              loading={savingAssistPathologist}
              value={record.assist_pathologist_id ?? undefined}
              onChange={(value) => changeAssistPathologist(value ?? null)}
              options={pathologists.map((p) => ({ value: p.id, label: p.full_name || p.username }))}
            />
          </Space>

          <ConsultPdfPanel
            caseId={record.id}
            isOutLabConsult={record.is_outlab}
            consultPdfPath={record.outlab_pdf_path}
            onUpload={(id, file, receivedAt) => MolecularCaseService.uploadOutlabPdf(id, file, receivedAt)}
            onDelete={(id) => MolecularCaseService.deleteOutlabPdf(id)}
            onGetBlob={(id) => MolecularCaseService.getOutlabPdfBlob(id)}
            onRefresh={load}
            panelTitle="Out-Lab Molecular Report PDF"
            emptyStateMessage="This test was sent to an external lab. Please upload the result PDF once received."
            receivedStateMessage="Molecular result PDF received."
          />

          {canEnterResult && (
            <div>
              <Text style={{ display: "block", marginBottom: 6 }}>
                {record.is_outlab ? "Result summary (optional — PDF above is the primary result)" : "Result"}
              </Text>
              <TextArea
                rows={6}
                value={resultDraft}
                disabled={isLocked}
                onChange={(e) => setResultDraft(e.target.value)}
                placeholder="Free-text molecular findings, e.g. EGFR exon 19 deletion detected, VAF 12%"
              />
            </div>
          )}

          {!isLocked && (
            <Space>
              {canEnterResult && (
                <>
                  <Button onClick={saveDraft} loading={saving}>
                    Save Draft
                  </Button>
                  <Button type="primary" onClick={finalize} loading={finalizing}>
                    Finalize
                  </Button>
                </>
              )}
              <Popconfirm
                title="Cancel this Molecular case?"
                icon={<ExclamationCircleOutlined style={{ color: "#faad14" }} />}
                onConfirm={cancelCase}
                okText="Cancel case"
                okButtonProps={{ danger: true }}
                cancelText="Back"
              >
                <Button danger>Cancel</Button>
              </Popconfirm>
            </Space>
          )}
        </Space>
      )}
    </PageContainer>
  );
};

export default MolecularCaseDetailPage;
