import React, { useEffect, useState } from "react";
import { Modal, Row, Col, Typography, Button, Input, Select, Tag, Space, Popconfirm, message } from "antd";
import { PlusOutlined, CheckOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from "@ant-design/icons";
import StainPanelService, { StainPanel } from "../../../../../services/stainPanelService";
import type { AnatomicalPathologyTest } from "../../../../../services/anatomicalTestService";

const { Text } = Typography;
const { Search } = Input;

const CATEGORY_OPTIONS = [
  { value: "General", label: "General" },
  { value: "IHC", label: "IHC" },
  { value: "Special Stain", label: "Special Stain" },
  { value: "Mixed", label: "Mixed" },
  { value: "Lymphoma", label: "Lymphoma" },
  { value: "Breast", label: "Breast" },
  { value: "Lung", label: "Lung" },
  { value: "GI", label: "GI" },
  { value: "Soft Tissue", label: "Soft Tissue" },
  { value: "Neuroendocrine", label: "Neuroendocrine" },
];

interface ManageStainPanelsModalProps {
  open: boolean;
  onClose: () => void;
  panels: StainPanel[];
  setPanels: React.Dispatch<React.SetStateAction<StainPanel[]>>;
  stainOrderTests: AnatomicalPathologyTest[];
}

const ManageStainPanelsModal: React.FC<ManageStainPanelsModalProps> = ({
  open,
  onClose,
  panels,
  setPanels,
  stainOrderTests,
}) => {
  const [editingPanel, setEditingPanel] = useState<Partial<StainPanel> | null>(null);
  const [editingTestIds, setEditingTestIds] = useState<number[]>([]);
  const [panelTestSearch, setPanelTestSearch] = useState("");
  const [panelSaving, setPanelSaving] = useState(false);

  // Always reopen to the blank "select or create" view
  useEffect(() => {
    if (open) {
      setEditingPanel(null);
      setEditingTestIds([]);
      setPanelTestSearch("");
    }
  }, [open]);

  const openNewPanel = () => {
    setEditingPanel({ name: "", category: "General", description: "" });
    setEditingTestIds([]);
    setPanelTestSearch("");
  };
  const openEditPanel = (panel: StainPanel) => {
    setEditingPanel(panel);
    setEditingTestIds(panel.items.map((i) => i.test_id));
    setPanelTestSearch("");
  };

  const handleSavePanel = async () => {
    if (!editingPanel?.name?.trim()) { message.warning("Panel name is required."); return; }
    setPanelSaving(true);
    try {
      if (editingPanel.id) {
        const updated = await StainPanelService.updatePanel(editingPanel.id, { name: editingPanel.name, category: editingPanel.category, description: editingPanel.description, test_ids: editingTestIds });
        setPanels((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await StainPanelService.createPanel({ name: editingPanel.name!, category: editingPanel.category ?? "General", description: editingPanel.description, test_ids: editingTestIds });
        setPanels((prev) => [...prev, created]);
      }
      setEditingPanel(null); setEditingTestIds([]);
      message.success("Panel saved.");
    } catch { message.error("Failed to save panel."); } finally { setPanelSaving(false); }
  };

  const handleDeletePanel = async (panelId: number) => {
    try {
      await StainPanelService.deletePanel(panelId);
      setPanels((prev) => prev.filter((p) => p.id !== panelId));
      message.success("Panel deleted.");
    } catch { message.error("Failed to delete panel."); }
  };

  return (
    <Modal
      title={<Space><SettingOutlined style={{ color: "#1677ff" }} /><span>Manage Stain Panels</span></Space>}
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      zIndex={1200}
      destroyOnHidden
    >
      <Row gutter={16} style={{ minHeight: 420 }}>
        <Col span={10} style={{ borderRight: "1px solid #f0f0f0", paddingRight: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Panels</Text>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openNewPanel} ghost>New Panel</Button>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {panels.length === 0 ? <Text type="secondary" style={{ fontSize: 13 }}>No panels yet.</Text> : panels.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: 4, borderRadius: 6, border: editingPanel?.id === p.id ? "1px solid #91caff" : "1px solid #f0f0f0", background: editingPanel?.id === p.id ? "#e6f4ff" : "#fafafa" }}>
                <div>
                  <Text style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{p.items.length} tests</Text>
                    {p.category && p.category !== "General" && <Tag color="blue" style={{ fontSize: 10, marginLeft: 4, padding: "0 4px" }}>{p.category}</Tag>}
                  </div>
                </div>
                <Space size={4}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditPanel(p)} />
                  <Popconfirm title={`Delete "${p.name}"?`} okText="Delete" okButtonProps={{ danger: true }} cancelText="Cancel" onConfirm={() => handleDeletePanel(p.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </div>
        </Col>
        <Col span={14} style={{ paddingLeft: 16 }}>
          {editingPanel === null ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8c8c8c" }}>
              <Text type="secondary">Select a panel to edit, or create a new one.</Text>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Text strong style={{ fontSize: 13 }}>{editingPanel.id ? "Edit Panel" : "New Panel"}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Name *</Text>
                <Input value={editingPanel.name ?? ""} onChange={(e) => setEditingPanel((prev) => ({ ...prev!, name: e.target.value }))} placeholder="e.g. Lymphoma Panel" size="small" />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Category</Text>
                <Select value={editingPanel.category ?? "General"} onChange={(v) => setEditingPanel((prev) => ({ ...prev!, category: v }))} size="small" style={{ width: "100%" }} options={CATEGORY_OPTIONS} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Description / Note</Text>
                <Input.TextArea value={editingPanel.description ?? ""} onChange={(e) => setEditingPanel((prev) => ({ ...prev!, description: e.target.value }))} placeholder="e.g. Use for diffuse large B-cell lymphoma workup" size="small" rows={2} style={{ resize: "none" }} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Tests in panel</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{editingTestIds.length} selected</Text>
                </div>
                {editingTestIds.length > 0 && (
                  <div style={{ background: "#e6f4ff", border: "1px dashed #91caff", borderRadius: 6, padding: "6px 8px", marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {editingTestIds.map((id) => {
                      const t = stainOrderTests.find((x) => x.id === id);
                      return t ? <Tag key={id} color="blue" closable onClose={() => setEditingTestIds((prev) => prev.filter((x) => x !== id))} style={{ fontSize: 11, borderRadius: 8, margin: 0 }}>{t.name}</Tag> : null;
                    })}
                  </div>
                )}
                <Search placeholder="Search tests..." value={panelTestSearch} onChange={(e) => setPanelTestSearch(e.target.value)} size="small" allowClear style={{ marginBottom: 4 }} />
                <div style={{ height: 180, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4 }}>
                  {stainOrderTests.filter((t) => t.name.toLowerCase().includes(panelTestSearch.toLowerCase())).map((t) => {
                    const selected = editingTestIds.includes(t.id);
                    const catLabel = t.category === "Histochem" ? "SS" : t.category;
                    return (
                      <div key={t.id} onClick={() => setEditingTestIds((prev) => selected ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", marginBottom: 2, borderRadius: 5, cursor: "pointer", background: selected ? "#bae0ff" : "transparent", border: selected ? "1px solid #91caff" : "1px solid transparent" }}
                      >
                        <Space size={5}>
                          {selected ? <CheckOutlined style={{ color: "#1677ff", fontSize: 11 }} /> : <PlusOutlined style={{ fontSize: 11, color: "#bfbfbf" }} />}
                          <Text style={{ fontSize: 12 }}>{t.name}</Text>
                        </Space>
                        <Tag style={{ fontSize: 10, margin: 0, padding: "0 4px" }}>{catLabel}</Tag>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Button type="primary" size="small" loading={panelSaving} onClick={handleSavePanel} style={{ background: "#1677ff", border: "none" }}>Save Panel</Button>
                <Button size="small" onClick={() => { setEditingPanel(null); setEditingTestIds([]); }}>Cancel</Button>
              </div>
            </div>
          )}
        </Col>
      </Row>
    </Modal>
  );
};

export default ManageStainPanelsModal;
