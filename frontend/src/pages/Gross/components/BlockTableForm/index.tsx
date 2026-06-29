import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  message,
  Tooltip,
  Popconfirm,
  Space,
  Typography,
  InputNumber,
  Input,
  Tag,
  Segmented,
} from "antd";
import {
  CloseOutlined,
  CopyOutlined,
  ExperimentOutlined,
  PlusOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

import SurgicalBlockService from "../../../../services/surgicalBlockService";
import DecalFormModal from "../DecalFormModal";
import { SurgicalBlock } from "../../../../types/surgical";
import { useAuth } from "../../../../contexts/AuthContext";

interface BlockUser {
  id: number;
  username: string;
  full_name?: string;
}

interface BlockTableFormProps {
  specimenId: number;
  defaultLabel: string;
  users?: BlockUser[];
  refreshKey?: number;
  onBlocksChange?: (blocks: SurgicalBlock[]) => void;
}

type EditingCell = { id: number; field: "tissue_count" | "tissue_description" };

const BlockTableForm: React.FC<BlockTableFormProps> = ({
  specimenId,
  defaultLabel,
  users,
  refreshKey,
  onBlocksChange,
}) => {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<SurgicalBlock[]>([]);
  const [addAmount, setAddAmount] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [isDecalModalOpen, setIsDecalModalOpen] = useState<boolean>(false);
  const [selectedBlock, setSelectedBlock] = useState<SurgicalBlock | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  const fetchBlocks = async () => {
    if (!specimenId) return;
    setLoading(true);
    try {
      const res = await SurgicalBlockService.getBlocks({ specimen_id: specimenId, limit: 100 });
      const all: SurgicalBlock[] = res.items || (Array.isArray(res) ? res : []);
      const filtered = all.filter(
        (b) => b.specimen_label?.toString().toUpperCase() === defaultLabel.toUpperCase()
      );
      const sorted = filtered.sort((a, b) => Number(a.block_no) - Number(b.block_no));
      setBlocks(sorted);
      onBlocksChange?.(sorted);
    } catch {
      message.error("Failed to load blocks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBlocks(); }, [specimenId, defaultLabel, refreshKey]);

  const maxBlockNo = blocks.reduce((max, b) => Math.max(max, Number(b.block_no)), 0);
  const createBlock = async (no: number) => {
    setLoading(true);
    try {
      await SurgicalBlockService.createBlock({ specimen_id: specimenId, specimen_label: defaultLabel, block_no: String(no) });
      message.success(`Saved: ${defaultLabel}${no}`);
      fetchBlocks();
    } catch {
      message.error(`Failed to save ${defaultLabel}${no}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteBlock = async (block: SurgicalBlock) => {
    setLoading(true);
    try {
      await SurgicalBlockService.deleteBlock(block.id);
      message.success(`Deleted: ${defaultLabel}${block.block_no}`);
      fetchBlocks();
    } catch {
      message.error("Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMultiple = async () => {
    setLoading(true);
    try {
      for (let i = 1; i <= addAmount; i++) {
        await SurgicalBlockService.createBlock({
          specimen_id: specimenId,
          specimen_label: defaultLabel,
          block_no: String(maxBlockNo + i),
        });
      }
      message.success(`Added ${addAmount} block(s) to ${defaultLabel}`);
      setAddAmount(1);
      fetchBlocks();
    } catch {
      message.error("Failed to add blocks");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (block: SurgicalBlock, field: EditingCell["field"]) => {
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
    const payload: Partial<Pick<SurgicalBlock, "tissue_count" | "tissue_description">> = {};
    if (field === "tissue_count") {
      payload.tissue_count = editingValue === "" ? null : Number(editingValue);
    } else {
      payload.tissue_description = editingValue || null;
    }
    try {
      await SurgicalBlockService.updateBlock(id, payload);
      setBlocks((prev) => {
        const updated = prev.map((b) => (b.id === id ? { ...b, ...payload } : b));
        onBlocksChange?.(updated);
        return updated;
      });
    } catch {
      message.error("Save failed");
    } finally {
      setEditingCell(null);
    }
  };

  const cancelEdit = () => setEditingCell(null);

  const unfixedBlocks = blocks.filter((b) => !b.is_fixing);

  const handleSetAllFixing = async () => {
    if (!unfixedBlocks.length) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        unfixedBlocks.map((b) =>
          SurgicalBlockService.updateBlock(b.id, {
            is_fixing: true,
            fix_start_at: now,
            fix_start_by_id: user?.id ?? null,
          })
        )
      );
      message.success(`Set all blocks in Part ${defaultLabel} to Fixing`);
      fetchBlocks();
    } catch {
      message.error("Failed to update");
    } finally {
      setLoading(false);
    }
  };

  const toggleUncountable = async (block: SurgicalBlock, next: boolean) => {
    try {
      await SurgicalBlockService.updateBlock(block.id, {
        is_tissue_uncountable: next,
        tissue_count: next ? null : block.tissue_count,
      });
      setBlocks((prev) => {
        const updated = prev.map((b) =>
          b.id === block.id
            ? { ...b, is_tissue_uncountable: next, tissue_count: next ? null : b.tissue_count }
            : b
        );
        onBlocksChange?.(updated);
        return updated;
      });
      if (next) setEditingCell(null);
    } catch {
      message.error("Save failed");
    }
  };

  const copyFromPrev = async (block: SurgicalBlock) => {
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx <= 0) return;
    const prev = blocks[idx - 1];
    const payload = {
      tissue_count: prev.tissue_count,
      tissue_description: prev.tissue_description,
      is_tissue_uncountable: prev.is_tissue_uncountable,
    };
    try {
      await SurgicalBlockService.updateBlock(block.id, payload);
      setBlocks((prevBlocks) => {
        const updated = prevBlocks.map((b) => (b.id === block.id ? { ...b, ...payload } : b));
        onBlocksChange?.(updated);
        return updated;
      });
      message.success(`คัดลอกจาก ${defaultLabel}${prev.block_no}`);
    } catch {
      message.error("คัดลอกไม่สำเร็จ");
    }
  };

  // ── Inline editable cell renderer ────────────────────────────────────────────
  const EditableCell = (block: SurgicalBlock, field: EditingCell["field"]) => {
    const isEditing = editingCell?.id === block.id && editingCell?.field === field;
    const value = field === "tissue_count"
      ? block.tissue_count
      : block.tissue_description;

    if (field === "tissue_count") {
      const uncountable = !!block.is_tissue_uncountable;
      return (
        <Space size={8} align="center">
          <Segmented
            size="small"
            value={uncountable ? "tntc" : "count"}
            options={[
              { label: "Count", value: "count" },
              { label: "TNTC", value: "tntc" },
            ]}
            onChange={(val) => toggleUncountable(block, val === "tntc")}
          />
          {uncountable ? (
            <Tag color="orange" style={{ margin: 0 }}>Too numerous to count</Tag>
          ) : (
            isEditing ? (
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
                onClick={() => startEdit(block, "tissue_count")}
                style={{
                  cursor: "text",
                  width: 70,
                  padding: "1px 7px",
                  background: "#fff",
                  border: `1px solid ${value == null ? "#ff4d4f" : "#d9d9d9"}`,
                  borderRadius: 6,
                  fontSize: 14,
                  lineHeight: "22px",
                  color: value != null ? "inherit" : "#ff4d4f",
                }}
              >
                {value != null ? value : "#"}
              </div>
            )
          )}
        </Space>
      );
    }

    if (isEditing) {
      return (
        <Input
          size="small"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onPressEnter={saveEdit}
          onBlur={saveEdit}
          onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
          style={{ width: "100%" }}
          autoFocus
        />
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div
          onClick={() => startEdit(block, field)}
          style={{
            cursor: "text",
            flex: 1,
            padding: "1px 7px",
            background: "#fff",
            border: "1px solid #d9d9d9",
            borderRadius: 6,
            fontSize: 14,
            lineHeight: "22px",
            color: value ? "inherit" : "#bfbfbf",
          }}
        >
          {value ?? "—"}
        </div>
        {(() => {
          const idx = blocks.findIndex((b) => b.id === block.id);
          if (idx <= 0) return null;
          return (
            <Tooltip title={`คัดลอก count + description จาก ${defaultLabel}${blocks[idx - 1].block_no}`}>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined style={{ color: "#8c8c8c" }} />}
                onClick={() => copyFromPrev(block)}
              />
            </Tooltip>
          );
        })()}
      </div>
    );
  };

  const columns = [
    {
      title: "Block",
      key: "block_code",
      width: 70,
      render: (_: unknown, block: SurgicalBlock) => {
        const isProcessingDecal = block.is_decal && !block.decal_end_at;
        const isFinishedDecal = block.is_decal && block.decal_end_at;
        return (
          <Tooltip title={`Click to manage Decal — ${defaultLabel}${block.block_no}`}>
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 32,
                borderRadius: 4,
                border: `1px solid ${isProcessingDecal ? "#ffd591" : isFinishedDecal ? "#b7eb8f" : "#d9d9d9"}`,
                background: isProcessingDecal ? "#fff7e6" : isFinishedDecal ? "#f6ffed" : "#ffffff",
                color: isProcessingDecal ? "#d46b08" : isFinishedDecal ? "#389e0d" : "#1890ff",
                fontWeight: "bold",
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.2s ease",
                userSelect: "none",
              }}
              onClick={() => { setSelectedBlock(block); setIsDecalModalOpen(true); }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
                if (!isProcessingDecal && !isFinishedDecal) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#1890ff";
                  (e.currentTarget as HTMLDivElement).style.background = "#e6f7ff";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                (e.currentTarget as HTMLDivElement).style.borderColor = isProcessingDecal ? "#ffd591" : isFinishedDecal ? "#b7eb8f" : "#d9d9d9";
                (e.currentTarget as HTMLDivElement).style.background = isProcessingDecal ? "#fff7e6" : isFinishedDecal ? "#f6ffed" : "#ffffff";
              }}
            >
              {defaultLabel}{block.block_no}
              {block.is_decal && (
                <ExperimentOutlined
                  style={{
                    position: "absolute",
                    bottom: 1,
                    right: 2,
                    fontSize: 9,
                    color: isProcessingDecal ? "#fa8c16" : "#52c41a",
                  }}
                />
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Tissue Count",
      key: "tissue_count",
      width: 280,
      render: (_: unknown, block: SurgicalBlock) => EditableCell(block, "tissue_count"),
    },
    {
      title: "Tissue Description",
      key: "tissue_description",
      render: (_: unknown, block: SurgicalBlock) => EditableCell(block, "tissue_description"),
    },
    {
      title: "Status",
      key: "flags",
      width: 90,
      render: (_: unknown, block: SurgicalBlock) => (
        <Space size={4}>
          {block.is_fixing && (
            <Tooltip title="Extended Fixation"><Tag color="orange">🧪 Fix</Tag></Tooltip>
          )}
          {block.is_decal && !block.decal_end_at && (
            <Tooltip title="Decal Processing"><Tag color="blue">🦴 Decal</Tag></Tooltip>
          )}
          {block.is_decal && block.decal_end_at && (
            <Tooltip title="Decal Finished"><Tag color="default">🦴 Done</Tag></Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "",
      key: "delete",
      width: 48,
      render: (_: unknown, block: SurgicalBlock) => (
        <Popconfirm title="Delete this block?" onConfirm={() => deleteBlock(block)} okButtonProps={{ danger: true }}>
          <Button type="text" danger size="small" icon={<CloseOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      {/* ── Header bar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Space>
          <Text strong style={{ fontSize: 14 }}>Tissue Blocks {defaultLabel}</Text>
          {blocks.length > 0 && (
            <Text style={{ fontSize: 11, color: "#bfbfbf" }}>Click block to manage Decal</Text>
          )}
          {unfixedBlocks.length > 0 && (
            <Popconfirm
              title="Confirm Fixation Request"
              description={`Set ${unfixedBlocks.length} unfixed block${unfixedBlocks.length > 1 ? "s" : ""} in Part ${defaultLabel} to Extended Fixation?`}
              onConfirm={handleSetAllFixing}
              okText="Confirm"
              cancelText="Cancel"
              icon={<ExperimentOutlined style={{ color: "#d46b08" }} />}
            >
              <Tooltip title="Mark all as Extended Fixation">
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  loading={loading}
                  style={{ background: "#fffbe6", borderColor: "#ffe58f", color: "#d46b08" }}
                >
                  Request fix all
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
        <Space.Compact>
          <InputNumber
            min={1} max={50}
            value={addAmount}
            onChange={(v) => setAddAmount(v || 1)}
            onPressEnter={handleAddMultiple}
            style={{ width: 60 }}
            size="small"
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAddMultiple}
            loading={loading}
          >
            Add
          </Button>
        </Space.Compact>
      </div>

      {/* ── Block table ─────────────────────────────────────────────────────────── */}
      <Table
        dataSource={blocks}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: "No blocks yet — click Add to create one" }}
        bordered
      />

      <DecalFormModal
        open={isDecalModalOpen}
        block={selectedBlock}
        users={users}
        onClose={() => { setIsDecalModalOpen(false); setSelectedBlock(null); }}
        onSuccess={(updated) => {
          setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          setSelectedBlock(updated);
        }}
      />
    </div>
  );
};

export default BlockTableForm;
