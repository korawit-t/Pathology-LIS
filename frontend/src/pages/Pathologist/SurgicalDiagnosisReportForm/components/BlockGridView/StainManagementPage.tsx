import logger from "../../../../../utils/logger";
import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  Modal,
  Space,
  Typography,
  Tag,
  Button,
  message,
  Table,
  Popconfirm,
  Input,
  Row,
  Col,
  Timeline,
  Spin,
  Select,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ExperimentOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  DeploymentUnitOutlined,
  ExportOutlined,
  ImportOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  SettingOutlined,
  EditOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import StainPanelService, { StainPanel } from "../../../../../services/stainPanelService";
import dayjs from "dayjs";
import SurgicalBlockStainService from "../../../../../services/surgicalBlockStainService";
import { MolecularCaseService, MolecularCaseResponse } from "../../../../../services/molecularCaseService";
import AnatomicalPathologyTestService, { AnatomicalPathologyTest } from "../../../../../services/anatomicalTestService";
import NotificationRuleService from "../../../../../services/notificationRuleService";
import { SurgicalBlock } from "../../../../../types/surgical";
import { BlockTimelineService, BlockTimelineEntry } from "../../../../../services/blockTimelineService";

const { Text } = Typography;
const { Search } = Input;

const DOT_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  GROSSED:              { color: "#52c41a", icon: <CheckCircleOutlined /> },
  PROCESSING_IN:        { color: "#1677ff", icon: <InboxOutlined /> },
  PROCESSING_OUT:       { color: "#1677ff", icon: <InboxOutlined /> },
  EMBEDDED:             { color: "#1677ff", icon: <DeploymentUnitOutlined /> },
  SECTIONED:            { color: "#13c2c2", icon: <ExperimentOutlined /> },
  STAINED:              { color: "#eb2f96", icon: <ExperimentOutlined /> },
  STORED:               { color: "#fa8c16", icon: <InboxOutlined /> },
  SENT_TO_OUTLAB:       { color: "#f5222d", icon: <ExportOutlined /> },
  RETURNED_FROM_OUTLAB: { color: "#52c41a", icon: <ImportOutlined /> },
  NOTE:                 { color: "#8c8c8c", icon: <FileTextOutlined /> },
};

interface StainRecord {
  id: number;
  slide_no?: number;
  stain_type?: string;
  stain_name?: string;
  status: string;
  test?: { id?: number; name?: string; system_code?: string; category?: string; is_external?: boolean };
}

interface StagedItem {
  testId: number;
  name: string;
  category: string;
  isExternal: boolean;
  price: number;
}

interface StainManagementPageProps {
  open: boolean;
  onCancel: () => void;
  selectedBlock: SurgicalBlock | null;
  defaultLabel: string;
  onSuccess: () => void;
  caseInfo?: {
    hn?: string;
    name?: string;
    clinician?: string;
    id_case?: string;
    accession_no?: string;
  };
}

const STATUS_COLOR: Record<string, string> = {
  pending: "orange",
  processing: "blue",
  completed: "green",
  cancelled: "default",
};

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

const StainManagementPage: React.FC<StainManagementPageProps> = ({
  open,
  onCancel,
  selectedBlock,
  defaultLabel,
  onSuccess,
  caseInfo,
}) => {
  const [masterTests, setMasterTests] = useState<AnatomicalPathologyTest[]>([]);
  const [stains, setStains] = useState<StainRecord[]>([]);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [allSearch, setAllSearch] = useState("");
  const [ihcSearch, setIhcSearch] = useState("");
  const [specialSearch, setSpecialSearch] = useState("");
  const [ishSearch, setIshSearch] = useState("");
  const [molecularSearch, setMolecularSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<BlockTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [panels, setPanels] = useState<StainPanel[]>([]);
  const [panelSearch, setPanelSearch] = useState("");
  const [isManagePanelOpen, setIsManagePanelOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<Partial<StainPanel> | null>(null);
  const [editingTestIds, setEditingTestIds] = useState<number[]>([]);
  const [panelTestSearch, setPanelTestSearch] = useState("");
  const [panelSaving, setPanelSaving] = useState(false);

  const fetchTimeline = async (blockId: number) => {
    setTimelineLoading(true);
    try {
      const [timelineData, allRuns] = await Promise.all([
        BlockTimelineService.getTimeline(blockId),
        SurgicalBlockStainService.getOutlabRuns({ limit: 500 }),
      ]);
      type RunDetail = { block_id?: number; stain_order?: { block_id?: number; test?: { name?: string } } };
      const outlabEntries: BlockTimelineEntry[] = [];
      for (const run of allRuns) {
        const involved = (run.details ?? []).some(
          (d: RunDetail) => d.block_id === blockId || d.stain_order?.block_id === blockId,
        );
        if (!involved) continue;
        const stainNames = (run.details ?? [])
          .filter((d: RunDetail) => d.block_id === blockId || d.stain_order?.block_id === blockId)
          .map((d: RunDetail) => d.stain_order?.test?.name ?? "")
          .filter(Boolean).join(", ");
        const trackingNote = run.tracking_number ? `Tracking: ${run.tracking_number}` : undefined;
        outlabEntries.push({ event_type: "SENT_TO_OUTLAB", source: "auto", label: `Sent to Outlab${stainNames ? ` — ${stainNames}` : ""}`, location: run.destination_lab, note: trackingNote, event_at: run.sent_at } as BlockTimelineEntry);
        if (run.status === "received" && run.received_at) {
          outlabEntries.push({ event_type: "RETURNED_FROM_OUTLAB", source: "auto", label: `Returned from Outlab${stainNames ? ` — ${stainNames}` : ""}`, location: run.destination_lab, note: trackingNote, event_at: run.received_at } as BlockTimelineEntry);
        }
      }
      const merged = [...timelineData, ...outlabEntries].sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());
      setTimeline(merged);
    } catch { /* supplementary */ } finally { setTimelineLoading(false); }
  };

  useEffect(() => {
    if (open) {
      AnatomicalPathologyTestService.getAllTests().then((res) => setMasterTests(res.data || [])).catch((e) => logger.error(e));
      setStains(selectedBlock?.stains || []);
      setStaged([]);
      setActiveTab("all");
      setAllSearch(""); setIhcSearch(""); setSpecialSearch(""); setIshSearch(""); setMolecularSearch("");
      setPanelSearch("");
      setTimeline([]);
      if (selectedBlock?.id) fetchTimeline(selectedBlock.id);
      StainPanelService.getPanels().then(setPanels).catch(() => {});
    }
  }, [open, selectedBlock]);

  // Lock body scroll when page is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const stagedIds = useMemo(() => new Set(staged.map((s) => s.testId)), [staged]);

  const ihcTests = useMemo(() => masterTests.filter((t) => t.category === "IHC"), [masterTests]);
  const specialTests = useMemo(() => masterTests.filter((t) => (t.category === "Histochem" || t.category === "Special Stain") && !t.name.includes("H&E")), [masterTests]);
  const ishTests = useMemo(() => masterTests.filter((t) => t.category === "ISH"), [masterTests]);
  const molecularTests = useMemo(() => masterTests.filter((t) => t.category === "Molecular"), [masterTests]);
  const stainOrderTests = useMemo(() => masterTests.filter((t) => t.category !== "Surgical Pathology"), [masterTests]);

  const filteredAll      = stainOrderTests.filter((t) => t.name.toLowerCase().includes(allSearch.toLowerCase()));
  const filteredIhc      = ihcTests.filter((t) => t.name.toLowerCase().includes(ihcSearch.toLowerCase()));
  const filteredSpecial  = specialTests.filter((t) => t.name.toLowerCase().includes(specialSearch.toLowerCase()));
  const filteredIsh      = ishTests.filter((t) => t.name.toLowerCase().includes(ishSearch.toLowerCase()));
  const filteredMolecular = molecularTests.filter((t) => t.name.toLowerCase().includes(molecularSearch.toLowerCase()));

  const toggleStaged = (test: AnatomicalPathologyTest) => {
    if (stagedIds.has(test.id)) {
      setStaged((prev) => prev.filter((s) => s.testId !== test.id));
    } else {
      setStaged((prev) => [...prev, { testId: test.id, name: test.name, category: test.category, isExternal: test.is_external, price: test.price_tier_1 }]);
    }
    setAllSearch("");
    if (test.category === "IHC") setIhcSearch("");
    else if (test.category === "Histochem" || test.category === "Special Stain") setSpecialSearch("");
    else if (test.category === "ISH") setIshSearch("");
    else if (test.category === "Molecular") setMolecularSearch("");
  };

  const applyPanel = (panel: StainPanel) => {
    const toAdd = panel.items.map((item) => item.test).filter((t) => t && !stagedIds.has(t.id));
    if (toAdd.length === 0) { message.info("All tests in this panel are already staged."); return; }
    setStaged((prev) => [...prev, ...toAdd.map((t) => ({ testId: t.id, name: t.name, category: t.category, isExternal: t.is_external ?? false, price: t.price_tier_1 ?? 0 }))]);
    message.success(`Added ${toAdd.length} test(s) from "${panel.name}"`);
  };

  const openNewPanel = () => { setEditingPanel({ name: "", category: "General", description: "" }); setEditingTestIds([]); setPanelTestSearch(""); };
  const openEditPanel = (panel: StainPanel) => { setEditingPanel(panel); setEditingTestIds(panel.items.map((i) => i.test_id)); setPanelTestSearch(""); };

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

  const handleDelete = async (stainId: number) => {
    setDeletingId(stainId);
    try {
      await SurgicalBlockStainService.deleteStain(stainId);
      setStains((prev) => prev.filter((s) => s.id !== stainId));
      message.success("Stain order removed.");
    } catch { message.error("Failed to remove stain."); } finally { setDeletingId(null); }
  };

  const handleOrder = async () => {
    if (staged.length === 0) return;
    setSubmitting(true);
    try {
      const slideStart = stains.length > 0 ? Math.max(...stains.map((s) => s.slide_no || 0)) + 1 : 1;
      const results = await Promise.all(
        staged.map((item, index) => SurgicalBlockStainService.createStain({ block_id: selectedBlock?.id, test_id: item.testId, slide_no: slideStart + index })),
      );
      setStains((prev) => [...prev, ...results]);
      setStaged([]);
      message.success(`Ordered ${results.length} stain(s) successfully.`);
      onSuccess();
      if (selectedBlock?.id) fetchTimeline(selectedBlock.id);

      const ihcItems = staged.filter((s) => s.category === "IHC");
      const specialItems = staged.filter((s) => s.category !== "IHC");
      const baseInfo = { hn: caseInfo?.hn ?? "-", name: caseInfo?.name ?? "-", clinician: caseInfo?.clinician ?? "-", id_case: caseInfo?.accession_no ?? caseInfo?.id_case ?? "-", block: `${defaultLabel}${selectedBlock?.block_no ?? ""}` };
      const notifyTasks: Promise<unknown>[] = [];
      if (ihcItems.length > 0) notifyTasks.push(NotificationRuleService.triggerEvent("stain_order_ihc", { ...baseInfo, tests: ihcItems.map((s) => s.name).join(", "), count: String(ihcItems.length) }));
      if (specialItems.length > 0) notifyTasks.push(NotificationRuleService.triggerEvent("stain_order_special", { ...baseInfo, tests: specialItems.map((s) => s.name).join(", "), count: String(specialItems.length) }));
      Promise.allSettled(notifyTasks).then((rs) => rs.forEach((r) => { if (r.status === "rejected") logger.warn("Notification trigger failed:", r.reason); }));

      // Ordering a Molecular test auto-creates its own M26- case server-side
      // (see crud/surgical_block_stain.py::create_stain) — look up its
      // accession by the stain id we just got back and surface it, since the
      // generic "Ordered N stain(s)" toast above gives no hint this happened.
      const molecularOrders = staged
        .map((item, index) => ({ item, result: results[index] }))
        .filter(({ item }) => item.category === "Molecular");
      if (molecularOrders.length > 0) {
        Promise.allSettled(
          molecularOrders.map(({ result }) => MolecularCaseService.getAll({ stain_id: result.id })),
        ).then((settled) => {
          const accessions = settled
            .filter((r): r is PromiseFulfilledResult<MolecularCaseResponse[]> => r.status === "fulfilled")
            .flatMap((r) => r.value)
            .map((c) => c.accession_no)
            .filter(Boolean);
          if (accessions.length > 0) message.success(`Molecular case(s) created: ${accessions.join(", ")}`);
        });
      }
    } catch (err) { logger.error("Order Error:", err); message.error("Failed to order stains. Please try again."); } finally { setSubmitting(false); }
  };

  const nonHeStains = stains.filter((s) => s.test?.system_code !== "HE_ROUTINE" && !s.test?.name?.includes("H&E"));

  const dbColumns: ColumnsType<StainRecord> = [
    { title: "Slide", dataIndex: "slide_no", key: "slide_no", width: 56, align: "center", render: (v) => <Text style={{ fontSize: 13 }}>{v ?? "—"}</Text> },
    {
      title: "Test Name", key: "name", render: (_, s) => (
        <Space size={4} wrap>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{s.test?.name || s.stain_name || "—"}</Text>
          {s.test?.is_external && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>OUTLAB</Tag>}
        </Space>
      ),
    },
    {
      title: "Cat.", key: "category", width: 64, render: (_, s) => {
        const cat = s.test?.category;
        return <Tag color={cat === "IHC" ? "purple" : "cyan"} style={{ fontSize: 11, margin: 0 }}>{cat === "Histochem" ? "SS" : cat || "—"}</Tag>;
      },
    },
    { title: "Status", dataIndex: "status", key: "status", width: 80, render: (status) => <Tag color={STATUS_COLOR[status] ?? "default"} style={{ fontSize: 11, margin: 0, textTransform: "capitalize" }}>{status}</Tag> },
    {
      title: "", key: "action", width: 36, render: (_, s) => s.status === "pending" ? (
        <Popconfirm
          title={`Remove "${s.test?.name || s.stain_name}"?`}
          description={
            s.test?.category === "Molecular"
              ? "This test has its own Molecular case (M26-...). Removing the order will cancel or delete that case too."
              : undefined
          }
          okText="Remove"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
          onConfirm={() => handleDelete(s.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} size="small" loading={deletingId === s.id} />
        </Popconfirm>
      ) : null,
    },
  ];

  const renderTestItem = (test: AnatomicalPathologyTest) => {
    const isStaged = stagedIds.has(test.id);
    return (
      <div key={test.id} onClick={() => toggleStaged(test)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", marginBottom: 2, borderRadius: 6, cursor: "pointer", background: isStaged ? "#bae0ff" : "transparent", border: isStaged ? "1px solid #91caff" : "1px solid transparent", transition: "background 0.15s" }}
      >
        <Space size={6}>
          {isStaged ? <CheckOutlined style={{ color: "#1677ff", fontSize: 12 }} /> : <PlusOutlined style={{ fontSize: 12, color: "#bfbfbf" }} />}
          <Text style={{ fontSize: 13 }}>{test.name}</Text>
          {test.is_external && <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: "0 4px" }}>OUTLAB</Tag>}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>{test.price_tier_1}.-</Text>
      </div>
    );
  };

  const timelineItems = timeline.map((entry, i) => {
    const dotCfg = DOT_CONFIG[entry.event_type];
    return {
      key: i,
      color: dotCfg?.color ?? "#8c8c8c",
      dot: dotCfg?.icon ? <span style={{ fontSize: 13, color: dotCfg.color }}>{dotCfg.icon}</span> : undefined,
      children: (
        <div style={{ paddingBottom: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: 500, display: "block" }}>{entry.label}</Text>
          {entry.location && <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{entry.location}</Text>}
          {entry.note && <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{entry.note}</Text>}
          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(entry.event_at).format("DD/MM/YY HH:mm")}</Text>
        </div>
      ),
    };
  });

  const tabDefs = [
    { key: "all",       label: `All (${stainOrderTests.length})`,        color: "#595959" },
    { key: "ihc",       label: `IHC (${ihcTests.length})`,               color: "#0958d9" },
    { key: "special",   label: `Special Stain (${specialTests.length})`, color: "#08979c" },
    { key: "ish",       label: `ISH (${ishTests.length})`,               color: "#d48806" },
    { key: "molecular", label: `Molecular (${molecularTests.length})`,   color: "#cc3300" },
    { key: "panels",    label: `Panels (${panels.length})`,              color: "#1677ff" },
  ];

  // Height: viewport - page header(56) - tab bar(~52) - search(32) - padding(32)
  const listH = "calc(100vh - 56px - 60px - 38px - 32px)";

  if (!open) return null;

  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1050, background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── Page Header ── */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 24px", borderBottom: "1px solid #f0f0f0", background: "#fff", flexShrink: 0, gap: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onCancel} style={{ fontWeight: 500 }}>
          Back
        </Button>
        <Space size={8}>
          <ExperimentOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            Stain Orders —{" "}
            {caseInfo?.accession_no && <Tag color="blue" style={{ fontSize: 14, marginRight: 6 }}>{caseInfo.accession_no}</Tag>}
            <span style={{ color: "#1677ff" }}>{defaultLabel}{selectedBlock?.block_no}</span>
          </span>
        </Space>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {caseInfo?.hn && (
            <Space size={6}>
              {caseInfo.hn && <Tag>{caseInfo.hn}</Tag>}
              {caseInfo.name && <Text type="secondary" style={{ fontSize: 13 }}>{caseInfo.name}</Text>}
            </Space>
          )}
          <Button icon={<ClockCircleOutlined />} onClick={() => setIsHistoryOpen(true)}>
            Block History
          </Button>
        </div>
      </div>

      {/* ── Page Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: Test selector */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", padding: "16px 20px", borderRight: "1px solid #f0f0f0", overflow: "hidden" }}>

          {/* Wrap tab nav */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, borderBottom: "1px solid #f0f0f0", paddingBottom: 8 }}>
            {tabDefs.map((t) => {
              const active = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  style={{ padding: "2px 10px", borderRadius: 4, border: active ? `1px solid ${t.color}` : "1px solid #d9d9d9", background: active ? t.color : "#fff", color: active ? "#fff" : "#595959", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", lineHeight: "22px", transition: "all 0.15s", whiteSpace: "nowrap" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === "all" && <>
            <Search placeholder="Search all tests..." value={allSearch} onChange={(e) => setAllSearch(e.target.value)} size="small" allowClear autoFocus style={{ marginBottom: 6 }} />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4, height: listH }}>
              {filteredAll.length > 0 ? filteredAll.map(renderTestItem) : <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No results.</Text>}
            </div>
          </>}
          {activeTab === "ihc" && <>
            <Search placeholder="Search IHC..." value={ihcSearch} onChange={(e) => setIhcSearch(e.target.value)} size="small" allowClear style={{ marginBottom: 6 }} />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4, height: listH }}>
              {filteredIhc.length > 0 ? filteredIhc.map(renderTestItem) : <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No results.</Text>}
            </div>
          </>}
          {activeTab === "special" && <>
            <Search placeholder="Search Special Stain..." value={specialSearch} onChange={(e) => setSpecialSearch(e.target.value)} size="small" allowClear style={{ marginBottom: 6 }} />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4, height: listH }}>
              {filteredSpecial.length > 0 ? filteredSpecial.map(renderTestItem) : <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No results.</Text>}
            </div>
          </>}
          {activeTab === "ish" && <>
            <Search placeholder="Search ISH / FISH / CISH..." value={ishSearch} onChange={(e) => setIshSearch(e.target.value)} size="small" allowClear style={{ marginBottom: 6 }} />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4, height: listH }}>
              {filteredIsh.length > 0 ? filteredIsh.map(renderTestItem) : <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No ISH tests available yet.</Text>}
            </div>
          </>}
          {activeTab === "molecular" && <>
            <Search placeholder="Search Molecular..." value={molecularSearch} onChange={(e) => setMolecularSearch(e.target.value)} size="small" allowClear style={{ marginBottom: 6 }} />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4, height: listH }}>
              {filteredMolecular.length > 0 ? filteredMolecular.map(renderTestItem) : <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No Molecular tests available yet.</Text>}
            </div>
          </>}
          {activeTab === "panels" && <>
            <Search placeholder="Search panels..." value={panelSearch} onChange={(e) => setPanelSearch(e.target.value)} size="small" allowClear style={{ marginBottom: 6 }} />
            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4, height: listH }}>
              {panels.filter((p) => p.name.toLowerCase().includes(panelSearch.toLowerCase())).length === 0 ? (
                <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No panels yet. Click "Manage Panels" to create one.</Text>
              ) : panels.filter((p) => p.name.toLowerCase().includes(panelSearch.toLowerCase())).map((panel) => (
                <div key={panel.id} onClick={() => applyPanel(panel)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: 4, borderRadius: 6, cursor: "pointer", border: "1px solid #f0f0f0", background: "#fafafa", transition: "background 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#bae0ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fafafa")}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Space size={6}><AppstoreOutlined style={{ color: "#1677ff", fontSize: 12 }} /><Text style={{ fontSize: 13, fontWeight: 500 }}>{panel.name}</Text></Space>
                    <Space size={4}>
                      {panel.category && panel.category !== "General" && <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: "0 4px" }}>{panel.category}</Tag>}
                      <Text type="secondary" style={{ fontSize: 11 }}>{panel.items.length} test{panel.items.length !== 1 ? "s" : ""}</Text>
                    </Space>
                    {panel.description && <Text type="secondary" style={{ fontSize: 11, color: "#8c8c8c" }}>{panel.description}</Text>}
                  </div>
                  <PlusOutlined style={{ color: "#bfbfbf", fontSize: 12 }} />
                </div>
              ))}
            </div>
            <Button size="small" icon={<SettingOutlined />} onClick={() => { setEditingPanel(null); setEditingTestIds([]); setIsManagePanelOpen(true); }} style={{ marginTop: 6, width: "100%" }}>
              Manage Panels
            </Button>
          </>}

        </div>

        {/* RIGHT: To Order (top) + Current Orders (bottom) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderLeft: "1px solid #f0f0f0", overflow: "hidden" }}>

          {/* TOP: To Order */}
          <div style={{ flexShrink: 0, borderBottom: "1px solid #f0f0f0", padding: "16px 20px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>To Order</Text>
              {staged.length > 0 && (
                <Tag color="blue" style={{ fontWeight: 600 }}>{staged.length} test{staged.length > 1 ? "s" : ""}</Tag>
              )}
            </div>

            {staged.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: "#bfbfbf" }}>
                <ExperimentOutlined style={{ fontSize: 18 }} />
                <Text type="secondary" style={{ fontSize: 13 }}>Click tests on the left to add them here</Text>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 130, overflowY: "auto", marginBottom: 10 }}>
                  {staged.map((item) => {
                    const catLabel = item.category === "Histochem" ? "SS" : item.category;
                    return (
                      <div key={item.testId}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px", borderRadius: 20, background: "#e6f4ff", border: "1px solid #91caff" }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: 500 }}>{item.name}</Text>
                        <Tag color={item.category === "IHC" ? "blue" : "cyan"} style={{ fontSize: 10, margin: 0, padding: "0 4px" }}>{catLabel}</Tag>
                        <Button
                          type="text" danger size="small" icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                          onClick={() => setStaged((prev) => prev.filter((s) => s.testId !== item.testId))}
                          style={{ width: 18, height: 18, minWidth: 0, padding: 0, flexShrink: 0 }}
                        />
                      </div>
                    );
                  })}
                </div>
                <Button
                  type="primary" block size="large" icon={<PlusOutlined />}
                  onClick={handleOrder} loading={submitting}
                  style={{ background: "#1677ff", border: "none", fontWeight: 600, fontSize: 15, height: 44 }}
                >
                  {`Confirm Order — ${staged.length} Test${staged.length > 1 ? "s" : ""}`}
                </Button>
              </>
            )}
          </div>

          {/* BOTTOM: Current Orders */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 20px", overflow: "hidden" }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Current Orders</Text>
            <Table
              dataSource={nonHeStains}
              columns={dbColumns}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: "calc(100vh - 56px - 220px - 48px - 32px)" }}
              locale={{ emptyText: <Text type="secondary" style={{ fontSize: 13 }}>No stains ordered yet.</Text> }}
            />
          </div>

        </div>

      </div>

      {/* ── Block History Modal ── */}
      <Modal
        title={<Space><ClockCircleOutlined style={{ color: "#8c8c8c" }} /><span>Block History — {defaultLabel}{selectedBlock?.block_no}</span></Space>}
        open={isHistoryOpen}
        onCancel={() => setIsHistoryOpen(false)}
        footer={null}
        width={480}
        zIndex={1200}
        destroyOnHidden
      >
        {timelineLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Spin size="small" /></div>
        ) : timeline.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 13 }}>No history yet.</Text>
        ) : (
          <div style={{ maxHeight: 500, overflowY: "auto", paddingRight: 4 }}>
            <Timeline items={timelineItems} />
          </div>
        )}
      </Modal>

      {/* ── Manage Panels Modal ── */}
      <Modal
        title={<Space><SettingOutlined style={{ color: "#1677ff" }} /><span>Manage Stain Panels</span></Space>}
        open={isManagePanelOpen}
        onCancel={() => { setIsManagePanelOpen(false); setEditingPanel(null); setEditingTestIds([]); }}
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

    </div>,
    document.body,
  );
};

export default StainManagementPage;
