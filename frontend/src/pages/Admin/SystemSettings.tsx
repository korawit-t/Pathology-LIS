import React, { useEffect, useState } from "react";
import { Typography, Spin, Layout, Menu, Descriptions, Tag } from "antd";
import {
  SettingOutlined,
  BankOutlined,
  FileTextOutlined,
  BranchesOutlined,
  BarcodeOutlined,
  TagsOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  ScanOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { APP_VERSION } from "../../constants/app.constants";
import api from "../../services/httpClient";
import PageContainer from "../../components/Layout/PageContainer";
import GeneralTab from "./components/GeneralTab";
import ReportTab from "./components/ReportTab";
import WorkflowTab from "./components/WorkflowTab";
import SecurityTab from "./components/SecurityTab";
import BarcodeTab from "./components/BarcodeTab";
import StickerTab from "./components/StickerTab";
import NotificationChannelTab from "./components/NotificationChannelTab";
import NotificationRulesTab from "./components/NotificationRulesTab";
import AiRegistryTab from "./components/AiRegistryTab";
import AiConfigTab from "./components/AiConfigTab";
import ReportGenTab from "./components/ReportGenTab";
import GrossingAssistTab from "./components/GrossingAssistTab";
import WsiTab from "./components/WsiTab";

const { Title } = Typography;
const { Sider, Content } = Layout;

const SystemSettings: React.FC = () => {
  const [activeKey, setActiveKey] = useState("general");
  const [backendVersion, setBackendVersion] = useState<{ version: string; environment: string } | null>(null);

  useEffect(() => {
    if (activeKey === "about" && !backendVersion) {
      api.get("/version").then((res) => setBackendVersion(res.data)).catch(() => {});
    }
  }, [activeKey]);

  const menuItems = [
    { key: "general",            icon: <BankOutlined />,      label: "General" },
    { key: "workflow",           icon: <BranchesOutlined />,  label: "Workflow & SLA" },
    { key: "security",           icon: <SafetyOutlined />,    label: "Security" },
    { key: "report",             icon: <FileTextOutlined />,  label: "Report Settings" },
    { key: "notifications",      icon: <FileTextOutlined />,  label: "Notification Channels" },
    { key: "notification-rules", icon: <FileTextOutlined />,  label: "Notification Rules" },
    { key: "barcode",            icon: <BarcodeOutlined />,   label: "Barcode Label" },
    { key: "sticker",            icon: <TagsOutlined />,      label: "Sticker Label" },
    { key: "ai-registry",        icon: <RobotOutlined />,      label: "Tumor Registry" },
    { key: "ai-config",          icon: <RobotOutlined />,      label: "AI Configuration" },
    { key: "report-gen",         icon: <RobotOutlined />,      label: "Report Generation" },
    { key: "grossing-assist",    icon: <RobotOutlined />,      label: "Grossing Assistant" },
    { key: "wsi",                 icon: <ScanOutlined />,       label: "WSI Settings" },
    { key: "about",              icon: <InfoCircleOutlined />, label: "About" },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <SettingOutlined style={{ marginRight: 12, color: "#595959" }} />
          System Settings
        </Title>
      }
      subTitle="Manage hospital information and system-wide LIS configuration"
    >
      <Layout
        style={{
          background: "transparent",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          overflow: "hidden",
          minHeight: "70vh",
        }}
      >
        <Sider
          width={240}
          theme="light"
          style={{ borderRight: "1px solid #f0f0f0", background: "#fafafa" }}
        >
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            items={menuItems}
            onClick={(e) => setActiveKey(e.key)}
            style={{
              height: "100%",
              padding: "12px 8px",
              background: "transparent",
              borderRight: 0,
            }}
          />
        </Sider>

        <Content style={{ padding: "32px 48px 80px", background: "#fff", position: "relative" }}>
          {activeKey === "general" && <GeneralTab />}
          {activeKey === "workflow" && <WorkflowTab />}
          {activeKey === "security" && <SecurityTab />}
          {activeKey === "report" && <ReportTab />}
          {activeKey === "notifications" && <NotificationChannelTab />}
          {activeKey === "notification-rules" && <NotificationRulesTab />}
          {activeKey === "barcode" && <BarcodeTab />}
          {activeKey === "sticker" && <StickerTab />}
          {activeKey === "ai-registry" && <AiRegistryTab />}
          {activeKey === "ai-config" && <AiConfigTab />}
          {activeKey === "report-gen" && <ReportGenTab />}
          {activeKey === "grossing-assist" && <GrossingAssistTab />}
          {activeKey === "wsi" && <WsiTab />}

          {activeKey === "about" && (
            <div>
              <Title level={5} style={{ marginBottom: 24 }}>About System</Title>
              <Descriptions bordered column={1} size="middle" style={{ maxWidth: 480 }}>
                <Descriptions.Item label="Frontend Version">
                  <Tag color="blue">v{APP_VERSION}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Backend Version">
                  {backendVersion
                    ? <Tag color="green">v{backendVersion.version}</Tag>
                    : <Tag>-</Tag>
                  }
                </Descriptions.Item>
                <Descriptions.Item label="Environment">
                  {backendVersion
                    ? <Tag color={backendVersion.environment === "production" ? "red" : "orange"}>{backendVersion.environment}</Tag>
                    : <Tag>-</Tag>
                  }
                </Descriptions.Item>
              </Descriptions>
            </div>
          )}
        </Content>
      </Layout>
    </PageContainer>
  );
};

export default SystemSettings;
