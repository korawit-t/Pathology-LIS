import React, { useState } from "react";
import { Col, Row, Typography, Card, Tag, Button } from "antd";
import {
  BankOutlined,
  IdcardOutlined,
  UserSwitchOutlined,
  MedicineBoxOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  ArrowLeftOutlined,
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
    icon: <AppstoreOutlined style={{ fontSize: 28, color: "#1890ff" }} />,
    component: <ProcessorMachineManager />,
    category: "Equipment",
  },
  {
    key: "processing-programs",
    title: "Processing Programs",
    desc: "จัดการโปรแกรมการเข้าเนื้อ",
    icon: <AppstoreOutlined style={{ fontSize: 28, color: "#fa8c16" }} />,
    component: <ProcessingProgramManager />,
    category: "System Configuration",
  },
  {
    key: "pathology-tests",
    title: "Pathology Tests",
    desc: "จัดการรายการตรวจทางพยาธิวิทยาและรหัสต่างๆ",
    icon: <MedicineBoxOutlined style={{ fontSize: 28, color: "#1890ff" }} />,
    component: <AnatomicalPathologyTestPage />,
    category: "Lab Configuration",
  },
  {
    key: "hospitals",
    title: "Hospitals",
    desc: "ตั้งค่าข้อมูลโรงพยาบาลในเครือ",
    icon: <BankOutlined style={{ fontSize: 28, color: "#722ed1" }} />,
    component: <HospitalManager />,
    category: "Organization",
  },
  {
    key: "departments",
    title: "Departments",
    desc: "จัดการแผนกและหน่วยงานภายใน",
    icon: <AppstoreOutlined style={{ fontSize: 28, color: "#eb2f96" }} />,
    component: <DepartmentManager />,
    category: "Organization",
  },
  {
    key: "positions",
    title: "Positions",
    desc: "กำหนดตำแหน่งงานของบุคลากร",
    icon: <IdcardOutlined style={{ fontSize: 28, color: "#2f54eb" }} />,
    component: <PositionManager />,
    category: "Human Resources",
  },
  {
    key: "titles",
    title: "Titles",
    desc: "จัดการคำนำหน้าชื่อ (นาย, นาง, นพ.)",
    icon: <UserSwitchOutlined style={{ fontSize: 28, color: "#fa8c16" }} />,
    component: <TitleManager />,
    category: "Human Resources",
  },
  {
    key: "medical-schemes",
    title: "Medical Schemes",
    desc: "จัดการสิทธิการรักษา (ประกันสังคม, จ่ายตรง)",
    icon: <MedicineBoxOutlined style={{ fontSize: 28, color: "#52c41a" }} />,
    component: <MedicalSchemeManager />,
    category: "Finance",
  },
  {
    key: "holidays",
    title: "Holidays",
    desc: "จัดการวันหยุดนักขัตฤกษ์เพื่อการคำนวณ TAT",
    icon: <CalendarOutlined style={{ fontSize: 28, color: "#ff4d4f" }} />,
    component: <HolidayManager />,
    category: "System Configuration",
  },
  {
    key: "external-labs",
    title: "External Labs",
    desc: "จัดการสถานพยาบาลและศูนย์แล็บปลายทาง",
    icon: <BankOutlined style={{ fontSize: 28, color: "#13c2c2" }} />,
    component: <ExternalLabManager />,
    category: "Organization",
  },
  {
    key: "specimen-types",
    title: "Specimen Types",
    desc: "จัดการชนิดชิ้นเนื้อและสิ่งส่งตรวจ (Fluid, FNA, Urine…)",
    icon: <MedicineBoxOutlined style={{ fontSize: 28, color: "#722ed1" }} />,
    component: <SpecimenTypeManager />,
    category: "Lab Configuration",
  },
  {
    key: "cytology-specimen-types",
    title: "Cytology Specimen Types",
    desc: "จัดการประเภทชิ้นเนื้อสำหรับ Gyne Cytology และ Non-Gyne Cytology",
    icon: <MedicineBoxOutlined style={{ fontSize: 28, color: "#eb2f96" }} />,
    component: <CytologySpecimenTypeManager />,
    category: "Lab Configuration",
  },
  {
    key: "report-templates",
    title: "Report Templates",
    desc: "เลือก Layout รายงาน PDF สำหรับ Surgical / Gyne / Non-Gyne",
    icon: <DatabaseOutlined style={{ fontSize: 28, color: "#d4380d" }} />,
    component: <ReportTemplateManager />,
    category: "System Configuration",
  },
];

const categories = [...new Set(settingItems.map((i) => i.category))];

const MasterData: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (activeKey) {
    const activeItem = settingItems.find((item) => item.key === activeKey)!;
    return (
      <PageContainer
        withCard
        title={
          <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
            <DatabaseOutlined style={{ marginRight: 12, color: "#595959" }} />
            {activeItem.title}
          </Title>
        }
        onBack={() => setActiveKey(null)}
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => setActiveKey(null)}>
            Back
          </Button>
        }
      >
        {activeItem.component}
      </PageContainer>
    );
  }

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
      <div style={{ marginBottom: 24 }}>
        <Text type="secondary">เลือกหัวข้อที่ต้องการจัดการข้อมูลพื้นฐานของระบบ</Text>
      </div>
      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 12 }}>
            <Tag color={CATEGORY_COLOR[cat]} style={{ fontSize: 12, padding: "2px 10px" }}>
              {cat}
            </Tag>
          </div>
          <Row gutter={[16, 16]}>
            {settingItems
              .filter((item) => item.category === cat)
              .map((item) => (
                <Col xs={24} sm={12} md={8} lg={6} key={item.key}>
                  <Card
                    hoverable
                    onClick={() => setActiveKey(item.key)}
                    style={{ borderRadius: 12, height: "100%" }}
                  >
                    <div style={{ marginBottom: 12 }}>{item.icon}</div>
                    <Text strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
                      {item.title}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.desc}
                    </Text>
                  </Card>
                </Col>
              ))}
          </Row>
        </div>
      ))}
    </PageContainer>
  );
};

export default MasterData;
