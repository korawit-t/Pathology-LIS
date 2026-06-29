import React, { useState } from "react";
import { Button, Typography, message, Input, Table, Tag, Space } from "antd";
import {
  InboxOutlined,
  PlusOutlined,
  HistoryOutlined,
  SearchOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import BlockStorageList from "./BlockStorageList";
import CreateBlockStorageBatch from "./components/CreateBlockStorageBatch";
import BlockStorageDetails from "./components/BlockStorageDetails";
import { BlockStorageRunResponse } from "../../types/blockStorage";
import BlockStorageService from "../../services/blockStorageService";
import PageContainer from "../../components/Layout/PageContainer";

const { Title, Text } = Typography;

type ViewType = "list" | "create" | "details";

const BlockStorageManager: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>("list");
  const [selectedRun, setSelectedRun] = useState<BlockStorageRunResponse | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<BlockStorageRunResponse[] | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await BlockStorageService.searchByAccession(trimmed);
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
      title: "Stored At",
      dataIndex: "started_at",
      key: "started_at",
      render: (val: string) => dayjs(val).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Blocks",
      dataIndex: "details",
      key: "details",
      render: (details: BlockStorageRunResponse["details"]) => <Tag color="blue">{details?.length ?? 0} blocks</Tag>,
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
      render: (_: unknown, record: BlockStorageRunResponse) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => { handleClearSearch(); handleSelectRun(record); }}
        >
          View
        </Button>
      ),
    },
  ];

  const handleBack = (): void => {
    setCurrentView("list");
    setSelectedRun(null);
  };

  const handleCreateSuccess = (run: BlockStorageRunResponse): void => {
    message.success(`Storage batch ${run?.run_no || ""} saved successfully`);
    handleBack();
  };

  const handleSelectRun = (run: BlockStorageRunResponse): void => {
    setSelectedRun(run);
    setCurrentView("details");
  };

  const pageTitle = (() => {
    if (currentView === "details") return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <HistoryOutlined style={{ marginRight: 12, color: "#595959" }} />
        Storage Batch Details: {selectedRun?.run_no}
      </Title>
    );
    if (currentView === "create") return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <PlusOutlined style={{ marginRight: 12, color: "#595959" }} />
        New Storage Batch
      </Title>
    );
    return (
      <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
        <InboxOutlined style={{ marginRight: 12, color: "#595959" }} />
        Block Storage
      </Title>
    );
  })();

  const pageExtra = currentView === "list" ? (
    <Button
      type="primary"
      size="large"
      icon={<PlusOutlined />}
      onClick={() => setCurrentView("create")}
    >
      New Storage Batch
    </Button>
  ) : null;

  return (
    <PageContainer
      withCard
      title={pageTitle}
      extra={pageExtra}
      onBack={currentView !== "list" ? handleBack : undefined}
    >
      {currentView === "list" && (
        <>
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
            <BlockStorageList onSelectRun={handleSelectRun} />
          )}
        </>
      )}
      {currentView === "create" && (
        <CreateBlockStorageBatch onBack={handleBack} onSuccess={handleCreateSuccess} />
      )}
      {currentView === "details" && <BlockStorageDetails run={selectedRun} />}
    </PageContainer>
  );
};

export default BlockStorageManager;
