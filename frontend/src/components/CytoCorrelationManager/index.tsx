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
  PlusOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import StyledCard from "../Layout/StyledCard";
import CytoHistoCorrelationService, {
  CorrelationRecord,
} from "../../services/cytoHistoCorrelationService";
import logger from "../../utils/logger";

const { Text } = Typography;

const RESULT_OPTIONS = [
  { value: "agree",             label: "Agree",             color: "green"   },
  { value: "minor_discrepancy", label: "Minor Discrepancy", color: "orange"  },
  { value: "major_discrepancy", label: "Major Discrepancy", color: "red"     },
  { value: "no_follow_up",      label: "No Follow-up",      color: "default" },
];

function ResultTag({ value }: { value: string }) {
  const opt = RESULT_OPTIONS.find((o) => o.value === value);
  if (!opt) return <Tag>{value}</Tag>;
  const icon =
    value === "agree" ? <CheckCircleOutlined /> :
    value.includes("discrepancy") ? <ExclamationCircleOutlined /> : undefined;
  return <Tag color={opt.color} icon={icon}>{opt.label}</Tag>;
}

interface FormState {
  surgicalAccession: string;
  result: string;
  histoDx: string;
  comment: string;
}

const EMPTY_FORM: FormState = {
  surgicalAccession: "",
  result: "agree",
  histoDx: "",
  comment: "",
};

interface Props {
  caseId: number;
  caseType: "gyne" | "nongyne";
  diagnosisSnapshot?: string;
  isLocked: boolean;
}

const CytoCorrelationManager: React.FC<Props> = ({
  caseId,
  caseType,
  diagnosisSnapshot,
  isLocked,
}) => {
  const [items, setItems] = useState<CorrelationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const data =
        caseType === "gyne"
          ? await CytoHistoCorrelationService.getByGyneCase(caseId)
          : await CytoHistoCorrelationService.getByNongyneCase(caseId);
      setItems(data);
    } catch (err) {
      logger.error("CytoCorrelationManager fetch", err);
    } finally {
      setLoading(false);
    }
  }, [caseId, caseType]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (record: CorrelationRecord) => {
    setEditingId(record.id);
    setForm({
      surgicalAccession: record.surgical_accession_no,
      result: record.correlation_result,
      histoDx: record.histology_diagnosis ?? "",
      comment: record.comment ?? "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.surgicalAccession.trim()) {
      message.warning("Please enter the Surgical Accession No.");
      return;
    }
    if (!form.result) {
      message.warning("Please select a correlation result.");
      return;
    }
    setSaving(true);
    try {
      if (editingId !== null) {
        await CytoHistoCorrelationService.update(editingId, {
          correlation_result: form.result,
          histology_diagnosis: form.histoDx || undefined,
          comment: form.comment || undefined,
        });
        message.success("Correlation updated");
      } else {
        await CytoHistoCorrelationService.create({
          case_type: caseType,
          ...(caseType === "gyne"
            ? { gyne_case_id: caseId }
            : { nongyne_case_id: caseId }),
          surgical_accession_no: form.surgicalAccession.trim(),
          correlation_result: form.result,
          histology_diagnosis: form.histoDx || undefined,
          comment: form.comment || undefined,
          cytology_diagnosis_snapshot: diagnosisSnapshot || undefined,
        });
        message.success("Correlation saved");
      }
      cancelForm();
      fetchItems();
    } catch (err) {
      logger.error("Save correlation", err);
      message.error("Failed to save correlation");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await CytoHistoCorrelationService.delete(id);
      message.success("Correlation removed");
      fetchItems();
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
        <Tag color="purple">{items.length} record{items.length > 1 ? "s" : ""}</Tag>
      )}
    </Space>
  );

  const extra = !isLocked ? (
    <Button
      size="small"
      type="dashed"
      icon={<PlusOutlined />}
      onClick={openAdd}
      disabled={showForm}
    >
      Add Correlation
    </Button>
  ) : undefined;

  if (loading) return (
    <StyledCard title={titleNode} size="small" extra={extra}>
      <div style={{ textAlign: "center", padding: 24 }}><Spin /></div>
    </StyledCard>
  );

  return (
    <StyledCard title={titleNode} size="small" extra={extra}>

      {/* Existing records */}
      {items.length === 0 && !showForm && (
        <Text type="secondary">No correlations recorded yet.</Text>
      )}

      {items.map((rec, idx) => {
        const isOpen = expanded.has(rec.id);
        return (
          <div key={rec.id}>
            {idx > 0 && <Divider style={{ margin: "10px 0" }} />}

            <div
              onClick={() => toggleExpand(rec.id)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              <Space wrap style={{ marginBottom: 2 }}>
                <Text strong style={{ color: "#1677ff" }}>
                  {rec.surgical_accession_no}
                </Text>
                <ResultTag value={rec.correlation_result} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {rec.correlated_by?.full_name ?? "—"} · {dayjs(rec.correlated_at).format("DD/MM/YYYY")}
                </Text>
                <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                  {isOpen ? <UpOutlined /> : <DownOutlined />}
                </span>
              </Space>
            </div>

            {isOpen && (
              <div style={{ paddingTop: 8, paddingLeft: 2 }}>
                {rec.histology_diagnosis && (
                  <div style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959" }}>HISTO DX </Text>
                    <Text style={{ whiteSpace: "pre-wrap" }}>{rec.histology_diagnosis}</Text>
                  </div>
                )}
                {rec.comment && (
                  <div style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959" }}>COMMENT </Text>
                    <Text type="secondary">{rec.comment}</Text>
                  </div>
                )}
                {!isLocked && (
                  <Space style={{ marginTop: 4 }}>
                    <Button
                      size="small" type="link" icon={<EditOutlined />}
                      onClick={(e) => { e.stopPropagation(); openEdit(rec); }}
                    >Edit</Button>
                    <Popconfirm
                      title="Remove this correlation?"
                      onConfirm={() => handleDelete(rec.id)}
                      okText="Remove" cancelText="Cancel" okType="danger"
                    >
                      <Button
                        size="small" type="link" danger icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      >Delete</Button>
                    </Popconfirm>
                  </Space>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add / Edit form */}
      {showForm && (
        <>
          {items.length > 0 && <Divider style={{ margin: "12px 0" }} />}
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            {editingId === null && (
              <div>
                <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>
                  SURGICAL ACCESSION NO. *
                </Text>
                <Input
                  placeholder="e.g. S26-00123"
                  value={form.surgicalAccession}
                  onChange={(e) => setForm((f) => ({ ...f, surgicalAccession: e.target.value }))}
                  style={{ width: 220 }}
                />
              </div>
            )}
            <div>
              <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>
                RESULT *
              </Text>
              <Radio.Group
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                {RESULT_OPTIONS.map((o) => (
                  <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>
                ))}
              </Radio.Group>
            </div>
            <div>
              <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>
                HISTOLOGY DIAGNOSIS
              </Text>
              <Input.TextArea
                rows={2}
                value={form.histoDx}
                onChange={(e) => setForm((f) => ({ ...f, histoDx: e.target.value }))}
                placeholder="Enter surgical / histology diagnosis..."
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <Text style={{ fontSize: 10, fontWeight: 700, color: "#595959", display: "block", marginBottom: 4 }}>
                COMMENT (optional)
              </Text>
              <Input
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                placeholder="Optional comment..."
              />
            </div>
            <Space>
              <Button
                type="primary" size="small" icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
                style={{ background: "#722ed1", borderColor: "#722ed1" }}
              >
                {editingId !== null ? "Update" : "Save Correlation"}
              </Button>
              <Button size="small" onClick={cancelForm}>Cancel</Button>
            </Space>
          </Space>
        </>
      )}
    </StyledCard>
  );
};

export default CytoCorrelationManager;
