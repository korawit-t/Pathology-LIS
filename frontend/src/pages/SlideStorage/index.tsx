import React, { useState } from "react";
import { Button, Space, Tabs, Typography, message, Card, Input, Table, Tag } from "antd";
import {
  ExperimentOutlined,
  PlusOutlined,
  HistoryOutlined,
  SearchOutlined,
  EyeOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

import SlideStorageList from "./SlideStorageList";
import CreateSlideStorageBatch from "./components/CreateSlideStorageBatch";
import SlideStorageDetails from "./components/SlideStorageDetails";
import SlideDisposalTab from "./components/SlideDisposalTab";
import SlideStorageService from "../../services/slideStorageService";
import { SlideStorageRunResponse, StainCategory } from "../../types/slideStorage";
import PageContainer from "../../components/Layout/PageContainer";

type ViewType = "list" | "create" | "details";

interface TabState {
  view: ViewType;
  selectedRun: SlideStorageRunResponse | null;
}

const INITIAL_TAB_STATE: TabState = { view: "list", selectedRun: null };

const CATEGORIES: { key: StainCategory; label: string; color: string }[] = [
  { key: "HE",      label: "H&E Slide",        color: "#1890ff" },
  { key: "Special", label: "Special Stain",     color: "#722ed1" },
  { key: "IHC",     label: "IHC",               color: "#d46b08" },
  { key: "Gyne",    label: "Gyne Cytology",     color: "#13c2c2" },
  { key: "NonGyne", label: "Non-Gyne Cytology", color: "#eb2f96" },
];

const CATEGORY_COLORS: Record<StainCategory, string> = {
  HE: "#1890ff",
  Special: "#722ed1",
  IHC: "#d46b08",
  Gyne: "#13c2c2",
  NonGyne: "#eb2f96",
};

const SlideStorageManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StainCategory | "disposal">("HE");
  const [tabStates, setTabStates] = useState<Record<StainCategory, TabState>>({
    HE:      { ...INITIAL_TAB_STATE },
    Special: { ...INITIAL_TAB_STATE },
    IHC:     { ...INITIAL_TAB_STATE },
    Gyne:    { ...INITIAL_TAB_STATE },
    NonGyne: { ...INITIAL_TAB_STATE },
  });
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<SlideStorageRunResponse[] | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await SlideStorageService.searchByAccession(trimmed);
      setSearchResults(results);
      if (results.length === 0) message.info(`No storage batch found for "${trimmed}"`);
    } catch {
      message.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchValue("");
    setSearchResults(null);
  };

  const searchColumns = [
    {
      title: "Batch No.",
      dataIndex: "run_no",
      key: "run_no",
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: "Category",
      dataIndex: "stain_category",
      key: "stain_category",
      render: (val: StainCategory) => (
        <Tag color={CATEGORY_COLORS[val] ?? "default"}>{val}</Tag>
      ),
    },
    {
      title: "Stored At",
      dataIndex: "started_at",
      key: "started_at",
      render: (val: string) => dayjs(val).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Slides",
      dataIndex: "details",
      key: "details",
      render: (details: SlideStorageRunResponse["details"]) => <Tag color="blue">{details?.length ?? 0} slides</Tag>,
    },
    {
      title: "Remark",
      dataIndex: "remark",
      key: "remark",
      render: (val: string) => val || "-",
    },
    {
      title: "",
      key: "action",
      render: (_: unknown, record: SlideStorageRunResponse) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={async () => {
            handleClearSearch();
            const cat = record.stain_category as StainCategory;
            setActiveTab(cat);
            await handleSelectRun(cat, record);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  const getState = (cat: StainCategory) => tabStates[cat];

  const setState = (cat: StainCategory, patch: Partial<TabState>) =>
    setTabStates((prev) => ({ ...prev, [cat]: { ...prev[cat], ...patch } }));

  const handleBack = (cat: StainCategory) =>
    setState(cat, { view: "list", selectedRun: null });

  const handleCreateSuccess = (cat: StainCategory, run: SlideStorageRunResponse) => {
    message.success(`Storage batch ${run?.run_no || ""} saved successfully`);
    handleBack(cat);
  };

  const handleSelectRun = async (cat: StainCategory, run: SlideStorageRunResponse) => {
    try {
      const fullRun = await SlideStorageService.getRunDetails(run.id);
      setState(cat, { view: "details", selectedRun: fullRun });
    } catch {
      message.error("Failed to load details");
    }
  };

  const categoryTabItems = CATEGORIES.map(({ key, label }) => {
    const { view, selectedRun } = getState(key);
    return {
      key,
      label: label,
      children: (
        <div>
          {view === "list" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setState(key, { view: "create" })}
                >
                  Create New Storage Batch
                </Button>
              </div>
              <SlideStorageList
                stainCategory={key}
                onSelectRun={(run) => handleSelectRun(key, run)}
              />
            </>
          )}

          {view === "create" && (
            <CreateSlideStorageBatch
              stainCategory={key}
              onBack={() => handleBack(key)}
              onSuccess={(run) => handleCreateSuccess(key, run)}
            />
          )}

          {view === "details" && (
            <Card
              title={
                <Space>
                  <HistoryOutlined />
                  <span>Storage Batch Details: {selectedRun?.run_no}</span>
                </Space>
              }
              extra={
                <Button onClick={() => handleBack(key)}>Back to History</Button>
              }
              variant="borderless"
            >
              <SlideStorageDetails run={selectedRun} />
            </Card>
          )}
        </div>
      ),
    };
  });

  const tabItems = [
    ...categoryTabItems,
    {
      key: "disposal",
      label: (
        <Space>
          <DeleteOutlined />
          Slide Disposal
        </Space>
      ),
      children: <SlideDisposalTab />,
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
          Slide Storage
        </Title>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Search by Accession No. to find storage batch"
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onSearch={handleSearch}
          onClear={handleClearSearch}
          allowClear
          loading={searching}
          style={{ maxWidth: 420 }}
          enterButton="Find"
        />
      </div>

      {searchResults !== null ? (
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <Text type="secondary">
            Found <Text strong>{searchResults.length}</Text> batch(es) for &ldquo;{searchValue}&rdquo;
          </Text>
          <Table
            dataSource={searchResults}
            columns={searchColumns}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </Space>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as StainCategory | "disposal")}
          items={tabItems}
          type="line"
          size="large"
          tabBarStyle={{ marginBottom: 24 }}
        />
      )}
    </PageContainer>
  );
};

export default SlideStorageManager;
