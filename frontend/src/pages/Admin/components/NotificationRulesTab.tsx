// frontend/src/pages/Admin/components/NotificationRulesTab.tsx
import React, { useEffect, useState } from "react";
import {
  Table,
  Select,
  Switch,
  Button,
  Space,
  message,
  Tag,
  Tooltip,
  Typography,
  Input,
} from "antd";
import { SaveOutlined, BellOutlined } from "@ant-design/icons";
import NotificationRuleService, {
  NotificationRule,
  EVENT_LABELS,
} from "../../../services/notificationRuleService";
import NotificationChannelService, {
  NotificationChannel,
} from "../../../services/notificationChannelService";

const { Text } = Typography;
const { TextArea } = Input;

interface RuleRow extends NotificationRule {
  label: string;
  dirty?: boolean;
  channel_ids: number[] | null;
}

const PLATFORM_COLOR: Record<string, string> = {
  line: "green",
  slack: "purple",
  discord: "blue",
  custom: "default",
};

const EVENT_VARS: Record<string, string[]> = {
  stain_order_ihc:     ["id_case", "hn", "name", "clinician", "block", "count"],
  stain_order_special: ["id_case", "hn", "name", "block", "count"],
  malignancy_result:   ["id_case", "hn", "name", "clinician", "diagnosis"],
  critical_case:       ["id_case", "hn", "name", "clinician"],
  case_signed_out:     ["id_case", "hn", "name", "clinician"],
  outlab_consult:      ["id_case", "accession_no", "sender", "lab_name"],
};
const ALL_VARS = ["id_case", "hn", "name", "clinician", "block", "count", "diagnosis", "accession_no", "sender", "lab_name"];

const NotificationRulesTab: React.FC = () => {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [rules, chs] = await Promise.all([
        NotificationRuleService.getRules(),
        NotificationChannelService.getChannels(),
      ]);
      setChannels(chs);
      setRows(
        rules.map((r) => ({
          ...r,
          label: EVENT_LABELS[r.event_key] ?? r.event_key,
          channel_ids: r.channel_ids ?? (r.channel_id ? [r.channel_id] : null),
          dirty: false,
        }))
      );
    } catch {
      message.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRow = (event_key: string, changes: Partial<RuleRow>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.event_key === event_key ? { ...r, ...changes, dirty: true } : r
      )
    );
  };

  const saveRow = async (row: RuleRow) => {
    setSaving((s) => ({ ...s, [row.event_key]: true }));
    try {
      await NotificationRuleService.upsertRule(row.event_key, {
        channel_ids: row.channel_ids,
        is_active: row.is_active,
        message_template: row.message_template,
      });
      setRows((prev) =>
        prev.map((r) => r.event_key === row.event_key ? { ...r, dirty: false } : r)
      );
      message.success(`Saved "${row.label}" successfully`);
    } catch {
      message.error("Save failed");
    } finally {
      setSaving((s) => ({ ...s, [row.event_key]: false }));
    }
  };

  const columns = [
    {
      title: "Event",
      key: "label",
      width: 220,
      render: (_: unknown, row: RuleRow) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.label}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.event_key}</Text>
        </Space>
      ),
    },
    {
      title: "Channels",
      key: "channel_ids",
      width: 280,
      render: (_: unknown, row: RuleRow) => (
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={row.channel_ids ?? []}
          allowClear
          placeholder="— No notification —"
          onChange={(vals: number[]) => updateRow(row.event_key, { channel_ids: vals.length ? vals : null })}
          optionLabelProp="label"
        >
          {channels.map((ch) => (
            <Select.Option key={ch.id} value={ch.id} label={ch.name}>
              <Space>
                <Tag color={PLATFORM_COLOR[ch.platform] ?? "default"} style={{ margin: 0 }}>
                  {ch.platform.toUpperCase()}
                </Tag>
                {ch.name}
              </Space>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: "Message Template",
      key: "template",
      render: (_: unknown, row: RuleRow) => {
        const vars = EVENT_VARS[row.event_key] ?? ALL_VARS;
        return (
          <div>
            <TextArea
              rows={4}
              value={row.message_template ?? ""}
              onChange={(e) => updateRow(row.event_key, { message_template: e.target.value })}
              style={{ fontFamily: "monospace", fontSize: 12 }}
              placeholder="Type a message, or click a variable below to insert it"
            />
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {vars.map((v) => (
                <Tag
                  key={v}
                  style={{ cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}
                  onClick={() =>
                    updateRow(row.event_key, {
                      message_template: (row.message_template ?? "") + `{${v}}`,
                    })
                  }
                >
                  {`{${v}}`}
                </Tag>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      title: "Active",
      key: "is_active",
      width: 70,
      render: (_: unknown, row: RuleRow) => (
        <Switch
          checked={row.is_active}
          onChange={(v) => updateRow(row.event_key, { is_active: v })}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, row: RuleRow) => (
        <Tooltip title={row.dirty ? "Unsaved changes" : "No changes"}>
          <Button
            type={row.dirty ? "primary" : "default"}
            icon={<SaveOutlined />}
            loading={saving[row.event_key]}
            onClick={() => saveRow(row)}
            size="small"
          >
            Save
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <BellOutlined style={{ fontSize: 18, color: "#722ed1" }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Notification Rules</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Assign a channel and message template for each event — use {"{"}variable{"}"} placeholders
            </Text>
          </div>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="event_key"
        loading={loading}
        pagination={false}
        size="middle"
      />
    </div>
  );
};

export default NotificationRulesTab;
