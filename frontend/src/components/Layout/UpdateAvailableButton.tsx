import React, { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { CloudDownloadOutlined } from "@ant-design/icons";
import VersionService from "../../services/versionService";
import type { UpdateStatus } from "../../types/version";

interface Props {
  // The status endpoint is admin only; nobody else asks for it.
  isAdmin: boolean;
}

/**
 * Header button an admin sees when GitHub has a newer release than this
 * server runs. Opens the release notes; System Settings → About has the
 * detail. Shows nothing while up to date, or when the check can't tell.
 */
const UpdateAvailableButton: React.FC<Props> = ({ isAdmin }) => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    VersionService.getUpdateStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      // An older backend without the endpoint, or no network: stay quiet.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!status?.update_available) return null;

  const title = status.major_update
    ? `มี v${status.latest_version} แล้ว (เครื่องนี้ v${status.current_version}) — เป็น MAJOR อ่าน upgrade notes ก่อนอัปเดต`
    : `มี v${status.latest_version} แล้ว (เครื่องนี้ v${status.current_version}) — คลิกเพื่ออ่าน release notes`;

  return (
    <Tooltip title={title}>
      <Button
        type="text"
        aria-label="มีเวอร์ชันใหม่"
        icon={<CloudDownloadOutlined />}
        href={status.release_url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: "16px", color: status.major_update ? "#f5222d" : "#fa8c16" }}
      />
    </Tooltip>
  );
};

export default UpdateAvailableButton;
