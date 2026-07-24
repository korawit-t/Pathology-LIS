// frontend/src/pages/Admin/components/ScheduledNotificationRulesTab.tsx
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
import { SaveOutlined, ClockCircleOutlined } from "@ant-design/icons";
import ScheduledNotificationRuleService, {
  ScheduledNotificationRule,
  RULE_TYPE_LABELS,
} from "../../../services/scheduledNotificationRuleService";
import NotificationChannelService, {
  NotificationChannel,
} from "../../../services/notificationChannelService";

const { Text } = Typography;
const { TextArea } = Input;

interface RuleRow extends ScheduledNotificationRule {
  label: string;
  dirty?: boolean;
}

const PLATFORM_COLOR: Record<string, string> = {
  line: "green",
  slack: "purple",
  discord: "blue",
  custom: "default",
};

// Template placeholders available for each rule_type (mirrors NotificationRulesTab's EVENT_VARS pattern)
const RULE_VARS: Record<string, string[]> = {
  outlab_pending_visit_today: ["hn", "name", "case_id", "pending_count", "pending_items"],
};

const ScheduledNotificationRulesTab: React.FC = () => {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [rules, chs] = await Promise.all([
        ScheduledNotificationRuleService.getRules(),
        NotificationChannelService.getChannels(),
      ]);
      setChannels(chs);
      setRows(
        rules.map((r) => ({
          ...r,
          label: r.label ?? RULE_TYPE_LABELS[r.rule_type] ?? r.rule_type,
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

  const updateRow = (rule_type: string, changes: Partial<RuleRow>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rule_type === rule_type ? { ...r, ...changes, dirty: true } : r
      )
    );
  };

  const saveRow = async (row: RuleRow) => {
    setSaving((s) => ({ ...s, [row.rule_type]: true }));
    try {
      await ScheduledNotificationRuleService.upsertRule(row.rule_type, {
        channel_ids: row.channel_ids,
        is_active: row.is_active,
        threshold_value: row.threshold_value,
        threshold_unit: row.threshold_unit,
        message_template: row.message_template,
      });
      setRows((prev) =>
        prev.map((r) => r.rule_type === row.rule_type ? { ...r, dirty: false } : r)
      );
      message.success(`Saved "${row.label}" successfully`);
    } catch {
      message.error("Save failed");
    } finally {
      setSaving((s) => ({ ...s, [row.rule_type]: false }));
    }
  };

  const columns = [
    {
      title: "Check",
      key: "label",
      width: 220,
      render: (_: unknown, row: RuleRow) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.label}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.rule_type}</Text>
        </Space>
      ),
    },
    {
      title: "Channels",
      key: "channel_ids",
      width: 260,
      render: (_: unknown, row: RuleRow) => (
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={row.channel_ids ?? []}
          allowClear
          placeholder="— No notification —"
          onChange={(vals: number[]) => updateRow(row.rule_type, { channel_ids: vals.length ? vals : null })}
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
        const vars = RULE_VARS[row.rule_type] ?? [];
        return (
          <div>
            <TextArea
              rows={4}
              value={row.message_template ?? ""}
              onChange={(e) => updateRow(row.rule_type, { message_template: e.target.value })}
              style={{ fontFamily: "monospace", fontSize: 12 }}
              placeholder="Type a message, or click a variable below to insert it"
            />
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {vars.map((v) => (
                <Tag
                  key={v}
                  style={{ cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}
                  onClick={() =>
                    updateRow(row.rule_type, {
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
          onChange={(v) => updateRow(row.rule_type, { is_active: v })}
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
            loading={saving[row.rule_type]}
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
          <ClockCircleOutlined style={{ fontSize: 18, color: "#722ed1" }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Scheduled Alerts</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Time-based checks re-evaluated in the background — set channel(s) and a message template.
              How often the check itself runs is configured in Workflow &amp; SLA.
            </Text>
          </div>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="rule_type"
        loading={loading}
        pagination={false}
        size="middle"
      />
    </div>
  );
};

export default ScheduledNotificationRulesTab;
