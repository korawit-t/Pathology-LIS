import React, { useState } from "react";
import { Tabs, Typography } from "antd";
import { ImportOutlined } from "@ant-design/icons";
import PageContainer from "../../../components/Layout/PageContainer";
import ImportWizard from "./ImportWizard";
import BatchHistory from "./BatchHistory";

const { Title } = Typography;

const LegacyImportPage: React.FC = () => {
  const [tab, setTab] = useState("import");
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ImportOutlined style={{ marginRight: 12, color: "#595959" }} />
          Legacy Report Import
        </Title>
      }
      subTitle="นำเข้ารายงานจากระบบเดิมเข้าตาราง legacy ให้ค้นและพิมพ์ได้จากหน้าผลตรวจ"
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "import",
            label: "นำเข้า",
            children: (
              <ImportWizard onCommitted={() => setHistoryKey((k) => k + 1)} onShowHistory={() => setTab("history")} />
            ),
          },
          { key: "history", label: "ประวัติการนำเข้า", children: <BatchHistory refreshKey={historyKey} /> },
        ]}
      />
    </PageContainer>
  );
};

export default LegacyImportPage;
