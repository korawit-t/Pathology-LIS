import React, { useEffect, useState } from "react";
import { Space, Switch, Typography, message } from "antd";
import SystemSettingService from "../../../services/systemSettingService";

const { Text, Title } = Typography;

export type UpdateNoticeKey = "notify_new_release" | "notify_new_build";

const ROWS: { key: UpdateNoticeKey; title: string; description: string }[] = [
  {
    key: "notify_new_release",
    title: "แจ้ง admin เมื่อมี release ใหม่",
    description:
      "ไอคอนบน header และแถว Latest Release ด้านบน ถ้าปิด ระบบจะไม่เช็คกับ GitHub เลย",
  },
  {
    key: "notify_new_build",
    title: "แจ้งผู้ใช้ให้รีเฟรชหลัง deploy",
    description:
      "แท็บที่เปิดค้างไว้จะขึ้นแจ้งให้บันทึกงานแล้วรีเฟรช ถ้าปิด จะแจ้งเฉพาะตอนที่หน้าเปิดไม่ขึ้นเพราะระบบอัปเดต",
  },
];

interface Props {
  // The About tab re-reads the release status once its switch has moved.
  onChange?: (key: UpdateNoticeKey, value: boolean) => void;
}

/** System Settings → About: the two update-notice switches, each saved as it is flipped. */
const UpdateNoticeSettings: React.FC<Props> = ({ onChange }) => {
  const [values, setValues] = useState<Record<UpdateNoticeKey, boolean> | null>(null);
  const [saving, setSaving] = useState<UpdateNoticeKey | null>(null);

  useEffect(() => {
    SystemSettingService.getSettings()
      .then((s) =>
        setValues({
          notify_new_release: s.notify_new_release ?? true,
          notify_new_build: s.notify_new_build ?? true,
        }),
      )
      .catch(() => message.error("โหลดการตั้งค่าการแจ้งเตือนไม่ได้"));
  }, []);

  const toggle = async (key: UpdateNoticeKey, value: boolean) => {
    setSaving(key);
    try {
      // Behind the step-up guard like every settings save; StepUpGate asks.
      await SystemSettingService.updateSettings({ [key]: value });
      setValues((current) => (current ? { ...current, [key]: value } : current));
      message.success("บันทึกแล้ว");
      onChange?.(key, value);
    } catch {
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ maxWidth: 640, marginTop: 32 }}>
      <Title level={5} style={{ marginBottom: 16 }}>
        การแจ้งเตือนอัปเดต
      </Title>
      {ROWS.map(({ key, title, description }) => (
        <div
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            padding: "16px 0",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Space orientation="vertical" size={0}>
            <Text strong>{title}</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {description}
            </Text>
          </Space>
          <Switch
            aria-label={title}
            checked={values?.[key] ?? true}
            disabled={values === null}
            loading={saving === key}
            onChange={(checked) => toggle(key, checked)}
          />
        </div>
      ))}
    </div>
  );
};

export default UpdateNoticeSettings;
