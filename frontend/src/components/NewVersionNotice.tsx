import React, { useEffect, useState } from "react";
import { App, Button, Space } from "antd";
import { useNewBuildAvailable } from "../hooks/useNewBuildAvailable";
import { reloadForNewBuild } from "../utils/staleBuild";
import SystemSettingService from "../services/systemSettingService";

const NOTICE_KEY = "new-version";
// "Later" hides the notice for this long; it then comes back.
export const SNOOZE_MS = 30 * 60 * 1000;

/**
 * Tells everyone with a tab open that the server has a newer build, and
 * leaves the reload to them: a pathologist halfway through a report must be
 * able to save it first. Mounted once, inside AntdApp (App.tsx).
 *
 * The notify_new_build system setting turns the polling off. A page that
 * fails to load because a deploy replaced it still raises the notice, since
 * then something is already broken and this explains it.
 */
const NewVersionNotice: React.FC = () => {
  // Polling waits for the setting, and runs if it can't be read.
  const [pollAllowed, setPollAllowed] = useState(false);
  useEffect(() => {
    SystemSettingService.getPublicSettings()
      .then((s) => setPollAllowed(s.notify_new_build !== false))
      .catch(() => setPollAllowed(true));
  }, []);

  const available = useNewBuildAvailable({ enabled: import.meta.env.PROD && pollAllowed });
  const { notification } = App.useApp();
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    if (!available || snoozed) return;
    const later = () => {
      setSnoozed(true);
      notification.destroy(NOTICE_KEY);
    };
    notification.info({
      key: NOTICE_KEY,
      title: "มีระบบเวอร์ชันใหม่แล้ว",
      description:
        "บันทึกงานที่ทำค้างไว้ก่อน แล้วกดรีเฟรชเพื่อใช้เวอร์ชันใหม่ ระหว่างนี้บางหน้าอาจเปิดไม่ขึ้น",
      duration: 0,
      onClose: () => setSnoozed(true),
      actions: (
        <Space>
          <Button size="small" onClick={later}>
            ภายหลัง
          </Button>
          <Button type="primary" size="small" onClick={reloadForNewBuild}>
            รีเฟรช
          </Button>
        </Space>
      ),
    });
  }, [available, snoozed, notification]);

  useEffect(() => {
    if (!snoozed) return;
    const timer = window.setTimeout(() => setSnoozed(false), SNOOZE_MS);
    return () => window.clearTimeout(timer);
  }, [snoozed]);

  return null;
};

export default NewVersionNotice;
