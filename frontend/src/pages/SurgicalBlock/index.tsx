import React, { useState } from "react";
import { Tabs, Typography, Space, Input, Button } from "antd";
import {
  BlockOutlined,
  ReloadOutlined,
  InboxOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { TabsProps } from "antd";

// Components & Services
import SurgicalBlockManager from "./components/SurgicalBlockManager";
import BlockStorageTab from "./components/BlockStorageTab";
import BlockDisposalTab from "./components/BlockDisposalTab";
import PageContainer from "../../components/Layout/PageContainer";

const { Title } = Typography;

const SurgicalBlockList: React.FC = () => {
  const [searchText, setSearchText] = useState<string>("");
  const [blockRefreshKey, setBlockRefreshKey] = useState<number>(0);

  // 4. Tab list
  const tabItems: TabsProps["items"] = [
    {
      key: "all-blocks",
      label: (
        <Space>
          <BlockOutlined />
          All Blocks
        </Space>
      ),
      children: (
        <div style={{ padding: "16px 0" }}>
          <SurgicalBlockManager searchText={searchText} refreshKey={blockRefreshKey} />
        </div>
      ),
    },
    {
      key: "block-storage",
      label: (
        <Space>
          <InboxOutlined />
          Block Storage
        </Space>
      ),
      children: (
        <div style={{ padding: "16px 0" }}>
          <BlockStorageTab onSuccess={() => setBlockRefreshKey((k) => k + 1)} />
        </div>
      ),
    },
    {
      key: "block-disposal",
      label: (
        <Space>
          <DeleteOutlined />
          Block Disposal
        </Space>
      ),
      children: (
        <div style={{ padding: "16px 0" }}>
          <BlockDisposalTab />
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <BlockOutlined style={{ marginRight: 12, color: "#595959" }} />
          Block Management
        </Title>
      }
      extra={
        <Space>
          <Input.Search
            placeholder="Search by Block / Accession"
            style={{ width: 300 }}
            allowClear
            enterButton
            onSearch={(value: string) => setSearchText(value)}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setSearchText("")}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Tabs
        defaultActiveKey="all-blocks"
        items={tabItems}
        size="large"
        tabBarStyle={{
          marginBottom: 16,
          borderBottom: "1px solid #f0f0f0",
        }}
        // Matches the Dashboard style you prefer
        style={{ padding: "8px 20px 24px 20px" }}
      />

    </PageContainer>
  );
};

export default SurgicalBlockList;
