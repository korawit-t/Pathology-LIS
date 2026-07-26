import React, { useState } from "react";
import { Typography, Layout, Menu, Tag } from "antd";
import {
  BankOutlined,
  IdcardOutlined,
  UserSwitchOutlined,
  MedicineBoxOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";

import PageContainer from "../components/Layout/PageContainer";
import HospitalManager from "../components/HospitalManager";
import PositionManager from "../components/PositionManager";
import TitleManager from "../components/TitleManager";
import MedicalSchemeManager from "../components/MedicalSchemeManager";
import AnatomicalPathologyTestPage from "../components/AnatomicalPathologyTestPage";
import DepartmentManager from "../components/DepartmentManager";
import HolidayManager from "../components/HolidayManager";
import ExternalLabManager from "../components/ExternalLabManager";
import ProcessorMachineManager from "../components/ProcessorMachineManager";
import ProcessingProgramManager from "../components/ProcessingProgramManager";
import SpecimenTypeManager from "../components/SpecimenTypeManager";
import CytologySpecimenTypeManager from "../components/CytologySpecimenTypeManager";
import ReportTemplateManager from "../components/ReportTemplateManager";

const { Title, Text } = Typography;
const { Sider, Content } = Layout;

interface SettingItem {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  component: React.ReactNode;
  category: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  Equipment: "blue",
  "Lab Configuration": "geekblue",
  Organization: "purple",
  "Human Resources": "magenta",
  Finance: "green",
  "System Configuration": "orange",
};

const settingItems: SettingItem[] = [
  {
    key: "processor-machines",
    title: "Processor Machines",
    desc: "จัดการเครื่องเข้าเนื้อ (Processor)",
    icon: <AppstoreOutlined style={{ color: "#1890ff" }} />,
    component: <ProcessorMachineManager />,
    category: "Equipment",
  },
  {
    key: "processing-programs",
    title: "Processing Programs",
    desc: "จัดการโปรแกรมการเข้าเนื้อ",
    icon: <AppstoreOutlined style={{ color: "#fa8c16" }} />,
    component: <ProcessingProgramManager />,
    category: "System Configuration",
  },
  {
    key: "pathology-tests",
    title: "Pathology Tests",
    desc: "จัดการรายการตรวจทางพยาธิวิทยาและรหัสต่างๆ",
    icon: <MedicineBoxOutlined style={{ color: "#1890ff" }} />,
    component: <AnatomicalPathologyTestPage />,
    category: "Lab Configuration",
  },
  {
    key: "hospitals",
    title: "Hospitals",
    desc: "ตั้งค่าข้อมูลโรงพยาบาลในเครือ",
    icon: <BankOutlined style={{ color: "#722ed1" }} />,
    component: <HospitalManager />,
    category: "Organization",
  },
  {
    key: "departments",
    title: "Departments",
    desc: "จัดการแผนกและหน่วยงานภายใน",
    icon: <AppstoreOutlined style={{ color: "#eb2f96" }} />,
    component: <DepartmentManager />,
    category: "Organization",
  },
  {
    key: "positions",
    title: "Positions",
    desc: "กำหนดตำแหน่งงานของบุคลากร",
    icon: <IdcardOutlined style={{ color: "#2f54eb" }} />,
    component: <PositionManager />,
    category: "Human Resources",
  },
  {
    key: "titles",
    title: "Titles",
    desc: "จัดการคำนำหน้าชื่อ (นาย, นาง, นพ.)",
    icon: <UserSwitchOutlined style={{ color: "#fa8c16" }} />,
    component: <TitleManager />,
    category: "Human Resources",
  },
  {
    key: "medical-schemes",
    title: "Medical Schemes",
    desc: "จัดการสิทธิการรักษา (ประกันสังคม, จ่ายตรง)",
    icon: <MedicineBoxOutlined style={{ color: "#52c41a" }} />,
    component: <MedicalSchemeManager />,
    category: "Finance",
  },
  {
    key: "holidays",
    title: "Holidays",
    desc: "จัดการวันหยุดนักขัตฤกษ์เพื่อการคำนวณ TAT",
    icon: <CalendarOutlined style={{ color: "#ff4d4f" }} />,
    component: <HolidayManager />,
    category: "System Configuration",
  },
  {
    key: "external-labs",
    title: "External Labs",
    desc: "จัดการสถานพยาบาลและศูนย์แล็บปลายทาง",
    icon: <BankOutlined style={{ color: "#13c2c2" }} />,
    component: <ExternalLabManager />,
    category: "Organization",
  },
  {
    key: "specimen-types",
    title: "Specimen Types",
    desc: "จัดการชนิดชิ้นเนื้อและสิ่งส่งตรวจ (Fluid, FNA, Urine…)",
    icon: <MedicineBoxOutlined style={{ color: "#722ed1" }} />,
    component: <SpecimenTypeManager />,
    category: "Lab Configuration",
  },
  {
    key: "cytology-specimen-types",
    title: "Cytology Specimen Types",
    desc: "จัดการประเภทชิ้นเนื้อสำหรับ Gyne Cytology และ Non-Gyne Cytology",
    icon: <MedicineBoxOutlined style={{ color: "#eb2f96" }} />,
    component: <CytologySpecimenTypeManager />,
    category: "Lab Configuration",
  },
  {
    key: "report-templates",
    title: "Report Templates",
    desc: "เลือก Layout รายงาน PDF สำหรับ Surgical / Gyne / Non-Gyne",
    icon: <DatabaseOutlined style={{ color: "#d4380d" }} />,
    component: <ReportTemplateManager />,
    category: "System Configuration",
  },
];

const categories = [...new Set(settingItems.map((i) => i.category))];

const menuItems = categories.map((cat) => ({
  key: cat,
  type: "group" as const,
  label: (
    <Tag color={CATEGORY_COLOR[cat]} style={{ fontSize: 12 }}>
      {cat}
    </Tag>
  ),
  children: settingItems
    .filter((item) => item.category === cat)
    .map((item) => ({
      key: item.key,
      icon: item.icon,
      label: item.title,
    })),
}));

const MasterData: React.FC = () => {
  const [activeKey, setActiveKey] = useState(settingItems[0].key);
  const activeItem = settingItems.find((item) => item.key === activeKey)!;

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <DatabaseOutlined style={{ marginRight: 12, color: "#595959" }} />
          Master Data
        </Title>
      }
      subTitle="จัดการข้อมูลพื้นฐานของระบบ"
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
          width={260}
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
          <div style={{ marginBottom: 24 }}>
            <Title level={5} style={{ marginBottom: 4 }}>{activeItem.title}</Title>
            <Text type="secondary">{activeItem.desc}</Text>
          </div>
          {activeItem.component}
        </Content>
      </Layout>
    </PageContainer>
  );
};

export default MasterData;
