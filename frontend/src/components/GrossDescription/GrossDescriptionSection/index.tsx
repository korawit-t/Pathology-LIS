import React, { useEffect, useState } from "react";
import { Form, Typography, Empty, Tag, Space, Button, Modal, Switch, message } from "antd";
import { HistoryOutlined, LayoutOutlined, CheckCircleOutlined } from "@ant-design/icons";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import SurgicalBlockService from "../../../services/surgicalBlockService";
import dayjs from "dayjs";

import GrossTemplateSystem from "../../../pages/Gross/components/GrossTemplateSystem";
import SimpleTiptapEditor from "../../Editors/SimpleTiptapEditor";
import BlockTableForm from "../../../pages/Gross/components/BlockTableForm";
import StyledCard from "../../Layout/StyledCard";
import { SurgicalSpecimen, SurgicalBlock } from "../../../types/surgical";

interface GrossUser {
  id: number;
  username: string;
  full_name?: string;
}

const { Text } = Typography;

interface GrossDescriptionSectionProps {
  specimens: SurgicalSpecimen[];
  editorUpdateKey: number;
  onTemplateUpdate: (
    newText: string,
    mode: "replace" | "append",
    specimenId: number,
  ) => void;
  users: GrossUser[];
}

const GrossDescriptionSection: React.FC<GrossDescriptionSectionProps> = ({
  specimens,
  editorUpdateKey,
  onTemplateUpdate,
  users,
}) => {
  const form = Form.useFormInstance();

  const [submittedMap, setSubmittedMap] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(specimens.map((s) => [s.id, s.is_entirely_submitted ?? false]))
  );

  // specimens can arrive after this component's first mount (e.g. parent loads them
  // asynchronously), so fill in any entries missed by the initial state above.
  useEffect(() => {
    setSubmittedMap((prev) => {
      let changed = false;
      const next = { ...prev };
      specimens.forEach((s) => {
        if (!(s.id in next)) {
          next[s.id] = s.is_entirely_submitted ?? false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [specimens]);

  const [blockRefreshMap, setBlockRefreshMap] = useState<Record<number, number>>({});
  const bumpBlockRefresh = (specId: number) =>
    setBlockRefreshMap((prev) => ({ ...prev, [specId]: (prev[specId] ?? 0) + 1 }));

  const [blocksMap, setBlocksMap] = useState<Record<number, SurgicalBlock[]>>({});

  const buildSubmittedText = (specId: number, specLabel: string): string | null => {
    const blocks = blocksMap[specId];
    if (!blocks || blocks.length === 0) return null;
    const prefix = submittedMap[specId] ? "Entirely submitted" : "Representative sections are submitted";

    // Group blocks by tissue_description, storing full block objects
    const groupMap = new Map<string, typeof blocks>();
    blocks.forEach((b) => {
      const desc = (b.tissue_description || "").trim();
      if (!groupMap.has(desc)) groupMap.set(desc, []);
      groupMap.get(desc)!.push(b);
    });

    const parts = Array.from(groupMap.entries()).map(([desc, groupBlocks]) => {
      // Sort by block_no numerically within each group
      const sorted = [...groupBlocks].sort((a, b) => {
        const na = parseInt(String(a.block_no), 10) || 0;
        const nb = parseInt(String(b.block_no), 10) || 0;
        return na - nb;
      });

      // Build code parts, collapsing consecutive TNTC runs into ranges
      const codeParts: string[] = [];
      let i = 0;
      while (i < sorted.length) {
        const b = sorted[i];
        if (b.is_tissue_uncountable) {
          // Extend run while next block is also TNTC and has consecutive block_no
          let j = i + 1;
          while (j < sorted.length && sorted[j].is_tissue_uncountable) {
            const prevNo = parseInt(String(sorted[j - 1].block_no), 10);
            const currNo = parseInt(String(sorted[j].block_no), 10);
            if (currNo !== prevNo + 1) break;
            j++;
          }
          if (j - i > 1) {
            // Range: A1-A2 (multiple fragments)
            codeParts.push(`${specLabel}${sorted[i].block_no}-${sorted[j - 1].block_no} (multiple fragments)`);
          } else {
            // Single TNTC block
            codeParts.push(`${specLabel}${b.block_no} (multiple fragments)`);
          }
          i = j;
        } else {
          const code = `${specLabel}${b.block_no}`;
          if (b.tissue_count) codeParts.push(`${code}(${b.tissue_count})`);
          else codeParts.push(code);
          i++;
        }
      }

      const codesStr = codeParts.join(" ");
      return desc ? `${codesStr} ${desc}` : codesStr;
    });

    return `${prefix}: ${parts.join(", ")}.`;
  };

  const toggleAllSubmitted = async (specId: number) => {
    const next = !submittedMap[specId];
    setSubmittedMap((prev) => ({ ...prev, [specId]: next }));
    try {
      await SurgicalCaseService.updateSpecimenGross(specId, { is_entirely_submitted: next });
    } catch {
      setSubmittedMap((prev) => ({ ...prev, [specId]: !next }));
      message.error("Failed to save");
    }
  };

  const [templateModal, setTemplateModal] = useState<{
    open: boolean;
    specimenId: number | null;
    specimenLabel: string;
  }>({
    open: false,
    specimenId: null,
    specimenLabel: "",
  });

  // เรียงลำดับชิ้นเนื้อตาม Label (A1, A2, B1...)
  const sortedSpecimens = [...specimens].sort((a, b) =>
    a.specimen_label.localeCompare(b.specimen_label, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  if (sortedSpecimens.length === 0) {
    return (
      <StyledCard
        style={{ marginTop: 24, textAlign: "center", borderStyle: "dashed" }}
      >
        <Empty description="กรุณาเพิ่มชิ้นเนื้อในส่วน Specimen Management ก่อน" />
      </StyledCard>
    );
  }

  return (
    <div style={{ marginTop: 0 }}>
      {sortedSpecimens.map((spec, index) => (
        <div
          key={spec.id}
          id={`gross-spec-${spec.id}`}
          style={{
            marginBottom: 16,
            background: "#ffffff",
            borderRadius: "8px",
            border: "1px solid #f0f0f0",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
            scrollMarginTop: "120px",
          }}
        >
          {/* 1. Header: แถบสีเทาช่วยแยกชิ้นเนื้อ */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              background: "#fafafa",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <Space size="middle">
              <Tag
                color="blue"
                bordered={false}
                style={{ fontWeight: "bold", fontSize: "14px", margin: 0 }}
              >
                {spec.specimen_label}
              </Tag>
              <Text strong style={{ fontSize: "16px" }}>
                {spec.specimen_name}
              </Text>
            </Space>

            <Space size="middle" align="center">
              {spec.updated_at && (
                <span style={{ fontSize: 11, color: "#bfbfbf" }}>
                  <HistoryOutlined style={{ marginRight: 4 }} />
                  {dayjs(spec.updated_at).format("DD/MM/YYYY HH:mm")}
                  {spec.updated_by_user && ` · ${spec.updated_by_user.full_name}`}
                </span>
              )}
              <Button
                type="primary"
                ghost
                size="small"
                icon={<LayoutOutlined />}
                onClick={() =>
                  setTemplateModal({
                    open: true,
                    specimenId: spec.id,
                    specimenLabel: spec.specimen_label,
                  })
                }
              >
                Templates
              </Button>
            </Space>
          </div>

          {/* 2. Body: เนื้อหาหลัก */}
          <div style={{ padding: "20px" }}>
            <Form.Item
              name={["gross_descriptions", spec.id]}
              style={{ marginBottom: 8 }}
            >
              <SimpleTiptapEditor
                value={form.getFieldValue(["gross_descriptions", spec.id])}
                key={`${spec.id}-${editorUpdateKey}`}
                onChange={(content) =>
                  form.setFieldValue(["gross_descriptions", spec.id], content)
                }
                placeholder={`Describe gross findings for ${spec.specimen_label}...`}
              />
            </Form.Item>

            {/* All submitted — toggle + insert grouped */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
                padding: "4px 10px",
                border: "1px solid #d9d9d9",
                borderRadius: 6,
                background: submittedMap[spec.id] ? "#f6ffed" : "#fafafa",
                cursor: "pointer",
              }}
              onClick={() => toggleAllSubmitted(spec.id)}
            >
              <Switch
                size="small"
                checked={submittedMap[spec.id] ?? false}
                onClick={(_checked, e) => e.stopPropagation()}
                onChange={() => toggleAllSubmitted(spec.id)}
                checkedChildren={<CheckCircleOutlined />}
              />
              <Text
                style={{
                  fontSize: 13,
                  color: submittedMap[spec.id] ? "#52c41a" : "#595959",
                  userSelect: "none",
                  fontWeight: submittedMap[spec.id] ? 600 : 400,
                }}
              >
                Entirely submitted
              </Text>
            </div>


            {/* Submitted Sections preview */}
            {(() => {
              const preview = buildSubmittedText(spec.id, spec.specimen_label);
              if (!preview) return null;
              return (
                <div
                  style={{
                    marginBottom: 8,
                    padding: "8px 12px",
                    background: submittedMap[spec.id] ? "#f6ffed" : "#fffbe6",
                    border: `1px solid ${submittedMap[spec.id] ? "#b7eb8f" : "#ffe58f"}`,
                    borderRadius: 6,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>
                    Submitted Sections (will appear in report)
                  </Text>
                  <Text style={{ fontSize: 13 }}>{preview}</Text>
                </div>
              );
            })()}

            {/* 3. Block Section */}
            <div
              style={{
                marginTop: 0,
                padding: "12px 16px",
                background: "#f5f5f5",
                borderRadius: "6px",
                border: "1px solid #d9d9d9",
              }}
            >
              <BlockTableForm
                specimenId={spec.id}
                defaultLabel={spec.specimen_label}
                users={users}
                refreshKey={blockRefreshMap[spec.id] ?? 0}
                onBlocksChange={(blocks) =>
                  setBlocksMap((prev) => ({ ...prev, [spec.id]: blocks }))
                }
              />
            </div>
          </div>
        </div>
      ))}

      {/* Modal Template (เหมือนเดิม) */}
      <Modal
        title={
          <Space>
            <LayoutOutlined style={{ color: "#1890ff" }} />
            <span>Select Gross Template:</span>
            <Tag color="blue" bordered={false}>
              {templateModal.specimenLabel}
            </Tag>
          </Space>
        }
        open={templateModal.open}
        onCancel={() => setTemplateModal({ ...templateModal, open: false })}
        footer={null}
        width={850}
        centered
        destroyOnClose
      >
        <div style={{ padding: "8px 0" }}>
          <GrossTemplateSystem
            onFinishedText={async (text, mode, blocks) => {
              if (!templateModal.specimenId) return;
              onTemplateUpdate(text, mode, templateModal.specimenId);

              // Create blocks from template
              if (blocks && blocks.length > 0) {
                const res = await SurgicalBlockService.getBlocks({
                  specimen_id: templateModal.specimenId,
                  limit: 100,
                });
                const existing: SurgicalBlock[] = res.items || (Array.isArray(res) ? res : []);
                const maxNo = existing
                  .filter((b) =>
                    b.specimen_label?.toString().toUpperCase() ===
                    templateModal.specimenLabel.toUpperCase(),
                  )
                  .reduce((m, b) => Math.max(m, Number(b.block_no)), 0);

                for (let i = 0; i < blocks.length; i++) {
                  const blk = blocks[i];
                  await SurgicalBlockService.createBlock({
                    specimen_id: templateModal.specimenId,
                    specimen_label: templateModal.specimenLabel,
                    block_no: String(maxNo + i + 1),
                    tissue_count: blk.is_tissue_uncountable ? null : (blk.tissue_count ?? null),
                    is_tissue_uncountable: blk.is_tissue_uncountable ?? false,
                    tissue_description: blk.tissue_description ?? null,
                  });
                }
                bumpBlockRefresh(templateModal.specimenId);
              }

              setTemplateModal({ ...templateModal, open: false });
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default GrossDescriptionSection;
