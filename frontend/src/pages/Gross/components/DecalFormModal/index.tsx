import React, { useEffect } from "react";
import {
  Modal,
  Form,
  Select,
  DatePicker,
  message,
  Button,
  Popconfirm,
  Typography,
  Tag,
  Space,
  Row,
  Col,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  ArrowDownOutlined,
  SaveOutlined,
  FireOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import api from "../../../../services/httpClient";
import { useAuth } from "../../../../contexts/AuthContext";
import { SurgicalBlock } from "../../../../types/surgical";
import logger from "../../../../utils/logger";

const { Option } = Select;
const { Text } = Typography;

interface BlockUser {
  id: number;
  username: string;
  full_name?: string;
  report_name?: string;
}

interface DecalFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (updatedBlock: SurgicalBlock) => void;
  block: SurgicalBlock | null;
  users: BlockUser[];
}

type StepStatus = "waiting" | "inprogress" | "complete";

function getDecalStatus(block: SurgicalBlock): StepStatus {
  if (block.decal_end_at) return "complete";
  if (block.decal_start_at) return "inprogress";
  return "waiting";
}

function getFixStatus(block: SurgicalBlock): StepStatus {
  if (block.fix_end_at) return "complete";
  if (block.fix_start_at) return "inprogress";
  return "waiting";
}

const STATUS_TAG: Record<StepStatus, React.ReactNode> = {
  waiting: <Tag icon={<ExperimentOutlined />} color="default">Waiting</Tag>,
  inprogress: <Tag icon={<ClockCircleOutlined />} color="processing">In Progress</Tag>,
  complete: <Tag icon={<CheckCircleOutlined />} color="success">Complete</Tag>,
};

const DecalFormModal: React.FC<DecalFormModalProps> = ({
  open,
  onClose,
  onSuccess,
  block,
  users,
}) => {
  const { user } = useAuth();
  const [fixStartForm] = Form.useForm();
  const [fixEndForm] = Form.useForm();
  const [startForm] = Form.useForm();
  const [endForm] = Form.useForm();
  const [savingFixStart, setSavingFixStart] = React.useState(false);
  const [savingFixEnd, setSavingFixEnd] = React.useState(false);
  const [reversingFixStep, setReversingFixStep] = React.useState(false);
  const [cancellingFix, setCancellingFix] = React.useState(false);
  const [savingStart, setSavingStart] = React.useState(false);
  const [savingEnd, setSavingEnd] = React.useState(false);

  useEffect(() => {
    if (open && block) {
      fixStartForm.resetFields();
      fixEndForm.resetFields();
      startForm.resetFields();
      endForm.resetFields();

      fixStartForm.setFieldsValue({
        fix_start_at: block.fix_start_at ? dayjs(block.fix_start_at) : dayjs(),
        fix_start_by_id: block.fix_start_by_id || user?.id || null,
      });
      fixEndForm.setFieldsValue({
        fix_end_at: block.fix_end_at ? dayjs(block.fix_end_at) : null,
        fix_end_by_id: block.fix_end_by_id || user?.id || null,
      });
      startForm.setFieldsValue({
        decal_start_at: block.decal_start_at ? dayjs(block.decal_start_at) : dayjs(),
        decal_start_by_id: block.decal_start_by_id || user?.id || null,
      });
      endForm.setFieldsValue({
        decal_end_at: block.decal_end_at ? dayjs(block.decal_end_at) : null,
        decal_end_by_id: block.decal_end_by_id || user?.id || null,
      });
    }
  }, [open, block, fixStartForm, fixEndForm, startForm, endForm]);

  const patchBlock = async (payload: Record<string, unknown>) => {
    if (!block) return null;
    const response = await api.put(`/surgical-blocks/${block.id}`, payload);
    return response.data as SurgicalBlock;
  };

  // ── Extended Fixation handlers ──────────────────────────────────
  const handleMarkFixStarted = async () => {
    const values = await fixStartForm.validateFields();
    setSavingFixStart(true);
    try {
      const updated = await patchBlock({
        is_fixing: true,
        fix_start_at: values.fix_start_at ? values.fix_start_at.toISOString() : null,
        fix_start_by_id: values.fix_start_by_id ?? null,
      });
      if (updated) {
        message.success(`Block ${block!.specimen_label}${block!.block_no} — Extended Fixation started`);
        onSuccess(updated);
      }
    } catch (err: any) {
      logger.error("Fix start error:", err.response?.data);
      message.error(err.response?.data?.detail || "Failed to save fixation start");
    } finally {
      setSavingFixStart(false);
    }
  };

  const handleCompleteFixing = async () => {
    const values = await fixEndForm.validateFields();
    if (!values.fix_end_at) {
      fixEndForm.setFieldsValue({ fix_end_at: dayjs() });
      values.fix_end_at = fixEndForm.getFieldValue("fix_end_at");
    }
    setSavingFixEnd(true);
    try {
      const updated = await patchBlock({
        is_fixing: false,
        fix_end_at: values.fix_end_at ? values.fix_end_at.toISOString() : null,
        fix_end_by_id: values.fix_end_by_id ?? null,
      });
      if (updated) {
        message.success(`Block ${block!.specimen_label}${block!.block_no} — Extended Fixation complete`);
        onSuccess(updated);
        onClose();
      }
    } catch (err: any) {
      logger.error("Fix end error:", err.response?.data);
      message.error(err.response?.data?.detail || "Failed to save fixation completion");
    } finally {
      setSavingFixEnd(false);
    }
  };

  const handleReverseFixStep = async () => {
    setReversingFixStep(true);
    try {
      let payload: Record<string, unknown>;
      if (fixStatus === "complete") {
        // complete → inprogress
        payload = { is_fixing: true, fix_end_at: null, fix_end_by_id: null };
      } else {
        // inprogress → waiting
        payload = { fix_start_at: null, fix_start_by_id: null };
      }
      const updated = await patchBlock(payload);
      if (updated) {
        message.success(`Block ${block!.specimen_label}${block!.block_no} — Fixation step undone`);
        onSuccess(updated);
      }
    } catch (err: any) {
      logger.error("Reverse fix error:", err.response?.data);
      message.error(err.response?.data?.detail || "Failed to undo fixation step");
    } finally {
      setReversingFixStep(false);
    }
  };

  const handleCancelFix = async () => {
    setCancellingFix(true);
    try {
      const updated = await patchBlock({
        is_fixing: false,
        fix_start_at: null,
        fix_start_by_id: null,
        fix_end_at: null,
        fix_end_by_id: null,
      });
      if (updated) {
        message.success(`Block ${block!.specimen_label}${block!.block_no} — Extended Fixation cancelled`);
        onSuccess(updated);
        onClose();
      }
    } catch (err: any) {
      logger.error("Cancel fix error:", err.response?.data);
      message.error(err.response?.data?.detail || "Failed to cancel fixation");
    } finally {
      setCancellingFix(false);
    }
  };

  // ── Decalcification handlers ────────────────────────────────────
  const handleMarkStarted = async () => {
    const values = await startForm.validateFields();
    setSavingStart(true);
    try {
      const updated = await patchBlock({
        is_decal: true,
        decal_start_at: values.decal_start_at ? values.decal_start_at.toISOString() : null,
        decal_start_by_id: values.decal_start_by_id ?? null,
      });
      if (updated) {
        message.success(`Block ${block!.specimen_label}${block!.block_no} — Decal started`);
        onSuccess(updated);
      }
    } catch (err: any) {
      logger.error("Decal start error:", err.response?.data);
      message.error(err.response?.data?.detail || "Failed to save decal start");
    } finally {
      setSavingStart(false);
    }
  };

  const handleCompleteDecal = async () => {
    const values = await endForm.validateFields();
    if (!values.decal_end_at) {
      endForm.setFieldsValue({ decal_end_at: dayjs() });
      values.decal_end_at = endForm.getFieldValue("decal_end_at");
    }
    setSavingEnd(true);
    try {
      const updated = await patchBlock({
        is_decal: false,
        decal_end_at: values.decal_end_at ? values.decal_end_at.toISOString() : null,
        decal_end_by_id: values.decal_end_by_id ?? null,
      });
      if (updated) {
        message.success(`Block ${block!.specimen_label}${block!.block_no} — Decal complete`);
        onSuccess(updated);
        onClose();
      }
    } catch (err: any) {
      logger.error("Decal end error:", err.response?.data);
      message.error(err.response?.data?.detail || "Failed to save decal completion");
    } finally {
      setSavingEnd(false);
    }
  };

  if (!open || !block) return null;

  const decalStatus = getDecalStatus(block);
  const fixStatus = getFixStatus(block);

  const blockLabel = `${block.specimen_label}${block.block_no}`;

  // Determine modal title status (show fixing status if block is in fix flow, else decal)
  const titleStatus = block.is_fixing || block.fix_start_at ? fixStatus : decalStatus;

  return (
    <Modal
      title={
        <Space>
          <Text>Block Management:</Text>
          <Tag color="blue">{blockLabel}</Tag>
          {STATUS_TAG[titleStatus]}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
    >
      <Row gutter={16} align="top">
        {/* ── Col Left: Extended Fixation ─────────────────────────── */}
        <Col span={12}>
          <div style={{ border: "1px solid #ffd591", background: "#fff7e6", borderRadius: 8, padding: "16px" }}>
            <Space style={{ marginBottom: 12 }}>
              <WarningOutlined style={{ color: "#d46b08", fontSize: 16 }} />
              <div>
                <Text strong style={{ color: "#d46b08", fontSize: 14 }}>Extended Fixation</Text>
                <Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 1 }}>
                  Additional formalin fixation — exits queue when end time is recorded
                </Text>
              </div>
            </Space>

            {/* Step 1: Start fix */}
            <div style={{ background: "#fff", border: "1px solid #d9d9d9", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fa8c16", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>1</Text>
                </div>
                <Text strong style={{ fontSize: 13, flex: 1 }}>Start Fixation</Text>
                {fixStatus === "waiting" ? (
                  <Button size="small" type="primary" icon={<FireOutlined />} loading={savingFixStart} onClick={handleMarkFixStarted} style={{ background: "#fa8c16", borderColor: "#fa8c16" }}>
                    Mark Started
                  </Button>
                ) : (
                  <Space size={4}>
                    <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>Recorded</Tag>
                    {fixStatus === "inprogress" && (
                      <Button size="small" icon={<RollbackOutlined />} loading={reversingFixStep} onClick={handleReverseFixStep} danger>
                        Undo
                      </Button>
                    )}
                  </Space>
                )}
              </div>
              <Form form={fixStartForm} layout="vertical">
                <Form.Item name="fix_start_at" label="Date / Time" style={{ marginBottom: 6 }}>
                  <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" disabled={fixStatus !== "waiting"} />
                </Form.Item>
                <Form.Item name="fix_start_by_id" label="Started By" style={{ marginBottom: 0 }}>
                  <Select placeholder="Select staff" allowClear disabled={fixStatus !== "waiting"}>
                    {users.map((u) => (
                      <Option key={u.id} value={u.id}>{u.report_name || u.full_name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Form>
            </div>

            <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
              <ArrowDownOutlined style={{ color: "#fa8c16", fontSize: 14 }} />
            </div>

            {/* Step 2: Complete fix */}
            <div style={{ background: fixStatus === "complete" ? "#f6ffed" : "#fff", border: `1px solid ${fixStatus === "complete" ? "#b7eb8f" : "#d9d9d9"}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Space size={6}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: fixStatus === "complete" ? "#52c41a" : "#d9d9d9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {fixStatus === "complete"
                      ? <CheckCircleOutlined style={{ color: "#fff", fontSize: 12 }} />
                      : <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>2</Text>
                    }
                  </div>
                  <Text strong style={{ fontSize: 13 }}>Complete Fixation</Text>
                  {fixStatus === "complete" && (
                    <Space size={4}>
                      <Tag color="success" style={{ marginInlineEnd: 0 }}>Done</Tag>
                      <Button size="small" icon={<RollbackOutlined />} loading={reversingFixStep} onClick={handleReverseFixStep} danger>Undo</Button>
                    </Space>
                  )}
                  {fixStatus === "inprogress" && <Tag color="warning" icon={<ClockCircleOutlined />} style={{ marginInlineEnd: 0 }}>In Progress</Tag>}
                </Space>
                {fixStatus === "inprogress" && (
                  <Space size={6}>
                    <Button size="small" icon={<ThunderboltOutlined />} onClick={() => fixEndForm.setFieldsValue({ fix_end_at: dayjs() })}>Now</Button>
                    <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingFixEnd} onClick={handleCompleteFixing} style={{ background: "#fa8c16", borderColor: "#fa8c16" }}>Complete</Button>
                  </Space>
                )}
              </div>
              <Form form={fixEndForm} layout="vertical">
                <Form.Item name="fix_end_at" label="Date / Time" style={{ marginBottom: 6 }}>
                  <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" disabled={fixStatus !== "inprogress"} />
                </Form.Item>
                <Form.Item name="fix_end_by_id" label="Ended By" style={{ marginBottom: 0 }}>
                  <Select placeholder="Select staff" allowClear disabled={fixStatus !== "inprogress"}>
                    {users.map((u) => (
                      <Option key={u.id} value={u.id}>{u.report_name || u.full_name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Form>
            </div>

            {(fixStatus === "waiting" || fixStatus === "inprogress") && (
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <Popconfirm
                  title="Cancel Extended Fixation?"
                  description="This will clear all fixation records and remove the block from the queue."
                  okText="Yes, Cancel"
                  okButtonProps={{ danger: true }}
                  cancelText="Keep"
                  onConfirm={handleCancelFix}
                >
                  <Button size="small" icon={<StopOutlined />} danger loading={cancellingFix}>
                    Cancel Fixation
                  </Button>
                </Popconfirm>
              </div>
            )}
          </div>
        </Col>

        {/* ── Col Right: Decalcification ───────────────────────────── */}
        <Col span={12}>
          <div style={{ border: "1px solid #91d5ff", background: "#f0f5ff", borderRadius: 8, padding: "16px" }}>
            <Space style={{ marginBottom: 12 }}>
              <ExperimentOutlined style={{ color: "#1890ff", fontSize: 16 }} />
              <div>
                <Text strong style={{ color: "#1890ff", fontSize: 14 }}>Decalcification (Decal)</Text>
                <Text type="secondary" style={{ display: "block", fontSize: 11, marginTop: 1 }}>
                  Block stays in queue while in progress — exits when end time is recorded
                </Text>
              </div>
            </Space>

            {/* Step 1: Start decal */}
            <div style={{ background: "#fff", border: "1px solid #d9d9d9", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#1890ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>1</Text>
                </div>
                <Text strong style={{ fontSize: 13, flex: 1 }}>Start Decal</Text>
                {decalStatus === "waiting" ? (
                  <Button size="small" type="primary" icon={<ExperimentOutlined />} loading={savingStart} onClick={handleMarkStarted}>
                    Mark Started
                  </Button>
                ) : (
                  <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>Recorded</Tag>
                )}
              </div>
              <Form form={startForm} layout="vertical">
                <Form.Item name="decal_start_at" label="Date / Time" style={{ marginBottom: 6 }}>
                  <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" disabled={decalStatus !== "waiting"} />
                </Form.Item>
                <Form.Item name="decal_start_by_id" label="Started By" style={{ marginBottom: 0 }}>
                  <Select placeholder="Select staff" allowClear disabled={decalStatus !== "waiting"}>
                    {users.map((u) => (
                      <Option key={u.id} value={u.id}>{u.report_name || u.full_name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Form>
            </div>

            <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
              <ArrowDownOutlined style={{ color: "#1890ff", fontSize: 14 }} />
            </div>

            {/* Step 2: Complete decal */}
            <div style={{ background: decalStatus === "complete" ? "#f6ffed" : "#fff", border: `1px solid ${decalStatus === "complete" ? "#b7eb8f" : "#d9d9d9"}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Space size={6}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: decalStatus === "complete" ? "#52c41a" : "#d9d9d9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {decalStatus === "complete"
                      ? <CheckCircleOutlined style={{ color: "#fff", fontSize: 12 }} />
                      : <Text style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>2</Text>
                    }
                  </div>
                  <Text strong style={{ fontSize: 13 }}>Complete Decal</Text>
                  {decalStatus === "complete" && <Tag color="success" style={{ marginInlineEnd: 0 }}>Done</Tag>}
                  {decalStatus === "inprogress" && <Tag color="processing" icon={<ClockCircleOutlined />} style={{ marginInlineEnd: 0 }}>In Progress</Tag>}
                </Space>
                {decalStatus === "inprogress" && (
                  <Space size={6}>
                    <Button size="small" icon={<ThunderboltOutlined />} onClick={() => endForm.setFieldsValue({ decal_end_at: dayjs() })}>Now</Button>
                    <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingEnd} onClick={handleCompleteDecal}>Complete</Button>
                  </Space>
                )}
              </div>
              <Form form={endForm} layout="vertical">
                <Form.Item name="decal_end_at" label="Date / Time" style={{ marginBottom: 6 }}>
                  <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" disabled={decalStatus !== "inprogress"} />
                </Form.Item>
                <Form.Item name="decal_end_by_id" label="Ended By" style={{ marginBottom: 0 }}>
                  <Select placeholder="Select staff" allowClear disabled={decalStatus !== "inprogress"}>
                    {users.map((u) => (
                      <Option key={u.id} value={u.id}>{u.report_name || u.full_name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Form>
            </div>
          </div>
        </Col>
      </Row>
    </Modal>
  );
};

export default DecalFormModal;
