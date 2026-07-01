import React, { useState, useEffect, useCallback } from "react";
import {
  Tag,
  Typography,
  Space,
  Descriptions,
  Divider,
  Input,
  App,
  Button,
  Tooltip,
  Modal,
} from "antd";
import {
  UserOutlined,
  MedicineBoxOutlined,
  IdcardOutlined,
  ManOutlined,
  WomanOutlined,
  QuestionOutlined,
  RightOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  EyeOutlined,
  LoadingOutlined,
  EditOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { SurgicalCase, RequestFile } from "../../types/surgical";
import StyledCard from "../Layout/StyledCard";
import PatientService from "../../services/patientService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import CytoHistoCorrelationService, {
  CorrelationRecord,
  CorrelationCreatePayload,
} from "../../services/cytoHistoCorrelationService";
import SurgicalCaseCorrelationService from "../../services/surgicalCaseCorrelationService";
import logger from "../../utils/logger";
import MarkCorrelationModal, { MarkSaveValues } from "./MarkCorrelationModal";
import PatientHistorySection from "./PatientHistorySection";
import { ActiveCaseType, MarkTarget } from "./types";
import type { GyneCytoHistoryItem, NongyneCytoHistoryItem } from "../../services/patientService";

const { Text } = Typography;

const copyText = (text: string) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for HTTP (non-secure context)
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
};

interface PatientInfoCardProps {
  activeCase: SurgicalCase | null;
  isExpanded: boolean;
  onToggle: (state: boolean) => void;
  activeCaseType?: ActiveCaseType;
  activeCaseId?: number;
  hideMarkRelated?: boolean;
  onCaseUpdate?: (updatedCase: SurgicalCase) => void;
}

const PatientInfoCard: React.FC<PatientInfoCardProps> = ({
  activeCase,
  isExpanded,
  onToggle,
  activeCaseType,
  activeCaseId,
  hideMarkRelated = false,
  onCaseUpdate,
}) => {
  const { message } = App.useApp();
  const p = activeCase?.patient;

  // --- Surgical history ---
  const [history, setHistory] = useState<SurgicalCase[]>([]);
  const [loading, setLoading] = useState(false);

  // --- Cyto history ---
  const [gyneHistory, setGyneHistory] = useState<GyneCytoHistoryItem[]>([]);
  const [gyneLoading, setGyneLoading] = useState(false);
  const [nongyneHistory, setNongyneHistory] = useState<NongyneCytoHistoryItem[]>([]);
  const [nongyneLoading, setNongyneLoading] = useState(false);

  // --- Correlation ---
  const [corrMap, setCorrMap] = useState<Record<string, number>>({});
  const [markOpen, setMarkOpen] = useState(false);
  const [markTarget, setMarkTarget] = useState<MarkTarget | null>(null);

  // --- Clinician inline edit ---
  const [editingClinician, setEditingClinician] = useState(false);
  const [clinicianValue, setClinicianValue] = useState("");
  const [clinicianSaving, setClinicianSaving] = useState(false);

  // --- Preview ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setEditingClinician(false);
  }, [activeCase?.id]);

  // Load patient history when expanded
  useEffect(() => {
    if (!p?.id || !isExpanded) return;

    setLoading(true);
    PatientService.getPatientHistory(p.id)
      .then((cases) => setHistory(cases.filter((c: SurgicalCase) => c.id !== activeCase?.id)))
      .catch((err) => logger.error(err))
      .finally(() => setLoading(false));

    setGyneLoading(true);
    PatientService.getGyneCytoHistory(p.id)
      .then(setGyneHistory)
      .catch((err) => logger.error(err))
      .finally(() => setGyneLoading(false));

    setNongyneLoading(true);
    PatientService.getNongyneCytoHistory(p.id)
      .then(setNongyneHistory)
      .catch((err) => logger.error(err))
      .finally(() => setNongyneLoading(false));
  }, [p?.id, activeCase?.id, isExpanded]);

  // Build corrMap from history or load via API
  useEffect(() => {
    if (!isExpanded) return;
    if (activeCaseType === "surgical") {
      const map: Record<string, number> = {};
      gyneHistory.forEach((item) => {
        if (item.has_correlation && item.correlation_id) map[`gyne-${item.id}`] = item.correlation_id;
      });
      nongyneHistory.forEach((item) => {
        if (item.has_correlation && item.correlation_id) map[`nongyne-${item.id}`] = item.correlation_id;
      });
      setCorrMap(map);
      if (activeCase?.id) {
        SurgicalCaseCorrelationService.getByCase(activeCase.id)
          .then((corrs) => {
            setCorrMap((prev) => {
              const updated = { ...prev };
              corrs.forEach((c) => {
                const otherId = c.from_case_id === activeCase!.id ? c.to_case_id : c.from_case_id;
                updated[`surg_surg-${otherId}`] = c.id;
              });
              return updated;
            });
          })
          .catch((err) => logger.error(err));
      }
    } else if (activeCaseType === "gyne" && activeCaseId) {
      CytoHistoCorrelationService.getByGyneCase(activeCaseId)
        .then((corrs) => {
          const map: Record<string, number> = {};
          corrs.forEach((c) => { map[`surgical-${c.surgical_accession_no}`] = c.id; });
          setCorrMap(map);
        })
        .catch((err) => logger.error(err));
    } else if (activeCaseType === "nongyne" && activeCaseId) {
      CytoHistoCorrelationService.getByNongyneCase(activeCaseId)
        .then((corrs) => {
          const map: Record<string, number> = {};
          corrs.forEach((c) => { map[`surgical-${c.surgical_accession_no}`] = c.id; });
          setCorrMap(map);
        })
        .catch((err) => logger.error(err));
    }
  }, [isExpanded, activeCaseType, activeCaseId, gyneHistory, nongyneHistory]);

  const openMarkModal = (rowCaseId: number, rowAccession: string, rowCaseType: MarkTarget["rowCaseType"]) => {
    setMarkTarget({ rowCaseId, rowAccession, rowCaseType });
    setMarkOpen(true);
  };

  const handleMarkSave = async ({ result: markResult, histoDx: markHistoDx, comment: markComment }: MarkSaveValues) => {
    if (!markTarget) return;
    const isSurgSurg = markTarget.rowCaseType === "surgical" && activeCaseType === "surgical";
    const corrKey = isSurgSurg
      ? `surg_surg-${markTarget.rowCaseId}`
      : markTarget.rowCaseType === "surgical"
      ? `surgical-${markTarget.rowAccession}`
      : `${markTarget.rowCaseType}-${markTarget.rowCaseId}`;
    const existingCorrId = corrMap[corrKey];

    let savedId: number;
    if (isSurgSurg) {
      if (existingCorrId) {
        const result = await SurgicalCaseCorrelationService.update(existingCorrId, {
          correlation_result: markResult,
          comment: markComment || undefined,
        });
        savedId = result.id;
      } else {
        const result = await SurgicalCaseCorrelationService.create({
          from_case_id: activeCase!.id,
          to_case_id: markTarget.rowCaseId,
          from_accession_no: activeCase!.accession_no,
          to_accession_no: markTarget.rowAccession,
          correlation_result: markResult,
          comment: markComment || undefined,
        });
        savedId = result.id;
      }
    } else {
      let saved: CorrelationRecord;
      if (existingCorrId) {
        saved = await CytoHistoCorrelationService.update(existingCorrId, {
          histology_diagnosis: markHistoDx || undefined,
          correlation_result: markResult,
          comment: markComment || undefined,
        });
      } else {
        let payload: CorrelationCreatePayload;
        if (markTarget.rowCaseType === "gyne") {
          payload = {
            case_type: "gyne",
            gyne_case_id: markTarget.rowCaseId,
            surgical_accession_no: activeCase!.accession_no,
            surgical_case_id: activeCase!.id,
            histology_diagnosis: markHistoDx || undefined,
            correlation_result: markResult,
            comment: markComment || undefined,
          };
        } else if (markTarget.rowCaseType === "nongyne") {
          payload = {
            case_type: "nongyne",
            nongyne_case_id: markTarget.rowCaseId,
            surgical_accession_no: activeCase!.accession_no,
            surgical_case_id: activeCase!.id,
            histology_diagnosis: markHistoDx || undefined,
            correlation_result: markResult,
            comment: markComment || undefined,
          };
        } else {
          payload = {
            case_type: activeCaseType as "gyne" | "nongyne",
            gyne_case_id: activeCaseType === "gyne" ? activeCaseId : undefined,
            nongyne_case_id: activeCaseType === "nongyne" ? activeCaseId : undefined,
            surgical_accession_no: markTarget.rowAccession,
            histology_diagnosis: markHistoDx || undefined,
            correlation_result: markResult,
            comment: markComment || undefined,
          };
        }
        saved = await CytoHistoCorrelationService.create(payload);
      }
      savedId = saved!.id;
    }
    setCorrMap((prev) => ({ ...prev, [corrKey]: savedId }));
    message.success("Correlation saved");
    setMarkOpen(false);
  };

  const openPdfPreview = useCallback(async (
    fetchFn: () => Promise<Blob>,
    loadingTitle: string,
    displayTitle: string,
  ) => {
    setPreviewLoading(true);
    setPreviewTitle(loadingTitle);
    try {
      const blob = await fetchFn();
      const url = window.URL.createObjectURL(blob);
      setPreviewImage(url);
      setPreviewTitle(displayTitle);
      setPreviewOpen(true);
    } catch {
      message.error("Cannot open PDF");
    } finally {
      setPreviewLoading(false);
    }
  }, [message]);

  const handlePreviewFile = (fileId: number, fileName: string) => {
    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    openPdfPreview(
      async () => {
        const response = await SurgicalCaseService.downloadRequestFileBlob(fileId);
        return new Blob([response], { type: isPdf ? "application/pdf" : "image/jpeg" });
      },
      fileName,
      fileName,
    );
  };

  const startEditClinician = (e: React.MouseEvent) => {
    e.stopPropagation();
    setClinicianValue(activeCase?.clinician_name || "");
    setEditingClinician(true);
  };

  const saveClinician = useCallback(async () => {
    if (!activeCase?.id || clinicianSaving) return;
    setClinicianSaving(true);
    try {
      const updated = await SurgicalCaseService.updateCase(activeCase.id, { clinician_name: clinicianValue });
      onCaseUpdate?.(updated);
      message.success("Clinician updated");
      setEditingClinician(false);
    } catch (err) {
      logger.error(err);
      message.error("Failed to update clinician");
    } finally {
      setClinicianSaving(false);
    }
  }, [activeCase?.id, clinicianValue, clinicianSaving, onCaseUpdate, message]);

  const renderGenderIcon = (gender?: string) => {
    const g = gender?.toLowerCase();
    if (g === "male" || g === "ชาย") return <ManOutlined style={{ color: "#1890ff" }} />;
    if (g === "female" || g === "หญิง") return <WomanOutlined style={{ color: "#eb2f96" }} />;
    return <QuestionOutlined style={{ color: "#8c8c8c" }} />;
  };

  return (
    <StyledCard size="small" bodyStyle={{ padding: "12px 16px" }}>

      {/* Collapsed header row */}
      <div
        onClick={() => onToggle(!isExpanded)}
        style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}
      >
        <RightOutlined
          rotate={isExpanded ? 90 : 0}
          style={{ fontSize: "12px", marginRight: 12, color: "#bfbfbf", transition: "transform 0.3s" }}
        />
        <Space
          size="middle"
          split={<Divider type="vertical" style={{ height: "1.2em", borderColor: "#f0f0f0" }} />}
          wrap
        >
          <Space>
            <MedicineBoxOutlined style={{ color: "#1890ff" }} />
            <Text strong style={{ color: "#1890ff", fontSize: "15px" }}>{activeCase?.accession_no}</Text>
            <Text type="secondary" style={{ fontSize: "12px" }}>(HN: {activeCase?.hn})</Text>
            {activeCase?.hn && (
              <Tooltip title="Copy HN">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  style={{ color: "#bfbfbf", padding: "0 2px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(activeCase.hn);
                    message.success("Copied HN: " + activeCase.hn);
                  }}
                />
              </Tooltip>
            )}
          </Space>
          <Space>
            <UserOutlined style={{ color: "#595959" }} />
            <Text strong>{[p?.title?.title, p?.name, p?.ln].filter(Boolean).join(" ")}</Text>
            {p && (
              <Tooltip title="Copy name">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  style={{ color: "#bfbfbf", padding: "0 2px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const fullName = [p.title?.title, p.name, p.ln].filter(Boolean).join(" ");
                    copyText(fullName);
                    message.success("Copied: " + fullName);
                  }}
                />
              </Tooltip>
            )}
          </Space>
          <Space size="small">
            <Tag
              color={
                p?.gender?.toLowerCase() === "female" || p?.gender === "หญิง" ? "magenta"
                  : p?.gender?.toLowerCase() === "male" || p?.gender === "ชาย" ? "blue"
                  : "default"
              }
              bordered={false}
              icon={renderGenderIcon(p?.gender)}
              style={{ borderRadius: "4px", fontWeight: 500 }}
            >
              {p?.gender || "N/A"}
            </Tag>
            <Text strong>
              {p?.birth_date
                ? `${dayjs(p.birth_date).format("DD/MM/YYYY")} (${dayjs().diff(dayjs(p.birth_date), "year")} y/o)`
                : "No DOB"}
            </Text>
          </Space>
          {p?.cid && (
            <Space size="small">
              <IdcardOutlined style={{ color: "#8c8c8c" }} />
              <Text type="secondary" style={{ fontSize: "13px" }}>
                CID: <Text style={{ color: "#595959" }}>{p.cid}</Text>
              </Text>
            </Space>
          )}
          <Space size="small">
            <ClockCircleOutlined style={{ color: "#8c8c8c" }} />
            <Text type="secondary" style={{ fontSize: "13px" }}>
              Reg:{" "}
              <Text style={{ color: "#595959" }}>
                {activeCase?.registered_at ? dayjs(activeCase.registered_at).format("DD/MM/YYYY HH:mm") : "-"}
              </Text>
            </Text>
          </Space>
          {activeCase?.is_express && (
            <Tag color="red" style={{ fontWeight: "bold", border: "none" }}>URGENT</Tag>
          )}
        </Space>
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid #f5f5f5", paddingTop: 12 }}>
          <Descriptions
            size="small"
            column={{ xxl: 4, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}
            bordered
            labelStyle={{ background: "#fafafa", fontWeight: 500, width: "130px" }}
          >
            <Descriptions.Item label="Lab No">{activeCase?.lab_number || "-"}</Descriptions.Item>
            <Descriptions.Item label="Hospital">{activeCase?.hospital?.name || "-"}</Descriptions.Item>
            <Descriptions.Item label="Clinician">
              {editingClinician ? (
                <Input
                  size="small"
                  value={clinicianValue}
                  onChange={(e) => setClinicianValue(e.target.value)}
                  onPressEnter={saveClinician}
                  onKeyDown={(e) => e.key === "Escape" && setEditingClinician(false)}
                  disabled={clinicianSaving}
                  suffix={clinicianSaving ? <LoadingOutlined /> : null}
                  autoFocus
                  style={{ width: 200 }}
                />
              ) : (
                <Space size={4}>
                  <Text>{activeCase?.clinician_name || "-"}</Text>
                  <Tooltip title="Edit clinician">
                    <Button type="text" size="small" icon={<EditOutlined />}
                      onClick={startEditClinician} style={{ padding: "0 2px" }} />
                  </Tooltip>
                </Space>
              )}
            </Descriptions.Item>
          </Descriptions>

          {/* Request Documents */}
          {activeCase?.request_files && activeCase.request_files.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Divider style={{ margin: "0 0 12px 0" }} titlePlacement="left">Request Documents</Divider>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {activeCase.request_files.map((file: RequestFile) => {
                  const isPdf = file.file_name?.toLowerCase().endsWith(".pdf");
                  return (
                    <div
                      key={file.id}
                      style={{
                        display: "flex", alignItems: "center",
                        border: "1px solid #d9d9d9", borderRadius: 6,
                        padding: "4px 8px", background: "#fff",
                      }}
                    >
                      <Space>
                        {isPdf
                          ? <FilePdfOutlined style={{ color: "#ff4d4f" }} />
                          : <FileImageOutlined style={{ color: "#1890ff" }} />}
                        <Text style={{ fontSize: "13px" }}>{file.file_name}</Text>
                        <Tooltip title="Preview">
                          <Button
                            type="text" size="small" icon={<EyeOutlined />}
                            loading={previewLoading && previewTitle === file.file_name}
                            onClick={() => handlePreviewFile(file.id, file.file_name)}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Patient History Tables */}
          <PatientHistorySection
            history={history}
            loading={loading}
            gyneHistory={gyneHistory}
            gyneLoading={gyneLoading}
            nongyneHistory={nongyneHistory}
            nongyneLoading={nongyneLoading}
            corrMap={corrMap}
            openMarkModal={openMarkModal}
            activeCaseType={activeCaseType}
            hideMarkRelated={hideMarkRelated}
            previewLoading={previewLoading}
            previewTitle={previewTitle}
            openPdfPreview={openPdfPreview}
          />
        </div>
      )}

      {/* Correlation Modal */}
      <MarkCorrelationModal
        open={markOpen}
        onClose={() => setMarkOpen(false)}
        onSave={handleMarkSave}
        markTarget={markTarget}
        activeCaseType={activeCaseType}
        activeCase={activeCase}
      />

      {/* Preview Modal */}
      <Modal
        open={previewOpen}
        title={previewTitle}
        footer={null}
        onCancel={() => {
          setPreviewOpen(false);
          if (previewImage) window.URL.revokeObjectURL(previewImage);
          setPreviewImage("");
        }}
        width={800}
        centered
      >
        {previewTitle?.toLowerCase().endsWith(".pdf") || previewTitle?.startsWith("Report ") ? (
          <iframe src={previewImage} title={previewTitle} style={{ width: "100%", height: "70vh", border: "none" }} />
        ) : (
          <img alt={previewTitle} style={{ width: "100%" }} src={previewImage} />
        )}
      </Modal>
    </StyledCard>
  );
};

export default PatientInfoCard;
