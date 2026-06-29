import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Card,
  Button,
  Input,
  Form,
  Space,
  Tag,
  Typography,
  Alert,
  Divider,
  message,
  Row,
  Col,
  Radio,
  Select,
  Checkbox,
} from "antd";
import {
  BarcodeOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  UnorderedListOutlined,
  ExperimentOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import PageContainer from "../../components/Layout/PageContainer";
import SlideBlockReleaseService, {
  SlideBlockReleaseCreatePayload,
} from "../../services/slideBlockReleaseService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import NongyneCytoCaseService from "../../services/nongyneCytoCaseService";
import UserService from "../../services/userService";
import SystemSettingService from "../../services/systemSettingService";
import { useAuth } from "../../hooks/useAuth";
import type { User } from "../../types/user";
import ManualSelectModal from "./ManualSelectModal";

const { Text, Title } = Typography;

interface StainInfo {
  name: string;
  status: string;
}

interface BlockInfo {
  block_code: string;
  stains: StainInfo[];
}

interface SpecimenInfo {
  specimen_label: string;
  specimen_name?: string;
  blocks: BlockInfo[];
}

interface VerifiedCase {
  id: number;
  accession_no: string;
  patient_name: string;
  patient_cid?: string;
  case_type: "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO";
  is_slide_released: boolean;
  is_block_released: boolean;
  specimens: SpecimenInfo[];
  stains: StainInfo[];
}

interface Props {
  onBack: () => void;
  onSuccess: () => void;
}

const CASE_TYPE_LABEL: Record<string, string> = {
  SURGICAL: "Surgical",
  GYNE_CYTO: "Gyne Cytology",
  NONGYNE_CYTO: "Non-Gyne Cytology",
};

const CASE_TYPE_COLOR: Record<string, string> = {
  SURGICAL: "blue",
  GYNE_CYTO: "pink",
  NONGYNE_CYTO: "purple",
};

const RELEASE_TYPE_COLOR: Record<string, string> = {
  SLIDE: "cyan",
  BLOCK: "orange",
  BOTH: "green",
};

// ─── Helper: classify stains from specimens ───────────────────────────────────
function classifyStains(verifiedCase: VerifiedCase, releaseType: string) {
  const showBlocks =
    (releaseType === "BLOCK" || releaseType === "BOTH") &&
    verifiedCase.case_type === "SURGICAL";
  const showSlides = releaseType === "SLIDE" || releaseType === "BOTH";

  const blockCodes: string[] = [];
  const heCodes: string[] = [];
  const specialCodes: string[] = [];
  const specialNames: string[] = [];

  if (verifiedCase.case_type === "SURGICAL") {
    for (const spec of verifiedCase.specimens) {
      for (const block of spec.blocks) {
        blockCodes.push(block.block_code);
        for (const stain of block.stains) {
          const up = stain.name.toUpperCase().replace(/\s/g, "");
          if (up === "H&E" || up === "HE") {
            if (!heCodes.includes(block.block_code)) heCodes.push(block.block_code);
          } else if (stain.name) {
            if (!specialCodes.includes(block.block_code))
              specialCodes.push(block.block_code);
            if (!specialNames.includes(stain.name)) specialNames.push(stain.name);
          }
        }
      }
    }
  }

  const cytoCodes =
    showSlides && verifiedCase.case_type !== "SURGICAL"
      ? [verifiedCase.accession_no]
      : [];
  const cytoCount =
    showSlides && verifiedCase.case_type !== "SURGICAL"
      ? verifiedCase.stains.length
      : 0;

  return {
    blockNos: showBlocks ? blockCodes.join(", ") : "",
    blockCount: showBlocks ? blockCodes.length : 0,
    heNos: showSlides && verifiedCase.case_type === "SURGICAL" ? heCodes.join(", ") : "",
    heCount: showSlides && verifiedCase.case_type === "SURGICAL" ? heCodes.length : 0,
    specialNos: showSlides && verifiedCase.case_type === "SURGICAL" ? specialCodes.join(", ") : "",
    specialCount: showSlides && verifiedCase.case_type === "SURGICAL" ? specialCodes.length : 0,
    specialNames: specialNames.join(", "),
    cytoNos: cytoCodes.join(", "),
    cytoCount,
  };
}

// ─── Underline field (read-only filled value) ────────────────────────────────
const FilledLine: React.FC<{ value: string; minWidth?: number }> = ({
  value,
  minWidth = 150,
}) => (
  <span
    style={{
      display: "inline-block",
      borderBottom: "1px solid #333",
      minWidth,
      padding: "0 4px",
      fontWeight: 600,
      color: "#1a1a1a",
      lineHeight: "22px",
    }}
  >
    {value || " "}
  </span>
);

// ─── Blank line (empty, for display parity) ──────────────────────────────────
const BlankLine: React.FC<{ minWidth?: number }> = ({ minWidth = 150 }) => (
  <span
    style={{
      display: "inline-block",
      borderBottom: "1px solid #aaa",
      minWidth,
      lineHeight: "22px",
    }}
  />
);

const CreateReleaseForm: React.FC<Props> = ({ onBack, onSuccess }) => {
  const { user } = useAuth();
  const currentUserName = user?.full_name || user?.username || "";

  const [barcodeInput, setBarcodeInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifiedCase, setVerifiedCase] = useState<VerifiedCase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const inputRef = useRef<InputRef>(null);

  // Manual select state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [reportedCases, setReportedCases] = useState<VerifiedCase[]>([]);

  // Pathologist list
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [labNameTh, setLabNameTh] = useState("ห้องปฏิบัติการพยาธิวิทยา");

  const releaseType = Form.useWatch("release_type", form) as string | undefined;
  const [includeSpecialStains, setIncludeSpecialStains] = useState(true);

  const summary = useMemo(() => {
    if (!verifiedCase || !releaseType) return null;
    const base = classifyStains(verifiedCase, releaseType);
    if (!includeSpecialStains) {
      return { ...base, specialNos: "", specialCount: 0, specialNames: "" };
    }
    return base;
  }, [verifiedCase, releaseType, includeSpecialStains]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
    UserService.getUsers({ role: "pathologist", limit: 100 }).then(setPathologists).catch(() => {});
    SystemSettingService.getSettings().then((s) => { if (s.lab_name_th) setLabNameTh(s.lab_name_th); }).catch(() => {});
  }, []);

  const runVerify = async (accNo: string) => {
    setVerifying(true);
    setVerifiedCase(null);
    form.resetFields();
    try {
      const res = await SlideBlockReleaseService.verifyAccession(accNo);
      setVerifiedCase(res);
      form.setFieldsValue({ release_type: "SLIDE" });
      setIncludeSpecialStains(true);
    } catch (err: any) {
      message.error(
        err.response?.data?.detail ||
          "Case not found or report has not been finalized"
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const accNo = barcodeInput.trim().toUpperCase();
    if (!accNo) return;
    await runVerify(accNo);
    setBarcodeInput("");
    inputRef.current?.focus();
  };

  const loadReportedCases = async () => {
    setModalLoading(true);
    try {
      const [surgRes, gyneRes, nongyneRes] = await Promise.all([
        SurgicalCaseService.getCases({ limit: 300, is_reported: true }),
        GyneCytologyCaseService.getAll({ limit: 300, is_reported: true }),
        NongyneCytoCaseService.getAll({ limit: 300, is_reported: true }),
      ]);
      const surgical = (surgRes.items ?? []).map((c) => ({
        ...c,
        case_type: "SURGICAL" as const,
      }));
      const gyne = (gyneRes.items ?? []).map((c) => ({
        ...c,
        case_type: "GYNE_CYTO" as const,
      }));
      const nongyne = (nongyneRes.items ?? []).map((c) => ({
        ...c,
        case_type: "NONGYNE_CYTO" as const,
      }));
      setReportedCases([...surgical, ...gyne, ...nongyne] as unknown as VerifiedCase[]);
    } catch {
      message.error("Failed to load case list");
    } finally {
      setModalLoading(false);
    }
  };

  const handleOpenModal = () => {
    setModalOpen(true);
    loadReportedCases();
  };

  const handleModalOk = async (selected: VerifiedCase) => {
    setModalOpen(false);
    await runVerify(selected.accession_no);
    inputRef.current?.focus();
  };

  const handleSubmit = async (values: any) => {
    if (!verifiedCase) return;
    setSubmitting(true);
    try {
      const selectedPathologist = pathologists.find(
        (p) => p.id === values.pathologist_id
      );
      const payload: SlideBlockReleaseCreatePayload = {
        case_id: verifiedCase.id,
        case_type: verifiedCase.case_type,
        release_type: values.release_type,
        recipient_name: values.recipient_name.trim(),
        requester_name: values.requester_name?.trim() || undefined,
        reference_doc_no: values.reference_doc_no?.trim() || undefined,
        remark: values.remark?.trim() || undefined,
        pathologist_id: values.pathologist_id || undefined,
        pathologist_name: selectedPathologist
          ? selectedPathologist.full_name || selectedPathologist.username
          : undefined,
      };
      const res = await SlideBlockReleaseService.create(payload);
      message.success(`Release ${res.release_no} recorded successfully`);
      onSuccess();
    } catch (err: any) {
      message.error(
        err.response?.data?.detail || "Failed to save release record"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const releaseTypeOptions =
    verifiedCase?.case_type === "SURGICAL"
      ? [
          { label: "Slide only", value: "SLIDE" },
          { label: "Block only", value: "BLOCK" },
          { label: "Slide + Block", value: "BOTH" },
        ]
      : [{ label: "Slide", value: "SLIDE" }];

  // ─── Styles for the document panel ─────────────────────────────────────────
  const docLine: React.CSSProperties = {
    fontSize: 14,
    lineHeight: "2",
    marginBottom: 2,
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 13,
    color: "#555",
    minWidth: 240,
    display: "inline-block",
  };

  const countBox: React.CSSProperties = {
    display: "inline-block",
    borderBottom: "1px solid #333",
    minWidth: 50,
    textAlign: "center",
    fontWeight: 600,
    padding: "0 4px",
  };

  return (
    <PageContainer
      withCard
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack} />
          <Title level={4} style={{ margin: 0 }}>
            Record Slide / Block Release
          </Title>
        </Space>
      }
    >
      <Row gutter={[24, 24]}>
        {/* ═══ Left: Scan + Case Info ═══════════════════════════════════════ */}
        <Col xs={24} lg={10}>
          <Card bordered={false} style={{ background: "#fafafa" }}>
            <Title level={5}>
              <BarcodeOutlined /> Scan Accession No.
            </Title>
            <form onSubmit={handleScan}>
              <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
                <Input
                  ref={inputRef}
                  size="large"
                  placeholder="Scan barcode (e.g. S26-00001)"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onPressEnter={handleScan}
                  allowClear
                  style={{ fontSize: 16, border: "2px solid #1890ff" }}
                />
                <Button
                  size="large"
                  icon={<UnorderedListOutlined />}
                  onClick={handleOpenModal}
                  title="Manual select"
                />
              </Space.Compact>
              <Button
                type="primary"
                htmlType="submit"
                loading={verifying}
                block
                size="large"
              >
                Verify
              </Button>
            </form>

            {verifiedCase && (
              <>
                <Divider />
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message={
                    <Space direction="vertical" size={2}>
                      <Text strong style={{ fontSize: 16 }}>
                        {verifiedCase.accession_no}
                      </Text>
                      <Text>{verifiedCase.patient_name}</Text>
                      <Tag color={CASE_TYPE_COLOR[verifiedCase.case_type]}>
                        {CASE_TYPE_LABEL[verifiedCase.case_type]}
                      </Tag>
                    </Space>
                  }
                />

                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">Current release status:</Text>
                  <Space
                    style={{ marginTop: 4, display: "flex", flexWrap: "wrap" }}
                  >
                    <Tag
                      color={
                        verifiedCase.is_slide_released
                          ? RELEASE_TYPE_COLOR.SLIDE
                          : "default"
                      }
                    >
                      Slide:{" "}
                      {verifiedCase.is_slide_released
                        ? "Released"
                        : "Not released"}
                    </Tag>
                    {verifiedCase.case_type === "SURGICAL" && (
                      <Tag
                        color={
                          verifiedCase.is_block_released
                            ? RELEASE_TYPE_COLOR.BLOCK
                            : "default"
                        }
                      >
                        Block:{" "}
                        {verifiedCase.is_block_released
                          ? "Released"
                          : "Not released"}
                      </Tag>
                    )}
                  </Space>
                </div>

                {/* Physical materials */}
                {verifiedCase.case_type === "SURGICAL" &&
                  verifiedCase.specimens.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">
                        <ExperimentOutlined /> Specimens &amp; Blocks
                      </Text>
                      {verifiedCase.specimens.map((spec) => (
                        <div
                          key={spec.specimen_label}
                          style={{
                            marginTop: 8,
                            padding: "8px 10px",
                            background: "#f0f5ff",
                            borderRadius: 6,
                          }}
                        >
                          <Text strong>
                            {spec.specimen_label}
                            {spec.specimen_name
                              ? ` — ${spec.specimen_name}`
                              : ""}
                          </Text>
                          {spec.blocks.map((block) => (
                            <div
                              key={block.block_code}
                              style={{ marginTop: 4, paddingLeft: 8 }}
                            >
                              <Tag color="blue" style={{ marginBottom: 2 }}>
                                {block.block_code}
                              </Tag>
                              {block.stains.map((stain, i) => (
                                <Tag
                                  key={i}
                                  color={
                                    stain.status === "COMPLETED"
                                      ? "green"
                                      : "default"
                                  }
                                  style={{ marginBottom: 2 }}
                                >
                                  {stain.name}
                                </Tag>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                {(verifiedCase.case_type === "GYNE_CYTO" ||
                  verifiedCase.case_type === "NONGYNE_CYTO") &&
                  verifiedCase.stains.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">
                        <ExperimentOutlined /> Slides
                      </Text>
                      <div style={{ marginTop: 6, paddingLeft: 4 }}>
                        {verifiedCase.stains.map((stain, i) => (
                          <Tag
                            key={i}
                            color={
                              stain.status === "COMPLETED" ? "green" : "default"
                            }
                            style={{ marginBottom: 4 }}
                          >
                            {stain.name}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
              </>
            )}
          </Card>
        </Col>

        {/* ═══ Right: Document Form ══════════════════════════════════════════ */}
        <Col xs={24} lg={14}>
          <Card
            bordered
            style={{
              opacity: verifiedCase ? 1 : 0.4,
              pointerEvents: verifiedCase ? "auto" : "none",
              fontFamily: "inherit",
            }}
            styles={{ body: { padding: "20px 28px" } }}
          >
            {/* Document title */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Text strong style={{ fontSize: 16 }}>
                แบบฟอร์มขอพาราฟินบล็อกและ/หรือสไลด์ (External)
              </Text>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              disabled={!verifiedCase}
            >
              {/* ── Release type selector (hidden label, styled inline) ── */}
              <Form.Item
                name="release_type"
                rules={[{ required: true, message: "Please select a release type" }]}
                style={{ marginBottom: 12 }}
              >
                <Radio.Group optionType="button" buttonStyle="solid">
                  {releaseTypeOptions.map((opt) => (
                    <Radio.Button key={opt.value} value={opt.value}>
                      {opt.label}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>

              <Divider style={{ margin: "8px 0 14px" }} />

              {/* เรียน */}
              <div style={docLine}>เรียน แพทย์/ผู้ที่เกี่ยวข้อง</div>

              {/* Patient */}
              <div style={docLine}>
                เนื่องจาก&nbsp;
                <FilledLine
                  value={verifiedCase?.patient_name ?? ""}
                  minWidth={180}
                />
                &nbsp;เลขบัตรประชาชน&nbsp;
                <FilledLine
                  value={verifiedCase?.patient_cid ?? ""}
                  minWidth={160}
                />
              </div>
              <div style={docLine}>
                ได้ขอพาราฟินบล็อกและหรือสไลด์ จาก{labNameTh}
                โดยมีวัตถุประสงค์ เพื่อ
              </div>

              {/* Purpose / remark */}
              <Form.Item name="remark" style={{ marginBottom: 10 }}>
                <Input.TextArea
                  rows={2}
                  placeholder="ระบุวัตถุประสงค์ เช่น ทำการรักษาต่อ (optional)"
                  maxLength={500}
                  style={{ borderTop: "none", borderLeft: "none", borderRight: "none", borderRadius: 0, background: "transparent", resize: "none" }}
                />
              </Form.Item>

              <Divider style={{ margin: "4px 0 12px" }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ดังรายการต่อไปนี้
                </Text>
              </Divider>

              {/* ── Block row ── */}
              <div style={docLine}>
                <span style={sectionLabel}>ขอบล็อกหมายเลข</span>
                <FilledLine
                  value={summary?.blockNos ?? ""}
                  minWidth={120}
                />
                &nbsp;จำนวน&nbsp;
                <span style={countBox}>
                  {summary?.blockCount || "   "}
                </span>
                &nbsp;บล็อก
              </div>

              {/* ── H&E row ── */}
              <div style={docLine}>
                <span style={sectionLabel}>ขอสไลด์ H&amp;E</span>
                <FilledLine value={summary?.heNos ?? ""} minWidth={120} />
                &nbsp;จำนวน&nbsp;
                <span style={countBox}>
                  {summary?.heCount || "   "}
                </span>
                &nbsp;สไลด์
              </div>

              {/* ── Special stain row ── */}
              <div style={{ ...docLine, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <Checkbox
                  checked={includeSpecialStains}
                  onChange={(e) => setIncludeSpecialStains(e.target.checked)}
                  style={{ fontSize: 13, flexShrink: 0 }}
                >
                  <span style={sectionLabel}>ขอสไลด์ย้อมพิเศษหมายเลข</span>
                </Checkbox>
                <FilledLine value={includeSpecialStains ? (summary?.specialNos ?? "") : ""} minWidth={100} />
                &nbsp;จำนวน&nbsp;
                <span style={countBox}>
                  {includeSpecialStains ? (summary?.specialCount || "   ") : "   "}
                </span>
                &nbsp;สไลด์
              </div>
              <div style={{ ...docLine, paddingLeft: 8, opacity: includeSpecialStains ? 1 : 0.35 }}>
                <span style={{ fontSize: 13, color: "#555" }}>
                  ระบุชนิดการย้อมพิเศษ ได้แก่&nbsp;
                </span>
                <FilledLine value={includeSpecialStains ? (summary?.specialNames ?? "") : ""} minWidth={200} />
              </div>

              {/* ── Cytology row ── */}
              <div style={docLine}>
                <span style={sectionLabel}>ขอสไลด์ Cytology หมายเลข</span>
                <FilledLine value={summary?.cytoNos ?? ""} minWidth={100} />
                &nbsp;จำนวน&nbsp;
                <span style={countBox}>
                  {summary?.cytoCount || "   "}
                </span>
                &nbsp;สไลด์
              </div>

              <Divider style={{ margin: "12px 0" }} />

              {/* ── Delivery channel (reference_doc_no) ── */}
              <div style={{ ...docLine, marginBottom: 4 }}>
                ใบรายงานผลทางศัลยพยาธิวิทยา (Pathology report) ให้ส่งช่องทาง
              </div>
              <Form.Item name="reference_doc_no" style={{ marginBottom: 12 }}>
                <Input
                  placeholder="ระบุช่องทางส่งรายงาน (optional)"
                  maxLength={100}
                  style={{ borderTop: "none", borderLeft: "none", borderRight: "none", borderRadius: 0, background: "transparent" }}
                />
              </Form.Item>

              <Divider style={{ margin: "4px 0 14px" }} />

              {/* ── Recipient ── */}
              <div style={docLine}>
                เป็นผู้รับผิดชอบในการสูญหายของสไลด์และบล็อกพาราฟินที่นำออกไป
              </div>

              <Form.Item
                label={<Text strong>ชื่อผู้รับ (Recipient)</Text>}
                name="recipient_name"
                rules={[{ required: true, message: "Please enter recipient name" }]}
                style={{ marginBottom: 16, marginTop: 8 }}
              >
                <Input
                  size="large"
                  placeholder="ชื่อ-สกุลผู้รับ / authorized representative"
                  maxLength={200}
                />
              </Form.Item>

              {/* ── Signature row ── */}
              <Row gutter={16} style={{ marginTop: 8, marginBottom: 16 }} align="bottom">
                {/* Pathologist — dropdown */}
                <Col span={8} style={{ textAlign: "center" }}>
                  <Form.Item
                    name="pathologist_id"
                    label={<Text style={{ fontSize: 12, color: "#555" }}>พยาธิแพทย์</Text>}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      placeholder="เลือกพยาธิแพทย์"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={pathologists.map((p) => ({
                        value: p.id,
                        label: p.full_name || p.username,
                      }))}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>

                {/* ผู้ขอ — manual input */}
                <Col span={8} style={{ textAlign: "center" }}>
                  <Form.Item
                    name="requester_name"
                    label={<Text style={{ fontSize: 12, color: "#555" }}>ผู้ขอ</Text>}
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="ชื่อผู้ขอ" maxLength={100} />
                  </Form.Item>
                </Col>

                {/* เจ้าหน้าที่ — current user */}
                <Col span={8} style={{ textAlign: "center" }}>
                  <div style={{ borderBottom: "1px solid #bbb", height: 32, margin: "0 8px" }} />
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    {currentUserName ? (
                      <span style={{ display: "block", fontWeight: 600 }}>
                        ({currentUserName})
                      </span>
                    ) : (
                      <BlankLine minWidth={100} />
                    )}
                    <span style={{ color: "#555" }}>เจ้าหน้าที่ผู้รับเรื่อง</span>
                  </div>
                </Col>
              </Row>

              {/* ── Actions ── */}
              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={submitting}
                  icon={<CheckCircleOutlined />}
                  style={{ height: 50, fontSize: 16 }}
                >
                  Confirm Release
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <ManualSelectModal
        open={modalOpen}
        loading={modalLoading}
        data={reportedCases}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
      />
    </PageContainer>
  );
};

export default CreateReleaseForm;
