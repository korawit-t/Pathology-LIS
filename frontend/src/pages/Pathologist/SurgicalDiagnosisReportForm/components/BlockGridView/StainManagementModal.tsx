import logger from "../../../../../utils/logger";
import React, { useState, useEffect, useMemo } from "react";
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
  Tabs,
  Row,
  Col,
  Timeline,
  Spin,
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
} from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalBlockStainService from "../../../../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService, { AnatomicalPathologyTest } from "../../../../../services/anatomicalTestService";
import NotificationRuleService from "../../../../../services/notificationRuleService";
import { SurgicalBlock } from "../../../../../types/surgical";
import {
  BlockTimelineService,
  BlockTimelineEntry,
} from "../../../../../services/blockTimelineService";

const { Text } = Typography;
const { Search } = Input;

const DOT_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  GROSSED:               { color: "#52c41a", icon: <CheckCircleOutlined /> },
  PROCESSING_IN:         { color: "#1677ff", icon: <InboxOutlined /> },
  PROCESSING_OUT:        { color: "#1677ff", icon: <InboxOutlined /> },
  EMBEDDED:              { color: "#722ed1", icon: <DeploymentUnitOutlined /> },
  SECTIONED:             { color: "#13c2c2", icon: <ExperimentOutlined /> },
  STAINED:               { color: "#eb2f96", icon: <ExperimentOutlined /> },
  STORED:                { color: "#fa8c16", icon: <InboxOutlined /> },
  SENT_TO_OUTLAB:        { color: "#f5222d", icon: <ExportOutlined /> },
  RETURNED_FROM_OUTLAB:  { color: "#52c41a", icon: <ImportOutlined /> },
  NOTE:                  { color: "#8c8c8c", icon: <FileTextOutlined /> },
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

interface StainManagementModalProps {
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

const StainManagementModal: React.FC<StainManagementModalProps> = ({
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
  const [allSearch, setAllSearch] = useState("");
  const [ihcSearch, setIhcSearch] = useState("");
  const [specialSearch, setSpecialSearch] = useState("");
  const [ishSearch, setIshSearch] = useState("");
  const [molecularSearch, setMolecularSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<BlockTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

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
          .filter(Boolean)
          .join(", ");

        const trackingNote = run.tracking_number ? `Tracking: ${run.tracking_number}` : undefined;

        outlabEntries.push({
          event_type: "SENT_TO_OUTLAB",
          source: "auto",
          label: `Sent to Outlab${stainNames ? ` — ${stainNames}` : ""}`,
          location: run.destination_lab,
          note: trackingNote,
          event_at: run.sent_at,
        } as BlockTimelineEntry);

        if (run.status === "received" && run.received_at) {
          outlabEntries.push({
            event_type: "RETURNED_FROM_OUTLAB",
            source: "auto",
            label: `Returned from Outlab${stainNames ? ` — ${stainNames}` : ""}`,
            location: run.destination_lab,
            note: trackingNote,
            event_at: run.received_at,
          } as BlockTimelineEntry);
        }
      }

      const merged = [...timelineData, ...outlabEntries].sort(
        (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
      );
      setTimeline(merged);
    } catch {
      // silently fail — history is supplementary
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      AnatomicalPathologyTestService.getAllTests()
        .then((res) => setMasterTests(res.data || []))
        .catch((e) => logger.error(e));
      setStains(selectedBlock?.stains || []);
      setStaged([]);
      setAllSearch("");
      setIhcSearch("");
      setSpecialSearch("");
      setIshSearch("");
      setMolecularSearch("");
      setTimeline([]);
      if (selectedBlock?.id) fetchTimeline(selectedBlock.id);
    }
  }, [open, selectedBlock]);

  const stagedIds = useMemo(() => new Set(staged.map((s) => s.testId)), [staged]);

  const ihcTests = useMemo(
    () => masterTests.filter((t) => t.category === "IHC"),
    [masterTests],
  );
  const specialTests = useMemo(
    () => masterTests.filter(
      (t) => (t.category === "Histochem" || t.category === "Special Stain") && !t.name.includes("H&E"),
    ),
    [masterTests],
  );
  const ishTests = useMemo(
    () => masterTests.filter((t) => t.category === "ISH"),
    [masterTests],
  );
  const molecularTests = useMemo(
    () => masterTests.filter((t) => t.category === "Molecular"),
    [masterTests],
  );

  const filteredAll      = masterTests.filter((t) => t.name.toLowerCase().includes(allSearch.toLowerCase()));
  const filteredIhc      = ihcTests.filter((t) => t.name.toLowerCase().includes(ihcSearch.toLowerCase()));
  const filteredSpecial  = specialTests.filter((t) => t.name.toLowerCase().includes(specialSearch.toLowerCase()));
  const filteredIsh      = ishTests.filter((t) => t.name.toLowerCase().includes(ishSearch.toLowerCase()));
  const filteredMolecular = molecularTests.filter((t) => t.name.toLowerCase().includes(molecularSearch.toLowerCase()));

  const toggleStaged = (test: AnatomicalPathologyTest) => {
    if (stagedIds.has(test.id)) {
      setStaged((prev) => prev.filter((s) => s.testId !== test.id));
    } else {
      setStaged((prev) => [
        ...prev,
        {
          testId: test.id,
          name: test.name,
          category: test.category,
          isExternal: test.is_external,
          price: test.price_tier_1,
        },
      ]);
    }
    setAllSearch("");
    if (test.category === "IHC") setIhcSearch("");
    else if (test.category === "Histochem" || test.category === "Special Stain") setSpecialSearch("");
    else if (test.category === "ISH") setIshSearch("");
    else if (test.category === "Molecular") setMolecularSearch("");
  };

  const handleDelete = async (stainId: number) => {
    setDeletingId(stainId);
    try {
      await SurgicalBlockStainService.deleteStain(stainId);
      setStains((prev) => prev.filter((s) => s.id !== stainId));
      message.success("Stain order removed.");
      onSuccess();
    } catch {
      message.error("Failed to remove stain.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOrder = async () => {
    if (staged.length === 0) return;
    setSubmitting(true);
    try {
      const slideStart =
        stains.length > 0 ? Math.max(...stains.map((s) => s.slide_no || 0)) + 1 : 1;

      const results = await Promise.all(
        staged.map((item, index) =>
          SurgicalBlockStainService.createStain({
            block_id: selectedBlock?.id,
            test_id: item.testId,
            slide_no: slideStart + index,
          }),
        ),
      );

      const newStains = results;
      setStains((prev) => [...prev, ...newStains]);
      setStaged([]);
      message.success(`Ordered ${results.length} stain(s) successfully.`);
      onSuccess();
      if (selectedBlock?.id) fetchTimeline(selectedBlock.id);

      const ihcItems = staged.filter((s) => s.category === "IHC");
      const specialItems = staged.filter((s) => s.category !== "IHC");
      const baseInfo = {
        hn: caseInfo?.hn ?? "-",
        name: caseInfo?.name ?? "-",
        clinician: caseInfo?.clinician ?? "-",
        id_case: caseInfo?.accession_no ?? caseInfo?.id_case ?? "-",
        block: `${defaultLabel}${selectedBlock?.block_no ?? ""}`,
      };
      const notifyTasks: Promise<unknown>[] = [];
      if (ihcItems.length > 0) {
        notifyTasks.push(
          NotificationRuleService.triggerEvent("stain_order_ihc", {
            ...baseInfo,
            tests: ihcItems.map((s) => s.name).join(", "),
            count: String(ihcItems.length),
          }),
        );
      }
      if (specialItems.length > 0) {
        notifyTasks.push(
          NotificationRuleService.triggerEvent("stain_order_special", {
            ...baseInfo,
            tests: specialItems.map((s) => s.name).join(", "),
            count: String(specialItems.length),
          }),
        );
      }
      Promise.allSettled(notifyTasks).then((results) => {
        results.forEach((r) => {
          if (r.status === "rejected") logger.warn("Notification trigger failed:", r.reason);
        });
      });
    } catch (err) {
      logger.error("Order Error:", err);
      message.error("Failed to order stains. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const nonHeStains = stains.filter(
    (s) => s.test?.system_code !== "HE_ROUTINE" && !s.test?.name?.includes("H&E"),
  );

  const dbColumns: ColumnsType<StainRecord> = [
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Slide</span>,
      dataIndex: "slide_no",
      key: "slide_no",
      width: 52,
      align: "center",
      render: (v) => <Text style={{ fontSize: 13 }}>{v ?? "—"}</Text>,
    },
    {
      title: "Test Name",
      key: "name",
      ellipsis: false,
      render: (_, s) => (
        <Space size={4} wrap>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>
            {s.test?.name || s.stain_name || "—"}
          </Text>
          {s.test?.is_external && (
            <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>OUTLAB</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Cat.",
      key: "category",
      width: 60,
      render: (_, s) => {
        const cat = s.test?.category;
        return (
          <Tag color={cat === "IHC" ? "purple" : "cyan"} style={{ fontSize: 11, margin: 0 }}>
            {cat === "Histochem" ? "SS" : cat || "—"}
          </Tag>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 76,
      render: (status) => (
        <Tag
          color={STATUS_COLOR[status] ?? "default"}
          style={{ fontSize: 11, margin: 0, textTransform: "capitalize" }}
        >
          {status}
        </Tag>
      ),
    },
    {
      title: "",
      key: "action",
      width: 36,
      render: (_, s) =>
        s.status === "pending" ? (
          <Popconfirm
            title={`Remove "${s.test?.name || s.stain_name}"?`}
            okText="Remove"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => handleDelete(s.id)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              loading={deletingId === s.id}
            />
          </Popconfirm>
        ) : null,
    },
  ];

  const renderTestItem = (test: AnatomicalPathologyTest) => {
    const isStaged = stagedIds.has(test.id);
    return (
      <div
        key={test.id}
        onClick={() => toggleStaged(test)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 10px",
          marginBottom: 2,
          borderRadius: 6,
          cursor: "pointer",
          background: isStaged ? "#f0e6ff" : "transparent",
          border: isStaged ? "1px solid #d3adf7" : "1px solid transparent",
          transition: "background 0.15s",
        }}
      >
        <Space size={6}>
          {isStaged ? (
            <CheckOutlined style={{ color: "#722ed1", fontSize: 12 }} />
          ) : (
            <PlusOutlined style={{ fontSize: 12, color: "#bfbfbf" }} />
          )}
          <Text style={{ fontSize: 13 }}>{test.name}</Text>
          {test.is_external && (
            <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: "0 4px" }}>
              OUTLAB
            </Tag>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {test.price_tier_1}.-
        </Text>
      </div>
    );
  };

  const timelineItems = timeline.map((entry, i) => {
    const dotCfg = DOT_CONFIG[entry.event_type];
    return {
      key: i,
      color: dotCfg?.color ?? "#8c8c8c",
      dot: dotCfg?.icon ? (
        <span style={{ fontSize: 13, color: dotCfg.color }}>{dotCfg.icon}</span>
      ) : undefined,
      children: (
        <div style={{ paddingBottom: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: 500, display: "block" }}>{entry.label}</Text>
          {entry.location && (
            <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{entry.location}</Text>
          )}
          {entry.note && (
            <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{entry.note}</Text>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>
            {dayjs(entry.event_at).format("DD/MM/YY HH:mm")}
          </Text>
        </div>
      ),
    };
  });

  return (
    <Modal
      title={
        <Space>
          <ExperimentOutlined style={{ color: "#722ed1", fontSize: 16 }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            Stain Orders —{" "}
            <span style={{ color: "#722ed1" }}>
              {defaultLabel}{selectedBlock?.block_no}
            </span>
          </span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={1200}
      destroyOnClose
      styles={{ body: { padding: "16px 24px" } }}
    >
      <Row gutter={16} style={{ minHeight: 480 }}>

        {/* ── LEFT: Test selector ── */}
        <Col span={8} style={{ display: "flex", flexDirection: "column" }}>
          <Tabs
            size="small"
            defaultActiveKey="all"
            style={{ flex: 1 }}
            items={[
              {
                key: "all",
                label: <Text style={{ fontSize: 13 }}>All ({masterTests.length})</Text>,
                children: (
                  <>
                    <Search
                      placeholder="Search all tests..."
                      value={allSearch}
                      onChange={(e) => setAllSearch(e.target.value)}
                      size="small"
                      allowClear
                      autoFocus
                      style={{ marginBottom: 6 }}
                    />
                    <div style={{ height: 360, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4 }}>
                      {filteredAll.length > 0 ? filteredAll.map(renderTestItem) : (
                        <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No results.</Text>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: "ihc",
                label: (
                  <Space size={4}>
                    <Tag color="purple" style={{ margin: 0 }}>IHC</Tag>
                    <Text style={{ fontSize: 13 }}>{ihcTests.length}</Text>
                  </Space>
                ),
                children: (
                  <>
                    <Search
                      placeholder="Search IHC..."
                      value={ihcSearch}
                      onChange={(e) => setIhcSearch(e.target.value)}
                      size="small"
                      allowClear
                      style={{ marginBottom: 6 }}
                    />
                    <div style={{ height: 360, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4 }}>
                      {filteredIhc.length > 0 ? filteredIhc.map(renderTestItem) : (
                        <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No results.</Text>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: "special",
                label: (
                  <Space size={4}>
                    <Tag color="cyan" style={{ margin: 0 }}>Special Stain</Tag>
                    <Text style={{ fontSize: 13 }}>{specialTests.length}</Text>
                  </Space>
                ),
                children: (
                  <>
                    <Search
                      placeholder="Search Special Stain..."
                      value={specialSearch}
                      onChange={(e) => setSpecialSearch(e.target.value)}
                      size="small"
                      allowClear
                      style={{ marginBottom: 6 }}
                    />
                    <div style={{ height: 360, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4 }}>
                      {filteredSpecial.length > 0 ? filteredSpecial.map(renderTestItem) : (
                        <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No results.</Text>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: "ish",
                label: (
                  <Space size={4}>
                    <Tag color="gold" style={{ margin: 0 }}>ISH</Tag>
                    <Text style={{ fontSize: 13 }}>{ishTests.length}</Text>
                  </Space>
                ),
                children: (
                  <>
                    <Search
                      placeholder="Search ISH / FISH / CISH..."
                      value={ishSearch}
                      onChange={(e) => setIshSearch(e.target.value)}
                      size="small"
                      allowClear
                      style={{ marginBottom: 6 }}
                    />
                    <div style={{ height: 360, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4 }}>
                      {filteredIsh.length > 0 ? filteredIsh.map(renderTestItem) : (
                        <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No ISH tests available yet.</Text>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: "molecular",
                label: (
                  <Space size={4}>
                    <Tag color="volcano" style={{ margin: 0 }}>Molecular</Tag>
                    <Text style={{ fontSize: 13 }}>{molecularTests.length}</Text>
                  </Space>
                ),
                children: (
                  <>
                    <Search
                      placeholder="Search Molecular..."
                      value={molecularSearch}
                      onChange={(e) => setMolecularSearch(e.target.value)}
                      size="small"
                      allowClear
                      style={{ marginBottom: 6 }}
                    />
                    <div style={{ height: 360, overflowY: "auto", border: "1px solid #f0f0f0", borderRadius: 6, padding: 4 }}>
                      {filteredMolecular.length > 0 ? filteredMolecular.map(renderTestItem) : (
                        <Text type="secondary" style={{ padding: "12px 8px", display: "block", fontSize: 13 }}>No Molecular tests available yet.</Text>
                      )}
                    </div>
                  </>
                ),
              },
            ]}
          />

          {/* Staged strip */}
          {staged.length > 0 && (
            <div style={{ background: "#f9f0ff", border: "1px dashed #d3adf7", borderRadius: 8, padding: "8px 10px", marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#722ed1", fontWeight: 600 }}>To order:</Text>
              {staged.map((item) => (
                <Tag
                  key={item.testId}
                  color="purple"
                  closable
                  onClose={() => setStaged((prev) => prev.filter((s) => s.testId !== item.testId))}
                  style={{ fontSize: 13, borderRadius: 10 }}
                >
                  {item.name}
                </Tag>
              ))}
            </div>
          )}

          <Button
            type="primary"
            block
            size="large"
            icon={<PlusOutlined />}
            onClick={handleOrder}
            loading={submitting}
            disabled={staged.length === 0}
            style={{
              marginTop: 10,
              background: staged.length > 0 ? "#722ed1" : undefined,
              border: "none",
              fontWeight: 600,
              fontSize: 15,
              height: 44,
            }}
          >
            {staged.length > 0
              ? `Confirm Order — ${staged.length} Test${staged.length > 1 ? "s" : ""}`
              : "Click tests to add them"}
          </Button>
        </Col>

        {/* ── MIDDLE: Current orders ── */}
        <Col span={9} style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #f0f0f0", paddingLeft: 20 }}>
          <Text
            type="secondary"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}
          >
            Current Orders
          </Text>
          <Table
            dataSource={nonHeStains}
            columns={dbColumns}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 420 }}
            locale={{
              emptyText: (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  No stains ordered yet.
                </Text>
              ),
            }}
          />
        </Col>

        {/* ── RIGHT: Block History ── */}
        <Col span={7} style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #f0f0f0", paddingLeft: 20 }}>
          <Space style={{ marginBottom: 10 }}>
            <ClockCircleOutlined style={{ color: "#8c8c8c" }} />
            <Text
              type="secondary"
              style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}
            >
              Block History
            </Text>
          </Space>

          {timelineLoading ? (
            <div style={{ textAlign: "center", padding: 32 }}>
              <Spin size="small" />
            </div>
          ) : timeline.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>No history yet.</Text>
          ) : (
            <div style={{ overflowY: "auto", maxHeight: 440, paddingRight: 4 }}>
              <Timeline items={timelineItems} />
            </div>
          )}
        </Col>

      </Row>
    </Modal>
  );
};

export default StainManagementModal;
