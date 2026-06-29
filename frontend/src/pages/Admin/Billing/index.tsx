import React from "react";
import { Tabs, Typography } from "antd";
import { DollarOutlined } from "@ant-design/icons";
import CaseBillingPage from "./CaseBillingPage";
import HospitalBillingPage from "./HospitalBillingPage";
import PageContainer from "../../../components/Layout/PageContainer";

const { Title } = Typography;

const BillingHub: React.FC = () => {
  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <DollarOutlined style={{ marginRight: 12, color: "#595959" }} />
          Billing & Cost Management
        </Title>
      }
    >
      <Tabs defaultActiveKey="case-billing" size="large">
        <Tabs.TabPane tab="Case Billing & Cost" key="case-billing">
          <CaseBillingPage />
        </Tabs.TabPane>
        <Tabs.TabPane tab="Hospital Billing Summary" key="hospital-billing">
          <HospitalBillingPage />
        </Tabs.TabPane>
      </Tabs>
    </PageContainer>
  );
};

export default BillingHub;
