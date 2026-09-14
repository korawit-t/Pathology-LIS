import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Form,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import UserService from "../../services/userService";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { User } from "../../types/user";
import type {
  NongyneDisposalBatch,
  NongyneDisposalCandidate,
} from "../../types/nongyneSpecimenDisposal";
import { formatPatientName } from "../../utils/patientName";
import { isExternalRole } from "../../constants/roles.constants";
import logger from "../../utils/logger";

const { Text } = Typography;

interface Props {
  open: boolean;
  cases: NongyneDisposalCandidate[];
  /** เกณฑ์ที่ backend ใช้จริง — โชว์อย่างเดียว แก้ที่หน้า Admin */
  retentionDays: number;
  onCancel: () => void;
  /** ยิงหลังสร้างใบสำเร็จ (PDF ถูกเปิดใน tab ใหม่ให้แล้ว) */
  onCreated: (batch: NongyneDisposalBatch) => void;
}

interface FormValues {
  disposer_id: number;
  verifier_id: number;
  approver_id: number;
}

const CreateNongyneDisposalBatchModal: React.FC<Props> = ({
  open,
  cases,
  retentionDays,
  onCancel,
  onCreated,
}) => {
  const [form] = Form.useForm<FormValues>();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingUsers(true);
    UserService.getUsers()
      .then((data) => {
        // ตัดบัญชีฝั่งผู้ส่งตรวจออก — clinician/hospital ไม่ได้อยู่ในแลป
        // จึงลงนามเป็นผู้ทิ้ง/ผู้ตรวจสอบ/ผู้อนุมัติไม่ได้ (backend ปฏิเสธซ้ำอีกชั้น)
        if (!cancelled) {
          setUsers(
            data.filter((u) => u.status !== false && !isExternalRole(u.roles)),
          );
        }
      })
      .catch((err) => {
        logger.error(err);
        if (!cancelled) message.error("ไม่สามารถโหลดรายชื่อผู้ใช้ได้");
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // สรุปจำนวนแยกตามชนิดสิ่งส่งตรวจ — non-gyne ไม่มีกล่อง คนหยิบของในตู้เย็น
  // ไล่ทีละชนิดแทน ใบที่พิมพ์ก็จัดกลุ่มแบบเดียวกัน
  const specimenTypeSummary = useMemo(() => {
    const counts = new Map<string, number>();
    cases.forEach((c) => {
      const key = c.specimen_type || "-";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([specimenType, count]) => ({ specimenType, count }));
  }, [cases]);

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: u.full_name ? `${u.full_name} (${u.username})` : u.username,
      })),
    [users]
  );

  const handleOk = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    try {
      setSubmitting(true);
      const batch = await NongyneSpecimenDisposalService.create({
        case_ids: cases.map((c) => c.id),
        disposer_id: values.disposer_id,
        verifier_id: values.verifier_id,
        approver_id: values.approver_id,
      });
      message.success(`สร้างใบ ${batch.batch_no} แล้ว`);
      await NongyneSpecimenDisposalService.openChecklistPdf(batch.id);
      form.resetFields();
      onCreated(batch);
    } catch (error: unknown) {
      logger.error(error);
      const detail = (error as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      message.error(detail || "สร้างใบตรวจสอบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="สร้างใบตรวจสอบก่อนทำลายสิ่งส่งตรวจ"
      width={760}
      okText="สร้างใบและพิมพ์"
      cancelText="ยกเลิก"
      okButtonProps={{ icon: <PrinterOutlined />, loading: submitting }}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={
          <span>
            เลือกไว้ <b>{cases.length}</b> รายการ จาก{" "}
            <b>{specimenTypeSummary.length}</b> ชนิดสิ่งส่งตรวจ
          </span>
        }
        description={
          <>
            <Space size={[6, 6]} wrap style={{ marginTop: 4 }}>
              {specimenTypeSummary.map(({ specimenType, count }) => (
                <Tag key={specimenType} color="blue">
                  {specimenType} · {count}
                </Tag>
              ))}
            </Space>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                เกณฑ์: รายงานผลแล้วเกิน <b>{retentionDays}</b> วัน และไม่ค้าง Pending
                — ตั้งค่าได้ที่หน้า Admin
              </Text>
            </div>
          </>
        }
      />

      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="disposer_id"
          label="ผู้ทิ้ง"
          rules={[{ required: true, message: "กรุณาเลือกผู้ทิ้ง" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={loadingUsers}
            options={userOptions}
            placeholder="ผู้ที่ลงมือนำสิ่งส่งตรวจออกทำลาย"
          />
        </Form.Item>

        <Form.Item
          name="verifier_id"
          label="ผู้ตรวจสอบ"
          dependencies={["disposer_id"]}
          rules={[
            { required: true, message: "กรุณาเลือกผู้ตรวจสอบ" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || value !== getFieldValue("disposer_id")) {
                  return Promise.resolve();
                }
                // การตรวจสอบต้องมีคนที่สองยืนดูจริง ๆ ไม่ใช่คนเดิมเซ็นสองช่อง
                return Promise.reject(
                  new Error("ผู้ตรวจสอบต้องเป็นคนละคนกับผู้ทิ้ง")
                );
              },
            }),
          ]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={loadingUsers}
            options={userOptions}
            placeholder="ผู้ที่ยืนตรวจสอบร่วมขณะทำลาย"
          />
        </Form.Item>

        <Form.Item
          name="approver_id"
          label="ผู้อนุมัติ"
          rules={[{ required: true, message: "กรุณาเลือกผู้อนุมัติ" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={loadingUsers}
            options={userOptions}
            placeholder="หัวหน้าหน่วย / ผู้มีอำนาจอนุมัติ"
          />
        </Form.Item>
      </Form>

      <Text type="secondary" style={{ fontSize: 12 }}>
        รายการที่จะอยู่บนใบ
      </Text>
      <Table
        size="small"
        rowKey="id"
        style={{ marginTop: 6 }}
        dataSource={cases}
        pagination={cases.length > 8 ? { pageSize: 8, size: "small" } : false}
        columns={[
          { title: "Accession No.", dataIndex: "accession_no", width: 130 },
          { title: "HN", dataIndex: "hn", width: 100 },
          {
            title: "ชื่อ-สกุลผู้ป่วย",
            key: "patient",
            render: (_: unknown, r: NongyneDisposalCandidate) =>
              formatPatientName(r.patient),
          },
          { title: "ชนิด", dataIndex: "specimen_type", width: 110 },
          {
            title: "ออกผลมาแล้ว",
            dataIndex: "days_since_report",
            width: 120,
            render: (days: number | null) => (days == null ? "-" : `${days} วัน`),
          },
        ]}
      />
    </Modal>
  );
};

export default CreateNongyneDisposalBatchModal;
