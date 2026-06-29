import React, { useState } from "react";
import { Button, Typography, message, Input, Table, Tag, Space } from "antd";
import {
  PlusOutlined,
  ArrowLeftOutlined,
  EyeOutlined,
  SearchOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import BlockStorageList from "../../BlockStorage/BlockStorageList";
import CreateBlockStorageBatch from "../../BlockStorage/components/CreateBlockStorageBatch";
import BlockStorageDetails from "../../BlockStorage/components/BlockStorageDetails";
import BlockStorageService from "../../../services/blockStorageService";
import type { BlockStorageRunResponse } from "../../../types/blockStorage";

const { Title, Text } = Typography;

type View = "list" | "create" | "details";

const BlockStorageTab: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const [view, setView] = useState<View>("list");
  const [selectedRun, setSelectedRun] = useState<BlockStorageRunResponse | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<BlockStorageRunResponse[] | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) { setSearchResults(null); return; }
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

  const handleBack = () => {
    setView("list");
    setSelectedRun(null);
  };

  const handleSelectRun = (run: BlockStorageRunResponse) => {
    setSelectedRun(run);
    setView("details");
  };

  const handleCreateSuccess = (run: BlockStorageRunResponse) => {
    message.success(`Storage batch ${run?.run_no || ""} saved successfully`);
    onSuccess?.();
    handleBack();
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

  // ── Sub-view header (Back + title) for non-list views ────────────────────────
  const SubHeader = ({ title }: { title: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
        Back
      </Button>
      <Title level={4} style={{ margin: 0 }}>
        {title}
      </Title>
    </div>
  );

  // ── List view ─────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Input.Search
            placeholder="Search by Accession No."
            prefix={<SearchOutlined />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onSearch={handleSearch}
            onClear={handleClearSearch}
            allowClear
            loading={searching}
            style={{ maxWidth: 380 }}
            enterButton="Find"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setView("create")}
          >
            New Storage Batch
          </Button>
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
      </div>
    );
  }

  // ── Create view ───────────────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <div>
        <SubHeader title={<><PlusOutlined style={{ marginRight: 8 }} />New Storage Batch</>} />
        <CreateBlockStorageBatch onBack={handleBack} onSuccess={handleCreateSuccess} />
      </div>
    );
  }

  // ── Details view ──────────────────────────────────────────────────────────────
  return (
    <div>
      <SubHeader title={<><HistoryOutlined style={{ marginRight: 8 }} />Storage Batch: {selectedRun?.run_no}</>} />
      <BlockStorageDetails run={selectedRun} />
    </div>
  );
};

export default BlockStorageTab;
