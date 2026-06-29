import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Table,
  Select,
  Input,
  DatePicker,
  Space,
  Tag,
  Divider,
  Typography,
  Form,
  message,
  Spin,
} from "antd";
import { PlusOutlined, BellOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import CriticalNotificationService, {
  CriticalNotificationRecord,
} from "../../services/criticalNotificationService";
import NotificationChannelService, {
  NotificationChannel,
} from "../../services/notificationChannelService";

const { Text } = Typography;

const NOTIFICATION_TYPE_OPTIONS = [
  { value: "malignancy", label: "Malignancy" },
  { value: "critical_value", label: "Critical Value" },
  { value: "other", label: "Other" },
];

const TYPE_COLOR: Record<string, string> = {
  critical_value: "red",
  malignancy: "purple",
  other: "default",
};

interface Props {
  caseId: number;
  caseType: "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO";
  accessionNo?: string;
}

const CriticalNotificationSection: React.FC<Props> = ({ caseId, caseType, accessionNo }) => {
  const [records, setRecords] = useState<CriticalNotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [form] = Form.useForm();
  const channelSelectRef = useRef<any>(null);

  const load = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await CriticalNotificationService.getByCaseId(
        caseId,
        caseType,
      );
      setRecords(res.items);
    } catch {
      // ไม่มี record = ปกติ
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    NotificationChannelService.getChannels()
      .then((data) => setChannels(data.filter((c) => c.is_active)))
      .catch(() => {});
  }, [caseId, caseType]);

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await CriticalNotificationService.create({
        case_id: caseId,
        case_type: caseType,
        accession_no: accessionNo,
        notification_type: values.notification_type,
        notified_at: values.notified_at.toISOString(),
        recipient_name: values.recipient_name,
        recipient_role: values.recipient_role || undefined,
        note: values.note || undefined,
        channel_ids: values.channel_ids?.length
          ? values.channel_ids
          : undefined,
      });
      message.success("บันทึกการแจ้งเรียบร้อย");
      form.resetFields();
      setShowForm(false);
      load();
    } catch {
      message.error("ไม่สามารถบันทึกได้");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "ประเภท",
      dataIndex: "notification_type",
      width: 150,
      render: (v: string) => {
        const label =
          NOTIFICATION_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
        return <Tag color={TYPE_COLOR[v] ?? "default"}>{label}</Tag>;
      },
    },
    {
      title: "วัน/เวลาที่แจ้ง",
      dataIndex: "notified_at",
      width: 150,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
    {
      title: "ผู้รับแจ้ง",
      dataIndex: "recipient_name",
      render: (v: string, row: CriticalNotificationRecord) =>
        row.recipient_role ? `${v} (${row.recipient_role})` : v,
    },
    {
      title: "ผู้แจ้ง",
      dataIndex: "notified_by",
      width: 130,
      render: (v: any) => v?.full_name ?? v?.username ?? "—",
    },
    {
      title: "หมายเหตุ",
      dataIndex: "note",
      render: (v: string) =>
        v ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {v}
          </Text>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <Divider style={{ margin: "12px 0 10px" }}>
        <Space size={6}>
          <BellOutlined style={{ color: "#ff4d4f" }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Critical & Malignancy Notifications
          </span>
        </Space>
      </Divider>

      {loading ? (
        <Spin size="small" />
      ) : (
        <>
          {records.length > 0 && (
            <Table
              size="small"
              dataSource={records}
              columns={columns}
              rowKey="id"
              pagination={false}
              style={{ marginBottom: 10 }}
            />
          )}

          {!showForm ? (
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                form.setFieldsValue({ notified_at: dayjs() });
                setShowForm(true);
              }}
              style={{ marginTop: records.length > 0 ? 0 : 4 }}
            >
              เพิ่มบันทึกการแจ้ง
            </Button>
          ) : (
            <div
              style={{
                background: "#fafafa",
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                padding: "12px 16px",
                marginTop: 8,
              }}
            >
              <Form form={form} layout="vertical" size="small">
                <Space style={{ width: "100%" }} direction="vertical" size={0}>
                  <Space size={8} style={{ width: "100%", flexWrap: "wrap" }}>
                    <Form.Item
                      name="notification_type"
                      label="ประเภท"
                      rules={[{ required: true, message: "กรุณาเลือกประเภท" }]}
                      style={{ marginBottom: 8, minWidth: 200 }}
                    >
                      <Select
                        options={NOTIFICATION_TYPE_OPTIONS}
                        placeholder="เลือกประเภท"
                        style={{ width: 220 }}
                        onChange={() => {}}
                      />
                    </Form.Item>
                    <Form.Item
                      name="notified_at"
                      label="วัน/เวลาที่แจ้ง"
                      rules={[{ required: true, message: "กรุณาระบุวันเวลา" }]}
                      style={{ marginBottom: 8 }}
                    >
                      <DatePicker
                        showTime
                        format="DD/MM/YYYY HH:mm"
                        style={{ width: 200 }}
                      />
                    </Form.Item>
                  </Space>
                  <Space size={8} style={{ width: "100%", flexWrap: "wrap" }}>
                    <Form.Item
                      name="recipient_name"
                      label="ชื่อผู้รับแจ้ง"
                      style={{ marginBottom: 8 }}
                    >
                      <Input
                        placeholder="ชื่อผู้รับแจ้ง (optional)"
                        style={{ width: 200 }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="recipient_role"
                      label="ตำแหน่ง"
                      style={{ marginBottom: 8 }}
                    >
                      <Input
                        placeholder="เช่น แพทย์ / พยาบาล"
                        style={{ width: 180 }}
                      />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    name="note"
                    label="หมายเหตุ"
                    style={{ marginBottom: 8 }}
                  >
                    <Input.TextArea
                      rows={2}
                      placeholder="สิ่งที่แจ้ง หรือรายละเอียดเพิ่มเติม"
                    />
                  </Form.Item>
                  {channels.length > 0 && (
                    <Form.Item
                      name="channel_ids"
                      label="แจ้งผ่านช่องทาง (Notification Channels)"
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        ref={channelSelectRef}
                        mode="multiple"
                        placeholder="เลือก channel (ไม่บังคับ)"
                        style={{ width: "100%" }}
                        options={channels.map((c) => ({
                          value: c.id,
                          label: `${c.name} (${c.platform.toUpperCase()})`,
                        }))}
                        onSelect={() => channelSelectRef.current?.blur()}
                      />
                    </Form.Item>
                  )}
                </Space>
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    loading={saving}
                    onClick={handleSave}
                  >
                    บันทึก
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setShowForm(false);
                      form.resetFields();
                    }}
                  >
                    ยกเลิก
                  </Button>
                </Space>
              </Form>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CriticalNotificationSection;
