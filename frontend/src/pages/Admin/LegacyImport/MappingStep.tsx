import React, { useMemo } from "react";
import { Divider, Input, Radio, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { Hospital } from "../../../types/hospital";
import type {
  LegacyFieldSource,
  LegacyInspectResult,
  LegacyTargetField,
} from "../../../services/legacyImportService";
import { FIXED_VALUE, GROUP_LABEL, GROUP_ORDER, isSet, sampleValues } from "./mappingUtils";

const { Text } = Typography;

const KIND_LABEL: Record<string, string> = {
  date: "วันที่",
  int: "ตัวเลข",
  bool: "ใช่/ไม่ใช่",
  longtext: "ข้อความยาว",
  full_name: "แยกชื่อให้",
  hospital: "จับคู่ รพ.",
};

interface Props {
  targets: LegacyTargetField[];
  inspect: LegacyInspectResult;
  fields: Record<string, LegacyFieldSource>;
  onFieldChange: (key: string, src: LegacyFieldSource | null) => void;
  sourceSystem: string;
  onSourceSystemChange: (v: string) => void;
  onDuplicate: "skip" | "update";
  onDuplicateChange: (v: "skip" | "update") => void;
  defaultHospitalId?: number | null;
  onDefaultHospitalChange: (id: number | null) => void;
  hospitals: Hospital[];
}

const MappingStep: React.FC<Props> = ({
  targets,
  inspect,
  fields,
  onFieldChange,
  sourceSystem,
  onSourceSystemChange,
  onDuplicate,
  onDuplicateChange,
  defaultHospitalId,
  onDefaultHospitalChange,
  hospitals,
}) => {
  const columnOptions = useMemo(
    () => [
      ...inspect.headers.map((h) => ({ value: h, label: h })),
      { value: FIXED_VALUE, label: "— ใส่ค่าเดียวกันทุกแถว —" },
    ],
    [inspect.headers],
  );

  const hospitalOptions = useMemo(
    () => hospitals.map((h) => ({ value: h.id, label: h.code ? `${h.name} (${h.code})` : h.name })),
    [hospitals],
  );

  const usedColumns = new Set(Object.values(fields).map((f) => f.column).filter(Boolean));
  const unusedColumns = inspect.headers.filter((h) => !usedColumns.has(h));

  const groups = GROUP_ORDER.map((g) => ({ group: g, items: targets.filter((t) => t.group === g) })).filter(
    (g) => g.items.length > 0,
  );

  const columns = [
    {
      title: "ช่องในระบบ",
      key: "label",
      width: "34%",
      render: (_: unknown, f: LegacyTargetField) => (
        <Space size={4} wrap>
          <Text>
            {f.label}
            {f.required && <Text type="danger"> *</Text>}
          </Text>
          {KIND_LABEL[f.kind] && <Tag style={{ marginInlineEnd: 0 }}>{KIND_LABEL[f.kind]}</Tag>}
          {f.help && (
            <Tooltip title={f.help}>
              <InfoCircleOutlined style={{ color: "#8c8c8c" }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "คอลัมน์ในไฟล์",
      key: "source",
      width: "36%",
      render: (_: unknown, f: LegacyTargetField) => {
        const src = fields[f.key];
        const fixed = !!src && !src.column && src.value != null;
        return (
          <Space orientation="vertical" size={4} style={{ width: "100%" }}>
            <Select
              data-testid={`map-${f.key}`}
              style={{ width: "100%" }}
              placeholder="ไม่ใช้"
              allowClear
              showSearch={{ optionFilterProp: "label" }}
              options={columnOptions}
              value={fixed ? FIXED_VALUE : src?.column ?? undefined}
              onChange={(v?: string) => {
                if (!v) onFieldChange(f.key, null);
                else if (v === FIXED_VALUE) onFieldChange(f.key, { value: "" });
                else onFieldChange(f.key, { column: v });
              }}
              status={f.required && !isSet(src) ? "warning" : undefined}
            />
            {fixed && (
              <Input
                size="small"
                placeholder="ค่าที่ใช้กับทุกแถว"
                value={src?.value ?? ""}
                onChange={(e) => onFieldChange(f.key, { value: e.target.value })}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: "ตัวอย่างค่าในไฟล์",
      key: "sample",
      render: (_: unknown, f: LegacyTargetField) => {
        const values = sampleValues(inspect, fields[f.key]?.column);
        if (!values.length) return <Text type="secondary">—</Text>;
        return (
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: values.join(" | ") }}>
            {values.join(" | ")}
          </Text>
        );
      },
    },
  ];

  return (
    <div>
      <Space wrap size={24} style={{ marginBottom: 8 }}>
        <Space orientation="vertical" size={2}>
          <Text strong>
            ชื่อระบบเดิม <Text type="danger">*</Text>
          </Text>
          <Input
            data-testid="source-system"
            style={{ width: 260 }}
            maxLength={50}
            placeholder="เช่น LIS เดิม 2558"
            value={sourceSystem}
            onChange={(e) => onSourceSystemChange(e.target.value)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            ใช้ชื่อเดิมทุกครั้งที่นำเข้าจากระบบเดียวกัน ระบบจึงรู้ว่าแถวไหนนำเข้าไปแล้ว
          </Text>
        </Space>
        <Space orientation="vertical" size={2}>
          <Text strong>ถ้าเจอแถวที่เคยนำเข้าแล้ว</Text>
          <Radio.Group value={onDuplicate} onChange={(e) => onDuplicateChange(e.target.value)}>
            <Radio value="skip">ข้าม</Radio>
            <Radio value="update">อัปเดตทับด้วยค่าในไฟล์นี้</Radio>
          </Radio.Group>
        </Space>
        <Space orientation="vertical" size={2}>
          <Text strong>โรงพยาบาลค่าเริ่มต้น</Text>
          <Select
            style={{ width: 280 }}
            allowClear
            placeholder="ไม่ระบุ"
            showSearch={{ optionFilterProp: "label" }}
            options={hospitalOptions}
            value={defaultHospitalId ?? undefined}
            onChange={(v?: number) => onDefaultHospitalChange(v ?? null)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            ใช้กับแถวที่ไม่มีโรงพยาบาลในไฟล์
          </Text>
        </Space>
      </Space>

      {groups.map(({ group, items }) => (
        <div key={group}>
          <Divider titlePlacement="start" style={{ marginTop: 16 }}>
            {GROUP_LABEL[group] ?? group}
          </Divider>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={items}
            columns={columns}
          />
        </div>
      ))}

      {unusedColumns.length > 0 && (
        <Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 12 }}>
          คอลัมน์ที่ยังไม่ได้ใช้: {unusedColumns.join(", ")}
        </Text>
      )}
    </div>
  );
};

export default MappingStep;
