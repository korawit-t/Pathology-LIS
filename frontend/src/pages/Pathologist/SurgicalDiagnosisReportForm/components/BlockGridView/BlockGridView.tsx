import React, { useState, useEffect, useCallback } from "react";
import {
  Space,
  Typography,
  Tooltip,
  Spin,
  Tag,
  Popconfirm,
  Table,
  InputNumber,
  Input,
  Switch,
  Modal,
  message,
} from "antd";
import {
  ExperimentOutlined,
  DatabaseOutlined,
  EditOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import SurgicalBlockService from "../../../../../services/surgicalBlockService";
import { SurgicalBlock } from "../../../../../types/surgical";
import SurgicalBlockStainService from "../../../../../services/surgicalBlockStainService";
import StainManagementModal from "./StainManagementModal";
import styles from "./BlockGridView.module.css";
import logger from "../../../../../utils/logger";

const { Text } = Typography;

interface BlockGridViewProps {
  specimenId: number;
  defaultLabel: string;
  isEntirelySubmitted?: boolean;
  caseInfo?: {
    hn?: string;
    name?: string;
    clinician?: string;
    id_case?: string;
    accession_no?: string;
  };
}

const BlockGridView: React.FC<BlockGridViewProps> = ({
  specimenId,
  defaultLabel,
  isEntirelySubmitted,
  caseInfo,
}) => {
  const [blocks, setBlocks] = useState<SurgicalBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<SurgicalBlock | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: number; field: "tissue_count" | "tissue_description" } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [recutBlock, setRecutBlock] = useState<SurgicalBlock | null>(null);
  const [recutNote, setRecutNote] = useState("");
  const [recutLoading, setRecutLoading] = useState(false);

  const fetchBlocks = useCallback(async () => {
    if (!specimenId) return;
    setLoading(true);
    try {
      const res = await SurgicalBlockService.getBlocks({
        specimen_id: specimenId,
        limit: 100,
      });
      const allData = res.items || (Array.isArray(res) ? res : []);
      const filtered = allData.filter(
        (b: SurgicalBlock) =>
          b.specimen_label?.toString().toUpperCase() === defaultLabel.toUpperCase(),
      );
      setBlocks(filtered);
    } catch (err) {
      logger.error("Failed to fetch blocks", err);
    } finally {
      setLoading(false);
    }
  }, [specimenId, defaultLabel]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const handleBlockClick = (block: SurgicalBlock) => {
    setSelectedBlock(block);
    setIsModalOpen(true);
  };

  const startEdit = (block: SurgicalBlock, field: "tissue_count" | "tissue_description") => {
    setEditingCell({ id: block.id, field });
    setEditingValue(
      field === "tissue_count"
        ? String(block.tissue_count ?? "")
        : String(block.tissue_description ?? "")
    );
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const payload: { tissue_count?: number | null; tissue_description?: string | null } = {};
    if (field === "tissue_count") {
      payload.tissue_count = editingValue === "" ? null : Number(editingValue);
    } else {
      payload.tissue_description = editingValue || null;
    }
    try {
      await SurgicalBlockService.updateBlock(id, payload);
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...payload } : b)));
    } catch {
      message.error("Save failed");
    } finally {
      setEditingCell(null);
    }
  };

  const cancelEdit = () => setEditingCell(null);

  const handleRecutConfirm = async () => {
    if (!recutBlock) return;
    setRecutLoading(true);
    try {
      await SurgicalBlockStainService.createStain({
        block_id: recutBlock.id,
        test_id: null,
        slide_no: 1,
        is_recut: true,
        recut_note: recutNote || null,
      });
      message.success(`Recut requested for block ${defaultLabel}${recutBlock.block_no}`);
      setRecutBlock(null);
      setRecutNote("");
      fetchBlocks();
    } catch {
      message.error("Failed to request recut");
    } finally {
      setRecutLoading(false);
    }
  };

  const toggleUncountable = async (block: SurgicalBlock, next: boolean) => {
    try {
      await SurgicalBlockService.updateBlock(block.id, {
        is_tissue_uncountable: next,
        tissue_count: next ? null : block.tissue_count,
      });
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === block.id
            ? { ...b, is_tissue_uncountable: next, tissue_count: next ? null : b.tissue_count }
            : b
        )
      );
      if (next) setEditingCell(null);
    } catch {
      message.error("Save failed");
    }
  };

  const buildSubmittedText = (): string | null => {
    const sorted = [...blocks].sort((a, b) => Number(a.block_no) - Number(b.block_no));
    if (sorted.length === 0) return null;
    const prefix = isEntirelySubmitted
      ? "Entirely submitted"
      : "Representative sections are submitted";
    const parts = sorted.map((b) => {
      const code = `${defaultLabel}${b.block_no}`;
      const desc = (b.tissue_description || "").trim();
      if (b.is_tissue_uncountable)
        return desc ? `${code}(multiple fragments, ${desc})` : `${code}(multiple fragments)`;
      if (b.tissue_count && desc) return `${code}(${b.tissue_count}, ${desc})`;
      if (b.tissue_count) return `${code}(${b.tissue_count})`;
      if (desc) return `${code}(${desc})`;
      return code;
    });
    return `${prefix}: ${parts.join(", ")}`;
  };

  if (loading && blocks.length === 0) return <Spin size="small" />;
  if (blocks.length === 0) return null;

  const submittedPreview = buildSubmittedText();

  return (
    <div style={{ marginBottom: 16 }}>
      <Space style={{ marginBottom: 8 }}>
        <DatabaseOutlined style={{ color: "#8c8c8c" }} />
        <Text strong style={{ fontSize: "13px", color: "#000000" }}>
          Tissue Blocks {defaultLabel}
        </Text>
        <Tag color="blue" style={{ margin: 0 }}>{blocks.length} blocks</Tag>
        <Text type="secondary" style={{ fontSize: "13px", marginLeft: 0 }}>
          (Click a block to order Special Stain / IHC)
        </Text>
      </Space>

      {/* Submitted Sections preview */}
      {submittedPreview && (
        <div
          style={{
            marginBottom: 8,
            padding: "8px 12px",
            background: isEntirelySubmitted ? "#f6ffed" : "#fffbe6",
            border: `1px solid ${isEntirelySubmitted ? "#b7eb8f" : "#ffe58f"}`,
            borderRadius: 6,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>
            Submitted Sections (will appear in report)
          </Text>
          <Text style={{ fontSize: 13 }}>{submittedPreview}</Text>
        </div>
      )}

      {/* Block table */}
      <div style={{ position: "relative" }}>
        <Table
          size="small"
          pagination={false}
          scroll={{ y: 240 }}
          style={{ marginTop: 8 }}
          dataSource={[...blocks].sort((a, b) => Number(a.block_no) - Number(b.block_no))}
          rowKey="id"
          columns={[
            {
              title: "Block",
              key: "block",
              width: 80,
              render: (_: unknown, block: SurgicalBlock) => {
                const isProcessingDecal = block.is_decal && !block.decal_end_at;
                const isFinishedDecal = block.is_decal && block.decal_end_at;
                return (
                  <Tooltip title={`Click to manage stains for ${defaultLabel}${block.block_no}`}>
                    <div
                      className={`
                        ${styles.blockItem}
                        ${isProcessingDecal ? styles.isDecal : ""}
                        ${isFinishedDecal ? styles.decalFinished : ""}
                      `}
                      onClick={() => handleBlockClick(block)}
                    >
                      <span className={styles.blockText}>
                        {defaultLabel}{block.block_no}
                      </span>
                      {block.is_decal && (
                        <ExperimentOutlined className={styles.decalIconMini} />
                      )}
                      {block.stains && block.stains.length > 0 && (
                        <div className={styles.stainIndicator} />
                      )}
                    </div>
                  </Tooltip>
                );
              },
            },
            {
              title: "Count",
              key: "count",
              width: 220,
              render: (_: unknown, b: SurgicalBlock) => {
                const uncountable = !!b.is_tissue_uncountable;
                const isEditing = editingCell?.id === b.id && editingCell?.field === "tissue_count";
                return (
                  <Space size={8} align="center">
                    {!uncountable && (isEditing ? (
                      <InputNumber
                        size="small"
                        min={1}
                        max={999}
                        value={editingValue === "" ? undefined : Number(editingValue)}
                        onChange={(v) => setEditingValue(v == null ? "" : String(v))}
                        onPressEnter={saveEdit}
                        onBlur={saveEdit}
                        onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                        style={{ width: 70 }}
                        autoFocus
                      />
                    ) : (
                      <div
                        style={{ cursor: "pointer", minWidth: 32, color: b.tissue_count ? "inherit" : "#bfbfbf" }}
                        onClick={() => startEdit(b, "tissue_count")}
                      >
                        {b.tissue_count ?? <span style={{ fontSize: 11 }}>edit</span>}
                        {" "}<EditOutlined style={{ fontSize: 10, color: "#bfbfbf" }} />
                      </div>
                    ))}
                    <Popconfirm
                      title="Clear tissue count?"
                      description="Enabling TNTC will remove the count number."
                      okText="Yes"
                      cancelText="No"
                      disabled={uncountable || !b.tissue_count}
                      onConfirm={() => toggleUncountable(b, true)}
                    >
                      <Space size={4} align="center" style={{ cursor: "pointer" }}>
                        <Switch
                          size="small"
                          checked={uncountable}
                          onChange={(checked) => {
                            if (!checked) {
                              toggleUncountable(b, false);
                            }
                            // turning ON with existing count is handled by Popconfirm
                            // turning ON without existing count needs no confirmation
                            else if (!b.tissue_count) {
                              toggleUncountable(b, true);
                            }
                          }}
                        />
                        <span
                          style={{ fontSize: 11, color: uncountable ? "#d46b08" : "#bfbfbf", userSelect: "none" }}
                        >
                          TNTC
                        </span>
                      </Space>
                    </Popconfirm>
                  </Space>
                );
              },
            },
            {
              title: "Tissue Description",
              key: "desc",
              render: (_: unknown, b: SurgicalBlock) => {
                const isEditing = editingCell?.id === b.id && editingCell?.field === "tissue_description";
                if (isEditing) {
                  return (
                    <Input
                      size="small"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onPressEnter={saveEdit}
                      onBlur={saveEdit}
                      onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                      style={{ width: 200 }}
                      autoFocus
                    />
                  );
                }
                return (
                  <div
                    style={{ cursor: "pointer", minWidth: 40, color: b.tissue_description ? "inherit" : "#bfbfbf" }}
                    onClick={() => startEdit(b, "tissue_description")}
                  >
                    {b.tissue_description ?? <span style={{ fontSize: 11 }}>edit</span>}
                    {" "}<EditOutlined style={{ fontSize: 10, color: "#bfbfbf" }} />
                  </div>
                );
              },
            },
            {
              title: "",
              key: "recut",
              width: 80,
              render: (_: unknown, b: SurgicalBlock) => {
                const hasRecut = b.stains?.some((s) => s.is_recut);
                return (
                  <Tooltip title={hasRecut ? "Recut already requested" : "Request Recut"}>
                    <Tag
                      color={hasRecut ? "red" : "default"}
                      icon={<ScissorOutlined />}
                      style={{ cursor: hasRecut ? "default" : "pointer", fontSize: 11 }}
                      onClick={() => {
                        if (!hasRecut) {
                          setRecutBlock(b);
                          setRecutNote("");
                        }
                      }}
                    >
                      Recut
                    </Tag>
                  </Tooltip>
                );
              },
            },
          ]}
        />
        {blocks.length > 5 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 32,
              background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.85))",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {blocks.length > 5 && (
        <Text type="secondary" style={{ fontSize: 11, display: "block", textAlign: "center", marginTop: 2 }}>
          ↓ {blocks.length} blocks total — scroll to see all
        </Text>
      )}

      {/* Special Stain / IHC summary */}
      <div style={{ marginTop: 12 }}>
        {blocks.some((b) =>
          b.stains?.some(
            (s) =>
              s.test?.system_code !== "HE_ROUTINE" &&
              !s.test?.name?.includes("H&E"),
          ),
        ) && (
          <div
            style={{
              background: "#f8f9fa",
              padding: "10px",
              borderRadius: "8px",
              border: "1px dashed #d9d9d9",
            }}
          >
            <Space style={{ marginBottom: 8 }}>
              <ExperimentOutlined style={{ color: "#722ed1", fontSize: "12px" }} />
              <Text type="secondary" style={{ fontSize: "13px" }}>
                Special Stain / IHC in {defaultLabel}
              </Text>
            </Space>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {blocks
                .filter((b) =>
                  b.stains?.some(
                    (s) =>
                      s.test?.system_code !== "HE_ROUTINE" &&
                      !s.test?.name?.includes("H&E"),
                  ),
                )
                .sort((a, b) => Number(a.block_no) - Number(b.block_no))
                .map((block) => (
                  <div key={block.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ minWidth: "35px", marginTop: "2px" }}>
                      <Text strong style={{ fontSize: "13px", color: "#434343" }}>
                        {defaultLabel}{block.block_no}:
                      </Text>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {block.stains
                        .filter(
                          (s) =>
                            s.test?.system_code !== "HE_ROUTINE" &&
                            !s.test?.name?.includes("H&E"),
                        )
                        .map((s) =>
                          s.status === "pending" ? (
                            <Popconfirm
                              key={s.id}
                              title={`Remove "${s.test?.name || s.stain_name}"?`}
                              okText="Remove"
                              okButtonProps={{ danger: true }}
                              cancelText="Cancel"
                              onConfirm={async () => {
                                try {
                                  await SurgicalBlockStainService.deleteStain(s.id);
                                  message.success(`Removed ${s.test?.name || s.stain_name}`);
                                  fetchBlocks();
                                } catch {
                                  message.error("Failed to remove stain.");
                                }
                              }}
                            >
                              <Tooltip title="Click to remove (pending only)">
                                <Tag
                                  color="orange"
                                  closable
                                  onClose={(e) => e.preventDefault()}
                                  style={{
                                    fontSize: "13px",
                                    margin: 0,
                                    borderRadius: "10px",
                                    padding: "0 8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  {s.test?.name || s.stain_name}
                                </Tag>
                              </Tooltip>
                            </Popconfirm>
                          ) : (
                            <Tooltip
                              key={s.id}
                              title={`${s.test?.category || "Special"} | Status: ${s.status}`}
                            >
                              <Tag
                                color="green"
                                style={{
                                  fontSize: "13px",
                                  margin: 0,
                                  borderRadius: "10px",
                                  padding: "0 8px",
                                }}
                              >
                                {s.test?.name || s.stain_name}
                              </Tag>
                            </Tooltip>
                          ),
                        )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <StainManagementModal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        selectedBlock={selectedBlock}
        defaultLabel={defaultLabel}
        onSuccess={fetchBlocks}
        caseInfo={caseInfo}
      />

      <Modal
        title={
          <Space>
            <ScissorOutlined style={{ color: "#ff4d4f" }} />
            Request Recut — Block {defaultLabel}{recutBlock?.block_no}
          </Space>
        }
        open={!!recutBlock}
        onOk={handleRecutConfirm}
        onCancel={() => { setRecutBlock(null); setRecutNote(""); }}
        okText="Request Recut"
        okButtonProps={{ danger: true, loading: recutLoading }}
        cancelText="Cancel"
        destroyOnHidden
        width={420}
      >
        <p style={{ marginBottom: 8, color: "#595959" }}>
          A recut request will be sent to the histotech (Internal Stain Orders).
        </p>
        <Input.TextArea
          placeholder="Note for histotech (optional)..."
          rows={3}
          value={recutNote}
          onChange={(e) => setRecutNote(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default BlockGridView;
