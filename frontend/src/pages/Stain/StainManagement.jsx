import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Select,
  InputNumber,
  message,
  Popconfirm,
  Input,
  Badge,
  Empty,
  Segmented,
  Divider,
  Tabs,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
  ExperimentOutlined,
  SearchOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  FieldTimeOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import SurgicalBlockService from "../../services/surgicalBlockService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService from "../../services/anatomicalTestService";
import PageContainer from "../../components/Layout/PageContainer";
import { executePrint } from "./PrintStickerHE/utils/generateHEStickers";
import InternalHosxpKeyTab from "./components/InternalHosxpKeyTab";
import {
  CAT_COLOR,
  catLabel,
  isRelevantStain,
  isRoutineHETest,
  isSpecialStainCategory,
  isSpecialStainOrder,
} from "./stainFilters";

const { Text, Title } = Typography;

const STATUS_TAG_COLOR = {
  pending: "warning",
  stained: "success",
  sent: "orange",
  completed: "processing",
};


// ── Compact per-block stain table (used inside the detail modal) ───────────────
const BlockTable = ({ block, onDelete, onAddStain, onPrintStickers }) => {
  const internalStains = (block.stains || []).filter(isRelevantStain);
  const pendingCount = internalStains.filter(
    (s) => s.status === "pending",
  ).length;

  const columns = [
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Slide</span>,
      dataIndex: "slide_no",
      width: 60,
      render: (v, record) => (
        <Space size={4}>
          <Text style={{ fontSize: 13 }}>#{v}</Text>
          {record.is_printed && (
            <PrinterOutlined style={{ color: "#1890ff", fontSize: 11 }} />
          )}
        </Space>
      ),
    },
    {
      title: "Test Name",
      render: (_, record) => (
        <Text style={{ fontSize: 13 }}>{record.test?.name || "Unknown"}</Text>
      ),
    },
    {
      title: "Category",
      width: 90,
      render: (_, record) => {
        if (record.is_recut) {
          return <Tag color="red" style={{ margin: 0, fontSize: 12 }}>Recut</Tag>;
        }
        const cat = record.test?.category;
        return (
          <Tag color={CAT_COLOR[cat] || "default"} style={{ margin: 0, fontSize: 12 }}>
            {catLabel(cat)}
          </Tag>
        );
      },
    },
    {
      title: "Remark",
      key: "remark",
      render: (_, record) =>
        record.recut_note ? (
          <Text type="secondary" style={{ fontSize: 12 }}>{record.recut_note}</Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12, color: "#d9d9d9" }}>—</Text>
        ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 90,
      render: (v) => (
        <Tag
          color={STATUS_TAG_COLOR[v] || "default"}
          style={{ margin: 0, fontSize: 12 }}
        >
          {v}
        </Tag>
      ),
    },
    {
      title: "Stained",
      dataIndex: "updated_at",
      width: 160,
      render: (v, record) => {
        if (record.status !== "stained" || !v)
          return (
            <Text type="secondary" style={{ fontSize: 11 }}>
              —
            </Text>
          );
        const d = new Date(v);
        const date = d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        });
        const time = d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const operator =
          record.stained_by?.full_name || record.stained_by?.username;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Space size={4}>
              <FieldTimeOutlined style={{ color: "#52c41a", fontSize: 11 }} />
              <Text style={{ fontSize: 11, color: "#595959" }}>
                {date} {time}
              </Text>
            </Space>
            {operator && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {operator}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 44,
      render: (_, record) =>
        record.status === "pending" ? (
          <Popconfirm
            title="Delete this slide?"
            onConfirm={() => onDelete(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <DeleteOutlined
              style={{ color: "#ff4d4f", cursor: "pointer", fontSize: 14 }}
            />
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Tag color="blue" style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>
          {block.specimen_label}
          {block.block_no}
        </Tag>
        {block.is_decal && (
          <Tag color="volcano" style={{ fontSize: 11, margin: 0 }}>
            Decal
          </Tag>
        )}
        {pendingCount > 0 && (
          <Badge
            count={pendingCount}
            size="small"
            style={{ backgroundColor: "#faad14" }}
            title={`${pendingCount} pending`}
          />
        )}
        <Space style={{ marginLeft: "auto" }}>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => onPrintStickers(block)}
            disabled={internalStains.length === 0}
          >
            Print Stickers
          </Button>
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddStain(block)}
            style={{ color: "#722ed1", borderColor: "#722ed1" }}
          >
            Add Stain
          </Button>
        </Space>
      </div>

      {internalStains.length > 0 ? (
        <Table
          dataSource={internalStains}
          columns={columns}
          size="small"
          rowKey="id"
          pagination={false}
        />
      ) : (
        <Text
          type="secondary"
          style={{ fontSize: 12, display: "block", padding: "4px 0" }}
        >
          No stains ordered yet
        </Text>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;
const EMPTY_BUCKETS = { all: 0, pending: 0, completed: 0, recut: 0 };

const StainManagement = ({ onNavigate }) => {
  // One page of *cases* (server-paginated), not a slab of blocks — see
  // SurgicalBlockService.getInternalStainCases.
  const [cases, setCases] = useState([]);
  const [total, setTotal] = useState(0);
  const [bucketCounts, setBucketCounts] = useState(EMPTY_BUCKETS);
  const [slideTotals, setSlideTotals] = useState({ pending: 0, stained: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [masterTests, setMasterTests] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [mainTab, setMainTab] = useState("orders");

  // The HosXP Key tab bills every in-house stain, not just this page's, so it
  // has its own (unpaginated) fetch — deferred until the tab is opened, with
  // the badge served by a dedicated count endpoint.
  const [hosxpBlocks, setHosxpBlocks] = useState([]);
  const [hosxpLoading, setHosxpLoading] = useState(false);
  const [hosxpLoaded, setHosxpLoaded] = useState(false);
  const [unkeyedCount, setUnkeyedCount] = useState(0);

  const [currentView, setCurrentView] = useState("list");
  const [detailAccNo, setDetailAccNo] = useState(null);

  // Add stain modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [addForm] = Form.useForm();

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await SurgicalBlockService.getInternalStainCases({
        search: searchText || undefined,
        bucket: filterTab,
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setCases(res.items || []);
      setTotal(res.total || 0);
      setBucketCounts(res.bucket_counts || EMPTY_BUCKETS);
      setSlideTotals(res.slide_totals || { pending: 0, stained: 0 });
    } catch {
      message.error("Failed to load block data");
    } finally {
      setLoading(false);
    }
  }, [searchText, filterTab, page]);

  useEffect(() => {
    const t = setTimeout(fetchCases, searchText ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetchCases, searchText]);

  const fetchUnkeyedCount = useCallback(async () => {
    try {
      setUnkeyedCount(await SurgicalBlockStainService.getInternalUnkeyedCount());
    } catch {
      /* the badge is decoration — a failure here shouldn't break the page */
    }
  }, []);

  const fetchHosxpBlocks = useCallback(async () => {
    setHosxpLoading(true);
    try {
      const res = await SurgicalBlockService.getBlocks({ has_internal_stain: true });
      setHosxpBlocks(res.items || (Array.isArray(res) ? res : []));
      setHosxpLoaded(true);
    } catch {
      message.error("Failed to load block data");
    } finally {
      setHosxpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === "hosxp" && !hosxpLoaded) fetchHosxpBlocks();
  }, [mainTab, hosxpLoaded, fetchHosxpBlocks]);

  const fetchMasterTests = async () => {
    try {
      const res = await AnatomicalPathologyTestService.getAllTests();
      setMasterTests(res.data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchMasterTests();
    fetchUnkeyedCount();
  }, [fetchUnkeyedCount]);

  // Ordering a stain or deleting a slide changes both the worklist and the
  // billing queue.
  const refreshAfterWrite = () => {
    fetchCases();
    fetchUnkeyedCount();
    if (hosxpLoaded) fetchHosxpBlocks();
  };

  // Per-case display aggregates. Derived from the very blocks on screen rather
  // than sent down as numbers, so the tags can never disagree with the slide
  // table underneath them; the server only decides *which* cases are on the
  // page (and the segmented/header totals, which span every match).
  const caseRows = useMemo(() => {
    return cases
      .map((c) => {
        const caseBlocks = (c.blocks || []).filter((b) =>
          (b.stains || []).some(isRelevantStain),
        );
        const allStains = caseBlocks.flatMap((b) =>
          (b.stains || []).filter(isRelevantStain),
        );
        const pending = allStains.filter((s) => s.status === "pending").length;
        const recutCount = allStains.filter((s) => s.is_recut).length;
        // Counted off isSpecialStainOrder rather than the category alone: the
        // recut master test is itself categorised "Histochem", so a plain
        // category check would report the same slide under both tags.
        const ssCount = allStains.filter(isSpecialStainOrder).length;

        // Which stains are actually on this case — the category counts alone
        // never said *what* was ordered.
        const nameCounts = new Map();
        for (const s of allStains) {
          const name = s.is_recut ? "Recut" : s.test?.name || "Unknown";
          nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
        }
        const stainSummary = [...nameCounts.entries()].map(([name, count]) => ({
          name,
          count,
        }));

        return {
          accNo: c.accession_no,
          caseBlocks,
          blockCount: caseBlocks.length,
          slideCount: allStains.length,
          pending,
          ssCount,
          recutCount,
          stainSummary,
        };
      })
      .filter((row) => row.slideCount > 0);
  }, [cases]);

  // The case currently open in the detail modal
  const detailCase = useMemo(
    () => caseRows.find((r) => r.accNo === detailAccNo) ?? null,
    [caseRows, detailAccNo],
  );

  // Derived rather than stored: a case that no longer qualifies (its last
  // special stain was just deleted) drops out of the refetched page, and the
  // view falls back to the list instead of stranding the user on a blank one.
  // `loading` keeps the detail view up while a refetch is in flight.
  const showDetail = currentView === "detail" && (!!detailCase || loading);

  // The only thing this page orders is an in-house special stain. IHC used to
  // be offered here too, but it is ordered from the pathologist's block grid
  // (BlockGridView/StainManagementPage) and tracked under External Lab — added
  // from here it would vanish from the list the moment it was saved.
  const specialStainOptions = useMemo(
    () =>
      masterTests.filter(
        (t) =>
          !t.is_external &&
          isSpecialStainCategory(t.category) &&
          !isRoutineHETest(t),
      ),
    [masterTests],
  );

  const handleOpenAddStain = (block) => {
    setSelectedBlock(block);
    const nextSlideNo =
      block.stains && block.stains.length > 0
        ? Math.max(...block.stains.map((s) => s.slide_no)) + 1
        : 1;
    addForm.setFieldsValue({
      block_id: block.id,
      test_id: undefined,
      slide_no: nextSlideNo,
    });
    setIsAddModalOpen(true);
  };

  const onAddFinish = async (values) => {
    try {
      await SurgicalBlockStainService.createStain(values);
      message.success("Stain order added successfully");
      setIsAddModalOpen(false);
      refreshAfterWrite();
    } catch {
      message.error("Failed to add stain order");
    }
  };

  const handlePrintBlockStickers = async (block) => {
    const ids = (block.stains || []).filter(isRelevantStain).map((s) => s.id).filter(Boolean);
    if (ids.length === 0) { message.warning("No stains to print"); return; }
    try {
      const blob = await SurgicalBlockStainService.printHEStickerQuick(ids);
      executePrint(blob);
      message.success(`Printing ${ids.length} sticker(s) for ${block.specimen_label}${block.block_no}`);
    } catch { message.error("Failed to print stickers"); }
  };

  const handlePrintAllStickers = async (caseRow) => {
    const ids = (caseRow?.caseBlocks || [])
      .flatMap((b) => (b.stains || []).filter(isRelevantStain))
      .map((s) => s.id).filter(Boolean);
    if (ids.length === 0) { message.warning("No stains to print"); return; }
    try {
      const blob = await SurgicalBlockStainService.printHEStickerQuick(ids);
      executePrint(blob);
      message.success(`Printing ${ids.length} sticker(s) for ${caseRow.accNo}`);
    } catch { message.error("Failed to print stickers"); }
  };

  const handleDelete = async (stainId) => {
    try {
      await SurgicalBlockStainService.deleteStain(stainId);
      message.success("Slide deleted");
      refreshAfterWrite();
    } catch {
      message.error("Failed to delete slide");
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setPage(1);
  };

  const handleBucketChange = (value) => {
    setFilterTab(value);
    setPage(1);
  };

  const handleBack = () => {
    setCurrentView("list");
    setDetailAccNo(null);
  };

  const handleOpenCase = (accNo) => {
    setDetailAccNo(accNo);
    setCurrentView("detail");
  };

  const pageTitle = (() => {
    if (showDetail) return (
      <Title level={3} style={{ margin: 0 }}>
        <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
        {detailAccNo}
      </Title>
    );
    return (
      <Title level={3} style={{ margin: 0 }}>
        <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
        Internal Stain Orders
      </Title>
    );
  })();

  const pageExtra = !showDetail ? (
    <Space>
      <Input
        placeholder="Search accession / block..."
        prefix={<SearchOutlined style={{ color: "#8c8c8c" }} />}
        value={searchText}
        onChange={(e) => handleSearch(e.target.value)}
        allowClear
        style={{ width: 240 }}
      />
      <Button icon={<ReloadOutlined />} onClick={refreshAfterWrite} loading={loading}>
        Refresh
      </Button>
      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        onClick={() => onNavigate?.("staining-run")}
      >
        Staining Run
      </Button>
    </Space>
  ) : (
    <Space>
      <Button
        icon={<PrinterOutlined />}
        onClick={() => handlePrintAllStickers(detailCase)}
        disabled={!(detailCase?.slideCount > 0)}
      >
        Print All Stickers
      </Button>
      {(detailCase?.pending ?? 0) > 0 && (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => {
            const pendingIds = (detailCase?.caseBlocks ?? [])
              .flatMap((b) => (b.stains || []).filter(isRelevantStain))
              .filter((s) => s.status === "pending")
              .map((s) => s.id);
            localStorage.setItem("stainrun_preselect", JSON.stringify(pendingIds));
            handleBack();
            onNavigate?.("staining-run");
          }}
        >
          Process in Staining Run
        </Button>
      )}
    </Space>
  );

  // Case list table columns
  const caseColumns = [
    {
      title: "Accession No.",
      dataIndex: "accNo",
      render: (v) => (
        <Text strong style={{ color: "#1890ff", fontSize: 14 }}>
          {v}
        </Text>
      ),
    },
    {
      title: "Blocks",
      dataIndex: "blockCount",
      width: 80,
      align: "center",
      render: (v) => <Tag color="default">{v}</Tag>,
    },
    {
      title: "Slides",
      dataIndex: "slideCount",
      width: 80,
      align: "center",
      render: (v) => <Tag color="default">{v}</Tag>,
    },
    {
      title: "Stain Breakdown",
      width: 260,
      render: (_, record) => {
        if (record.slideCount === 0) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              —
            </Text>
          );
        }
        const names = record.stainSummary
          .map((s) => (s.count > 1 ? `${s.name} ×${s.count}` : s.name))
          .join(", ");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Space size={4}>
              {record.ssCount > 0 && (
                <Tag color="cyan" style={{ margin: 0, fontSize: 12 }}>
                  SS: {record.ssCount}
                </Tag>
              )}
              {record.recutCount > 0 && (
                <Tag color="red" style={{ margin: 0, fontSize: 12 }}>
                  Recut: {record.recutCount}
                </Tag>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: names }}>
              {names}
            </Text>
          </div>
        );
      },
    },
    {
      title: "Pending",
      dataIndex: "pending",
      width: 90,
      align: "center",
      render: (v) =>
        v > 0 ? (
          <Badge count={v} style={{ backgroundColor: "#faad14" }} />
        ) : (
          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 16 }} />
        ),
    },
    {
      title: "",
      key: "actions",
      width: 140,
      align: "right",
      render: (_, record) => (
        <Button
          size="small"
          icon={<PrinterOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            handlePrintAllStickers(record);
          }}
          disabled={!(record.slideCount > 0)}
        >
          Print All Stickers
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={pageTitle}
      extra={pageExtra}
      onBack={showDetail ? handleBack : undefined}
      subTitle={
        !showDetail ? (
          <Space size={16} style={{ marginTop: 2 }}>
            <Tag color="blue" style={{ fontWeight: 500 }}>Internal</Tag>
            <Space size={4}>
              <ClockCircleOutlined style={{ color: "#faad14" }} />
              <Text type="secondary">Pending: <strong>{slideTotals.pending}</strong></Text>
            </Space>
            <Space size={4}>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />
              <Text type="secondary">Stained: <strong>{slideTotals.stained}</strong></Text>
            </Space>
            <Space size={4}>
              <FolderOutlined style={{ color: "#1890ff" }} />
              <Text type="secondary">Cases: <strong>{total}</strong></Text>
            </Space>
          </Space>
        ) : (
          <Space size={12} style={{ marginTop: 2 }}>
            <Tag color="default">{detailCase?.blockCount} block{detailCase?.blockCount !== 1 ? "s" : ""}</Tag>
            <Tag color="default">{detailCase?.slideCount} slides</Tag>
            {(detailCase?.pending ?? 0) > 0 && (
              <Badge count={detailCase.pending} style={{ backgroundColor: "#faad14" }} />
            )}
          </Space>
        )
      }
    >
      {/* ── List view ── */}
      {!showDetail && (
        <Tabs
          activeKey={mainTab}
          onChange={setMainTab}
          items={[
            {
              key: "orders",
              label: (
                <span>
                  <ExperimentOutlined /> Stain Orders
                </span>
              ),
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Segmented
                      value={filterTab}
                      onChange={handleBucketChange}
                      options={[
                        { label: `All (${bucketCounts.all})`, value: "all" },
                        { label: `Has Pending (${bucketCounts.pending})`, value: "pending" },
                        { label: `Completed (${bucketCounts.completed})`, value: "completed" },
                        { label: `Recut (${bucketCounts.recut})`, value: "recut" },
                      ]}
                    />
                  </div>
                  {caseRows.length === 0 && !loading ? (
                    <Empty description="No cases found" />
                  ) : (
                    <Table
                      dataSource={caseRows}
                      columns={caseColumns}
                      rowKey="accNo"
                      size="middle"
                      loading={loading}
                      pagination={{
                        current: page,
                        pageSize: PAGE_SIZE,
                        total,
                        showSizeChanger: false,
                        onChange: setPage,
                      }}
                      onRow={(record) => ({
                        onClick: () => handleOpenCase(record.accNo),
                        style: { cursor: "pointer" },
                      })}
                    />
                  )}
                </>
              ),
            },
            {
              key: "hosxp",
              label: (
                // Badge sits beside the label text rather than wrapping it —
                // wrapping shrinks the tab font (see the Outlab tabs).
                <span>
                  <CheckCircleOutlined /> HosXP Key{" "}
                  {unkeyedCount > 0 && (
                    <Badge count={unkeyedCount} style={{ backgroundColor: "#faad14" }} />
                  )}
                </span>
              ),
              children: (
                <InternalHosxpKeyTab
                  blocks={hosxpBlocks}
                  loading={hosxpLoading}
                  onRefresh={() => {
                    fetchHosxpBlocks();
                    fetchUnkeyedCount();
                  }}
                />
              ),
            },
          ]}
        />
      )}

      {/* ── Detail view ── */}
      {showDetail && detailCase && (
        <div>
          {[...(detailCase.caseBlocks ?? [])]
            .sort((a, b) =>
              (a.specimen_label || "").localeCompare(b.specimen_label || "") ||
              Number(a.block_no) - Number(b.block_no)
            )
            .map((block, idx) => (
              <React.Fragment key={block.id}>
                {idx > 0 && <Divider style={{ margin: "4px 0 16px" }} />}
                <BlockTable
                  block={block}
                  onAddStain={handleOpenAddStain}
                  onDelete={handleDelete}
                  onPrintStickers={handlePrintBlockStickers}
                />
              </React.Fragment>
            ))}
        </div>
      )}

      {/* ── Add Stain Modal ── */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>
              Add Stain — Block {selectedBlock?.specimen_label}
              {selectedBlock?.block_no}
            </span>
          </Space>
        }
        open={isAddModalOpen}
        onCancel={() => setIsAddModalOpen(false)}
        onOk={() => addForm.submit()}
        okText="Confirm"
        cancelText="Cancel"
        destroyOnHide
        width={480}
      >
        <Form form={addForm} layout="vertical" onFinish={onAddFinish}>
          <Form.Item name="block_id" hidden>
            <InputNumber />
          </Form.Item>

          <Form.Item
            name="test_id"
            label="Special Stain (Master Data)"
            rules={[{ required: true, message: "Please select a test" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select test..."
              notFoundContent="No special stains in master data"
              options={specialStainOptions.map((test) => ({
                label: test.name,
                value: test.id,
                price: test.price_tier_1,
              }))}
              optionRender={(opt) => (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{opt.label}</span>
                  <Tag color="cyan">{opt.data.price}.-</Tag>
                </div>
              )}
            />
          </Form.Item>

          <Form.Item name="slide_no" label="Slide No.">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default StainManagement;
