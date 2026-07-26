import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Radio,
  Input,
  Space,
  Tag,
  Typography,
  message,
  Popconfirm,
  Divider,
  Spin,
} from "antd";
import {
  LinkOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import StyledCard from "../../../../components/Layout/StyledCard";
import CytoHistoCorrelationService, {
  SurgicalContextItem,
} from "../../../../services/cytoHistoCorrelationService";
import type { SurgicalCase } from "../../../../types/surgical";
import type { User } from "../../../../types/user";
import logger from "../../../../utils/logger";
import { sanitizeHtml } from "../../../../utils/sanitize";

const { Text } = Typography;

const RESULT_OPTIONS = [
  { value: "agree",              label: "Agree",             color: "green"   },
  { value: "minor_discrepancy",  label: "Minor Discrepancy", color: "orange"  },
  { value: "major_discrepancy",  label: "Major Discrepancy", color: "red"     },
  { value: "no_follow_up",       label: "No Follow-up",      color: "default" },
];

function ResultTag({ value }: { value: string }) {
  const opt = RESULT_OPTIONS.find((o) => o.value === value);
  if (!opt) return <Tag>{value}</Tag>;
  const icon = value === "agree" ? <CheckCircleOutlined /> : value.includes("discrepancy") ? <ExclamationCircleOutlined /> : undefined;
  return <Tag color={opt.color} icon={icon}>{opt.label}</Tag>;
}

interface FormState {
  result: string;
  histoDx: string;
  comment: string;
  saving: boolean;
  editing: boolean;
}

interface Props {
  surgicalCase: SurgicalCase;
  currentUser: User;
  isLocked: boolean;
}

const CytoHistoCorrelationCard: React.FC<Props> = ({ surgicalCase, currentUser, isLocked }) => {
  const [items, setItems]       = useState<SurgicalContextItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [formState, setFormState] = useState<Record<number, FormState>>({});

  const patientId  = surgicalCase?.patient_id;
  const accessionNo = surgicalCase?.accession_no;

  const fetchContext = useCallback(async () => {
    if (!patientId || !accessionNo) return;
    setLoading(true);
    try {
      const data = await CytoHistoCorrelationService.getSurgicalContext(patientId, accessionNo);
      setItems(data);
      const init: Record<number, FormState> = {};
      data.forEach(({ nongyne_case, correlation }) => {
        init[nongyne_case.id] = {
          result:  correlation?.correlation_result ?? "agree",
          histoDx: correlation?.histology_diagnosis ?? "",
          comment: correlation?.comment ?? "",
          saving:  false,
          editing: false,
        };
      });
      setFormState(init);
    } catch (err) {
      logger.error("CytoHistoCorrelation fetch", err);
    } finally {
      setLoading(false);
    }
  }, [patientId, accessionNo]);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  const patchForm = (caseId: number, patch: Partial<FormState>) =>
    setFormState(prev => ({ ...prev, [caseId]: { ...prev[caseId], ...patch } }));

  const toggleExpand = (caseId: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(caseId) ? next.delete(caseId) : next.add(caseId);
      return next;
    });

  const handleSave = async (item: SurgicalContextItem) => {
    const caseId = item.nongyne_case.id;
    const fs = formState[caseId];
    if (!fs?.result) return;
    patchForm(caseId, { saving: true });
    try {
      if (item.correlation && fs.editing) {
        await CytoHistoCorrelationService.update(item.correlation.id, {
          histology_diagnosis: fs.histoDx || undefined,
          correlation_result: fs.result,
          comment: fs.comment || undefined,
        });
      } else {
        const isGyne = item.case_type === "gyne";
        await CytoHistoCorrelationService.create({
          case_type: item.case_type as "gyne" | "nongyne",
          nongyne_case_id: isGyne ? undefined : caseId,
          gyne_case_id: isGyne ? caseId : undefined,
          surgical_accession_no: accessionNo,
          surgical_case_id: surgicalCase.id,
          cytology_diagnosis_snapshot: item.cytology_diagnosis ?? undefined,
          histology_diagnosis: fs.histoDx || undefined,
          correlation_result: fs.result,
          comment: fs.comment || undefined,
        });
      }
      message.success("Correlation saved");
      await fetchContext();
      setExpanded(prev => { const n = new Set(prev); n.delete(caseId); return n; });
    } catch (err) {
      logger.error("Save correlation", err);
      message.error("Failed to save");
    } finally {
      patchForm(caseId, { saving: false, editing: false });
    }
  };

  const handleDelete = async (item: SurgicalContextItem) => {
    if (!item.correlation) return;
    try {
      await CytoHistoCorrelationService.delete(item.correlation.id);
      message.success("Correlation removed");
      fetchContext();
    } catch (err) {
      logger.error("Delete correlation", err);
      message.error("Failed to delete");
    }
  };

  const titleNode = (
    <Space>
      <LinkOutlined style={{ color: "#722ed1" }} />
      <Text strong style={{ color: "#722ed1" }}>Cyto-Histo Correlation</Text>
      {!loading && items.length > 0 && (
        <Tag color="purple">{items.length} cytology case{items.length > 1 ? "s" : ""}</Tag>
      )}
    </Space>
  );

  if (loading) return (
    <StyledCard id="cyto-histo-correlation" title={titleNode} size="small">
      <div style={{ textAlign: "center", padding: 24 }}><Spin /></div>
    </StyledCard>
  );

  if (!items.length) return (
    <StyledCard id="cyto-histo-correlation" title={titleNode} size="small">
      <Text type="secondary">No prior Non-Gyne cytology cases for this patient.</Text>
    </StyledCard>
  );

  return (
    <StyledCard id="cyto-histo-correlation" title={titleNode} size="small">
      {items.map((item, idx) => {
        const caseId  = item.nongyne_case.id;
        const fs      = formState[caseId] ?? { result: "agree", histoDx: "", comment: "", saving: false, editing: false };
        const isOpen  = expanded.has(caseId);
        const corr    = item.correlation;
        const isPending = !["published"].includes(item.nongyne_case.status);

        return (
          <div key={caseId}>
            {idx > 0 && <Divider style={{ margin: "12px 0" }} />}

            {/* ── Collapsed header — always visible, click to expand ── */}
            <div
              onClick={() => toggleExpand(caseId)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              <Space wrap style={{ marginBottom: 4 }}>
                <Text strong style={{ color: "#1677ff" }}>{item.nongyne_case.accession_no}</Text>
                <Tag color={item.case_type === "gyne" ? "green" : "orange"} style={{ fontSize: 11 }}>
                  {item.case_type === "gyne" ? "Gyne" : "Non-Gyne"}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  · {item.nongyne_case.specimen_type}
                  {item.nongyne_case.collection_site ? ` — ${item.nongyne_case.collection_site}` : ""}
                  · {dayjs(item.nongyne_case.registered_at).format("DD/MM/YYYY")}
                </Text>
                {isPending && (
                  <Tag color="warning" style={{ fontSize: 11 }}>
                    Cyto: {item.nongyne_case.status.replace(/_/g, " ")}
                  </Tag>
                )}
                {corr && !fs.editing && <ResultTag value={corr.correlation_result} />}
                <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                  {isOpen ? <UpOutlined /> : <DownOutlined />}
                </span>
              </Space>

              {/* Cytology diagnosis — always visible */}
              <div style={{ marginLeft: 2, marginBottom: isOpen ? 12 : 0 }}>
                <Text style={{ fontSize: 10, color: "#722ed1", fontWeight: 700, letterSpacing: 0.5 }}>
                  CYTOLOGY DX
                </Text>
                {item.cytology_diagnosis ? (
                  <div
                    style={{ color: "#1a202c", fontSize: 13, marginTop: 1 }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.cytology_diagnosis) }}
                  />
                ) : (
                  <div style={{ color: "#bfbfbf", fontSize: 13, marginTop: 1 }}>No diagnosis recorded yet</div>
                )}
              </div>
            </div>

            {/* ── Expanded form ── */}
            {isOpen && (
              <div style={{ paddingTop: 12, borderTop: "1px dashed #f0f0f0" }}>

                {/* Already correlated — show read-only + edit/delete */}
                {corr && !fs.editing && (
                  <div style={{ marginBottom: 10 }}>
                    {corr.histology_diagnosis && (
                      <div style={{ marginBottom: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959" }}>HISTO DX  </Text>
                        <Text style={{ whiteSpace: "pre-wrap" }}>{corr.histology_diagnosis}</Text>
                      </div>
                    )}
                    {corr.comment && (
                      <div style={{ marginBottom: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959" }}>COMMENT  </Text>
                        <Text type="secondary">{corr.comment}</Text>
                      </div>
                    )}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {corr.correlated_by?.full_name ?? "—"} · {dayjs(corr.correlated_at).format("DD/MM/YYYY HH:mm")}
                    </Text>
                    {!isLocked && (
                      <Space style={{ marginLeft: 8 }}>
                        <Button size="small" type="link" icon={<EditOutlined />}
                          onClick={(e) => { e.stopPropagation(); patchForm(caseId, { editing: true, result: corr.correlation_result, histoDx: corr.histology_diagnosis ?? "", comment: corr.comment ?? "" }); }}
                        >Edit</Button>
                        <Popconfirm title="Remove this correlation?" onConfirm={() => handleDelete(item)} okText="Remove" cancelText="Cancel">
                          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()}>Delete</Button>
                        </Popconfirm>
                      </Space>
                    )}
                  </div>
                )}

                {/* Form — new or editing */}
                {(!corr || fs.editing) && !isLocked && (
                  <Space direction="vertical" style={{ width: "100%" }} size={8}>
                    <div>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>RESULT</Text>
                      <Radio.Group value={fs.result} onChange={e => patchForm(caseId, { result: e.target.value })} optionType="button" buttonStyle="solid" size="small">
                        {RESULT_OPTIONS.map(o => <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>)}
                      </Radio.Group>
                    </div>
                    <div>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>HISTOLOGY DIAGNOSIS</Text>
                      <Input.TextArea rows={2} value={fs.histoDx} onChange={e => patchForm(caseId, { histoDx: e.target.value })} placeholder="Enter surgical / histology diagnosis..." style={{ resize: "vertical" }} />
                    </div>
                    <div>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>COMMENT (optional)</Text>
                      <Input value={fs.comment} onChange={e => patchForm(caseId, { comment: e.target.value })} placeholder="Optional comment..." />
                    </div>
                    <Space>
                      <Button type="primary" size="small" icon={<SaveOutlined />} loading={fs.saving} onClick={() => handleSave(item)} style={{ background: "#722ed1", borderColor: "#722ed1" }}>
                        Save Correlation
                      </Button>
                      {fs.editing && (
                        <Button size="small" onClick={() => patchForm(caseId, { editing: false })}>Cancel</Button>
                      )}
                    </Space>
                  </Space>
                )}
              </div>
            )}
          </div>
        );
      })}
    </StyledCard>
  );
};

export default CytoHistoCorrelationCard;
