import React, { useEffect, useState, useMemo } from "react";
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

const { Text, Title } = Typography;

const STATUS_TAG_COLOR = {
  pending: "warning",
  stained: "success",
  sent: "orange",
  completed: "processing",
};

const CAT_COLOR = {
  IHC: "purple",
  Histochem: "cyan",
};

const isRelevantStain = (s) =>
  s.is_recut || (!s.test?.is_external && !s.test?.name?.includes("H&E"));


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
        const cat = record.test?.category || "—";
        return (
          <Tag color={CAT_COLOR[cat] || "default"} style={{ margin: 0, fontSize: 12 }}>
            {cat}
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
            disabled={!(block.stains?.length > 0)}
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
const StainManagement = ({ onNavigate }) => {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [masterTests, setMasterTests] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  const [currentView, setCurrentView] = useState("list");
  const [detailAccNo, setDetailAccNo] = useState(null);

  // Add stain modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [addForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await SurgicalBlockService.getBlocks({ limit: 200 });
      const data = res.items || (Array.isArray(res) ? res : []);
      setBlocks(data);
    } catch {
      message.error("Failed to load block data");
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterTests = async () => {
    try {
      const res = await AnatomicalPathologyTestService.getAllTests();
      setMasterTests(res.data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchData();
    fetchMasterTests();
  }, []);

  // Group blocks by accession_no (search-filtered)
  const grouped = useMemo(() => {
    const filtered = blocks.filter((b) => {
      if (!searchText) return true;
      const q = searchText.toLowerCase();
      return (
        (b.accession_no || "").toLowerCase().includes(q) ||
        (b.specimen_label || "").toLowerCase().includes(q)
      );
    });
    return filtered.reduce((acc, block) => {
      const key = block.accession_no || "Unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(block);
      return acc;
    }, {});
  }, [blocks, searchText]);

  // Build flat case rows for the table
  const caseRows = useMemo(() => {
    return Object.entries(grouped).map(([accNo, caseBlocks]) => {
      const allStains = caseBlocks.flatMap((b) =>
        (b.stains || []).filter(isRelevantStain),
      );
      const pending = allStains.filter((s) => s.status === "pending").length;
      const ihcCount = allStains.filter(
        (s) => s.test?.category === "IHC",
      ).length;
      const ssCount = allStains.filter(
        (s) => s.test?.category === "Histochem",
      ).length;
      const recutCount = allStains.filter((s) => s.is_recut).length;
      return {
        accNo,
        caseBlocks,
        blockCount: caseBlocks.length,
        slideCount: allStains.length,
        pending,
        ihcCount,
        ssCount,
        recutCount,
      };
    });
  }, [grouped]);

  // Per-tab counts
  const pendingRows = caseRows.filter((r) => r.pending > 0);
  const completedRows = caseRows.filter((r) => r.pending === 0);
  const recutRows = caseRows.filter((r) => r.recutCount > 0);

  const filteredRows = useMemo(() => {
    if (filterTab === "pending") return pendingRows;
    if (filterTab === "completed") return completedRows;
    if (filterTab === "recut") return recutRows;
    return caseRows;
  }, [caseRows, filterTab]);

  // The case currently open in the detail modal
  const detailCase = useMemo(
    () => caseRows.find((r) => r.accNo === detailAccNo) ?? null,
    [caseRows, detailAccNo],
  );

  // Summary
  const totalPending = blocks.reduce(
    (sum, b) =>
      sum +
      (b.stains || []).filter(
        (s) => isRelevantStain(s) && s.status === "pending",
      ).length,
    0,
  );
  const totalStained = blocks.reduce(
    (sum, b) =>
      sum +
      (b.stains || []).filter(
        (s) => isRelevantStain(s) && s.status === "stained",
      ).length,
    0,
  );

  const getFilteredStainNames = (uiSelectedType) => {
    if (uiSelectedType === "Special stain")
      return masterTests.filter(
        (t) => t.category === "Histochem" && !t.name.includes("H&E"),
      );
    if (uiSelectedType === "IHC")
      return masterTests.filter((t) => t.category === "IHC");
    return [];
  };

  const handleOpenAddStain = (block) => {
    setSelectedBlock(block);
    const nextSlideNo =
      block.stains && block.stains.length > 0
        ? Math.max(...block.stains.map((s) => s.slide_no)) + 1
        : 1;
    addForm.setFieldsValue({
      block_id: block.id,
      stain_type: "Special stain",
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
      fetchData();
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
      fetchData();
    } catch {
      message.error("Failed to delete slide");
    }
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
    if (currentView === "detail") return (
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

  const pageExtra = currentView === "list" ? (
    <Space>
      <Input
        placeholder="Search accession / block..."
        prefix={<SearchOutlined style={{ color: "#8c8c8c" }} />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        style={{ width: 240 }}
      />
      <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
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
      width: 200,
      render: (_, record) => (
        <Space size={4}>
          {record.ihcCount > 0 && (
            <Tag color="purple" style={{ margin: 0, fontSize: 12 }}>
              IHC: {record.ihcCount}
            </Tag>
          )}
          {record.ssCount > 0 && (
            <Tag color="cyan" style={{ margin: 0, fontSize: 12 }}>
              SS: {record.ssCount}
            </Tag>
          )}
          {record.ihcCount === 0 && record.ssCount === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              —
            </Text>
          )}
        </Space>
      ),
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
      onBack={currentView !== "list" ? handleBack : undefined}
      subTitle={
        currentView === "list" ? (
          <Space size={16} style={{ marginTop: 2 }}>
            <Tag color="blue" style={{ fontWeight: 500 }}>Internal</Tag>
            <Space size={4}>
              <ClockCircleOutlined style={{ color: "#faad14" }} />
              <Text type="secondary">Pending: <strong>{totalPending}</strong></Text>
            </Space>
            <Space size={4}>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />
              <Text type="secondary">Stained: <strong>{totalStained}</strong></Text>
            </Space>
            <Space size={4}>
              <FolderOutlined style={{ color: "#1890ff" }} />
              <Text type="secondary">Cases: <strong>{caseRows.length}</strong></Text>
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
      {currentView === "list" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Segmented
              value={filterTab}
              onChange={setFilterTab}
              options={[
                { label: `All (${caseRows.length})`, value: "all" },
                { label: `Has Pending (${pendingRows.length})`, value: "pending" },
                { label: `Completed (${completedRows.length})`, value: "completed" },
                { label: `Recut (${recutRows.length})`, value: "recut" },
              ]}
            />
          </div>
          {filteredRows.length === 0 ? (
            <Empty description="No cases found" />
          ) : (
            <Table
              dataSource={filteredRows}
              columns={caseColumns}
              rowKey="accNo"
              size="middle"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              onRow={(record) => ({
                onClick: () => handleOpenCase(record.accNo),
                style: { cursor: "pointer" },
              })}
            />
          )}
        </>
      )}

      {/* ── Detail view ── */}
      {currentView === "detail" && detailCase && (
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
            name="stain_type"
            label="Stain Type"
            rules={[{ required: true }]}
          >
            <Select
              onChange={(val) => {
                const filtered = getFilteredStainNames(val);
                addForm.setFieldValue("test_id", filtered[0]?.id);
              }}
            >
              <Option value="Special stain">Special Stain</Option>
              <Option value="IHC">IHC</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.stain_type !== curr.stain_type}
          >
            {({ getFieldValue }) => {
              const options = getFilteredStainNames(
                getFieldValue("stain_type"),
              );
              return (
                <Form.Item
                  name="test_id"
                  label="Test (Master Data)"
                  rules={[{ required: true, message: "Please select a test" }]}
                >
                  <Select
                    showSearch
                    placeholder="Select test..."
                    options={options.map((test) => ({
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
              );
            }}
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
