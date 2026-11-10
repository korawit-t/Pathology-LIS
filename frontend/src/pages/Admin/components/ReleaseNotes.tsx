import React from "react";
import { Collapse, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { APP_VERSION } from "../../../constants/app.constants";
import { RELEASE_NOTES, type ReleaseNote } from "../../../constants/releaseNotes";

const { Paragraph, Text, Title } = Typography;

const SECTIONS: { key: "upgrade" | "added" | "fixed"; title: string; type?: "warning" }[] = [
  { key: "upgrade", title: "ก่อนอัปเดต", type: "warning" },
  { key: "added", title: "เพิ่ม" },
  { key: "fixed", title: "แก้ไข" },
];

const NoteBody: React.FC<{ note: ReleaseNote }> = ({ note }) => (
  <div>
    <Paragraph style={{ marginBottom: 12 }}>{note.summary}</Paragraph>
    {SECTIONS.map(({ key, title, type }) => {
      const items = note[key];
      if (!items?.length) return null;
      return (
        <div key={key} style={{ marginBottom: 12 }}>
          <Text strong type={type}>
            {title}
          </Text>
          <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {items.map((item) => (
              <li key={item} style={{ marginBottom: 4 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      );
    })}
  </div>
);

interface Props {
  /** The installed version; its entry opens first. */
  currentVersion?: string;
}

/** System Settings → About: what changed in each release, bundled with the build. */
const ReleaseNotes: React.FC<Props> = ({ currentVersion = APP_VERSION }) => {
  const known = RELEASE_NOTES.some((note) => note.version === currentVersion);
  const items = RELEASE_NOTES.map((note) => ({
    key: note.version,
    label: (
      <Space size={8} wrap>
        <Text strong>v{note.version}</Text>
        <Text type="secondary">{dayjs(note.date).format("DD/MM/YYYY")}</Text>
        {note.version === currentVersion && <Tag color="blue">เวอร์ชันนี้</Tag>}
      </Space>
    ),
    children: <NoteBody note={note} />,
  }));

  return (
    <div style={{ maxWidth: 640, marginTop: 32 }}>
      <Title level={5} style={{ marginBottom: 16 }}>
        Release notes
      </Title>
      <Collapse
        items={items}
        defaultActiveKey={[known ? currentVersion : RELEASE_NOTES[0].version]}
      />
    </div>
  );
};

export default ReleaseNotes;
