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
import SpecimenDisposalService from "../../services/specimenDisposalService";
import type { SurgicalCase } from "../../types/surgical";
import type { User } from "../../types/user";
import type { DisposalBatch } from "../../types/specimenDisposal";
import { formatPatientName } from "../../utils/patientName";
import { isExternalRole } from "../../constants/roles.constants";
import { disposalBlockReason } from "./disposalEligibility";
import logger from "../../utils/logger";

const { Text } = Typography;

interface Props {
  open: boolean;
  cases: SurgicalCase[];
  /** เกณฑ์อายุที่ backend ใช้บล็อกจริง มาจาก /surgical-cases/stored/specimens */
  retentionDays: number;
  onCancel: () => void;
  /** ยิงหลังสร้างใบสำเร็จ (PDF ถูกเปิดใน tab ใหม่ให้แล้ว) */
  onCreated: (batch: DisposalBatch) => void;
}

interface FormValues {
  disposer_id: number;
  verifier_id: number;
  approver_id: number;
}

const CreateDisposalBatchModal: React.FC<Props> = ({
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

  // สรุปจำนวนแยกตามกล่อง — คนเช็คหน้างานเดินทีละกล่อง จึงอยากเห็นก่อนสั่งพิมพ์
  const containerSummary = useMemo(() => {
    const counts = new Map<string, number>();
    cases.forEach((c) => {
      const key = c.specimen_storage_container || "-";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([container, count]) => ({ container, count }));
  }, [cases]);

  // เคสที่ backend จะปฏิเสธ — โชว์ก่อนสั่งพิมพ์ ไม่ใช่ปล่อยให้ POST เด้ง error
  const blocked = useMemo(
    () =>
      cases
        .map((c) => ({ case: c, reason: disposalBlockReason(c, retentionDays) }))
        .filter((row): row is { case: SurgicalCase; reason: string } =>
          Boolean(row.reason)
        ),
    [cases, retentionDays]
  );

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
      const batch = await SpecimenDisposalService.create({
        case_ids: cases.map((c) => c.id),
        disposer_id: values.disposer_id,
        verifier_id: values.verifier_id,
        approver_id: values.approver_id,
      });
      message.success(`สร้างใบ ${batch.batch_no} แล้ว`);
      await SpecimenDisposalService.openChecklistPdf(batch.id);
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
      title="สร้างใบตรวจสอบก่อนทำลายชิ้นเนื้อ"
      width={720}
      okText="สร้างใบและพิมพ์"
      cancelText="ยกเลิก"
      okButtonProps={{
        icon: <PrinterOutlined />,
        loading: submitting,
        disabled: blocked.length > 0,
      }}
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
            เลือกไว้ <b>{cases.length}</b> รายการ จาก <b>{containerSummary.length}</b> กล่อง
          </span>
        }
        description={
          <Space size={[6, 6]} wrap style={{ marginTop: 4 }}>
            {containerSummary.map(({ container, count }) => (
              <Tag key={container} color="blue">
                {container} · {count}
              </Tag>
            ))}
          </Space>
        }
      />

      {blocked.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={`มี ${blocked.length} รายการที่ยังทำลายไม่ได้ — เอาออกจากรายการเลือกก่อน`}
          description={
            <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
              {blocked.map(({ case: c, reason }) => (
                <Text key={c.id} style={{ fontSize: 12 }}>
                  {c.accession_no} — {reason}
                </Text>
              ))}
            </Space>
          }
        />
      )}

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
            placeholder="ผู้ที่ลงมือนำชิ้นเนื้อออกทำลาย"
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
        เกณฑ์อายุที่ใช้รอบนี้:{" "}
        <Text strong style={{ fontSize: 12 }}>
          {retentionDays} วันนับจากวันรายงานผล
        </Text>{" "}
        — ตั้งค่าที่ Settings → Report; ระบบใช้ค่านี้บล็อกจริง ไม่ใช่แค่พิมพ์ลงหัวใบ
      </Text>

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
          { title: "กล่อง", dataIndex: "specimen_storage_container", width: 90 },
          { title: "Accession No.", dataIndex: "accession_no", width: 130 },
          { title: "HN", dataIndex: "hn", width: 100 },
          {
            title: "ชื่อ-สกุลผู้ป่วย",
            key: "patient",
            render: (_: unknown, r: SurgicalCase) => formatPatientName(r.patient),
          },
        ]}
      />
    </Modal>
  );
};

export default CreateDisposalBatchModal;
