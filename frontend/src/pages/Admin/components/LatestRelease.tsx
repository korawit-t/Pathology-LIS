import React from "react";
import { Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { UpdateStatus } from "../../../types/version";

const { Text } = Typography;

const UPDATE_CHECK_ERRORS: Record<NonNullable<UpdateStatus["error"]>, string> = {
  unreachable: "เชื่อมต่อ GitHub ไม่ได้",
  no_release: "ยังไม่มี release ให้เทียบ",
  rate_limited: "GitHub จำกัดจำนวนครั้ง ลองใหม่ภายหลัง",
  bad_response: "อ่านข้อมูล release ไม่ได้",
};

/** System Settings → About: this install against the latest GitHub release. */
const LatestRelease: React.FC<{ status: UpdateStatus | null }> = ({ status }) => {
  if (!status) return <Tag>-</Tag>;
  if (!status.enabled) {
    return (
      <Text type="secondary">
        {status.disabled_by === "setting"
          ? "ปิดการแจ้งเตือนไว้ (สวิตช์ด้านล่าง)"
          : "ปิดการเช็คไว้ใน backend/.env (UPDATE_CHECK_REPO)"}
      </Text>
    );
  }

  const checkedAt = status.checked_at && (
    <Text type="secondary" style={{ fontSize: 12 }}>
      เช็คล่าสุด {dayjs(status.checked_at).format("DD/MM/YY HH:mm")}
    </Text>
  );
  const releaseLink = status.release_url && (
    <a href={status.release_url} target="_blank" rel="noopener noreferrer">
      release notes
    </a>
  );

  if (status.update_available) {
    return (
      <Space orientation="vertical" size={2}>
        <Space size={4} wrap>
          <Tag color={status.major_update ? "red" : "orange"}>v{status.latest_version}</Tag>
          <Text>มีเวอร์ชันใหม่</Text>
          {releaseLink}
        </Space>
        {status.major_update && (
          <Text type="danger">เป็น MAJOR — อ่าน upgrade notes ก่อนอัปเดต</Text>
        )}
        {checkedAt}
      </Space>
    );
  }

  return (
    <Space orientation="vertical" size={2}>
      <Space size={4} wrap>
        {status.latest_version && <Tag color="green">v{status.latest_version}</Tag>}
        <Text type={status.error ? "warning" : undefined}>
          {status.error ? UPDATE_CHECK_ERRORS[status.error] : "เป็นเวอร์ชันล่าสุดแล้ว"}
        </Text>
      </Space>
      {checkedAt}
    </Space>
  );
};

export default LatestRelease;
