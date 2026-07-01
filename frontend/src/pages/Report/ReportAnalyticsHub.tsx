import React, { useState, useEffect } from "react";
import { Tabs } from "antd";
import SystemSettingService from "../../services/systemSettingService";
import type { SystemSetting } from "../../types/system";
import {
  BarChartOutlined,
  LineChartOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  MedicineBoxOutlined,
  DownloadOutlined,
  TeamOutlined,
  StarOutlined,
  ScissorOutlined,
  LinkOutlined,
  BgColorsOutlined,
  FormOutlined,
  InboxOutlined,
  SendOutlined,
} from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";
import WorkloadDashboard from "./WorkloadDashboard";
import StatReviewPage from "./StatReviewPage";
import { StatPanel as CytologyStatPanel } from "./CytologyStatPage";
import TATDashboard from "./TATDashboard";
import CancerRegistryPage from "./CancerRegistryPage";
import TumorRegistryPage from "./TumorRegistryPage";
import ExportPanel from "./ExportPanel";
import LabTechStatPage from "./LabTechStatPage";
import SlideQualityStatPage from "./SlideQualityStatPage";
import CytoHistoCorrelationReport from "./CytoHistoCorrelationReport";
import CytoWorkloadPage from "./CytoWorkloadPage";
import CytoTATDashboard from "./CytoTATDashboard";
import IHCStatPage from "./IHCStatPage";
import StaffRegistrationPage from "./StaffRegistrationPage";
import StaffGrossPage from "./StaffGrossPage";
import HistoPage from "./HistoPage";
import StorageWorkloadPage from "./StorageWorkloadPage";
import OutlabWorkloadPage from "./OutlabWorkloadPage";

const INNER_STYLE = { paddingTop: 16 };

const ReportAnalyticsHub: React.FC = () => {
  const [settings, setSettings] = useState<SystemSetting | null>(null);

  useEffect(() => {
    SystemSettingService.getSettings().then(setSettings).catch(() => {});
  }, []);

  return (
    <PageContainer title="Report Analytics" withCard>
      <Tabs
        size="large"
        defaultActiveKey="surgical"
        items={[
          {
            key: "surgical",
            label: <span><ScissorOutlined style={{ marginRight: 6 }} />Surgical</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="workload"
                style={INNER_STYLE}
                items={[
                  {
                    key: "workload",
                    label: <span><BarChartOutlined style={{ marginRight: 6 }} />Workload</span>,
                    children: <WorkloadDashboard />,
                  },
                  {
                    key: "stats",
                    label: <span><LineChartOutlined style={{ marginRight: 6 }} />Stats</span>,
                    children: <StatReviewPage />,
                  },
                  {
                    key: "tat",
                    label: <span><ClockCircleOutlined style={{ marginRight: 6 }} />TAT</span>,
                    children: <TATDashboard />,
                  },
                  {
                    key: "ihc",
                    label: <span><BgColorsOutlined style={{ marginRight: 6 }} />IHC Stats</span>,
                    children: <IHCStatPage />,
                  },
                ]}
              />
            ),
          },
          {
            key: "gyne-cyto",
            label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Gyne Cyto</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="gyne-stats"
                style={INNER_STYLE}
                items={[
                  {
                    key: "gyne-stats",
                    label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Stats</span>,
                    children: <CytologyStatPanel type="gyne" />,
                  },
                  {
                    key: "cyto-workload",
                    label: <span><TeamOutlined style={{ marginRight: 6 }} />Workload</span>,
                    children: <CytoWorkloadPage />,
                  },
                  {
                    key: "gyne-tat",
                    label: <span><ClockCircleOutlined style={{ marginRight: 6 }} />TAT</span>,
                    children: <CytoTATDashboard type="gyne" />,
                  },
                ]}
              />
            ),
          },
          {
            key: "nongyne-cyto",
            label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Non-Gyne Cyto</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="nongyne-stats"
                style={INNER_STYLE}
                items={[
                  {
                    key: "nongyne-stats",
                    label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Stats</span>,
                    children: <CytologyStatPanel type="nongyne" />,
                  },
                  {
                    key: "nongyne-tat",
                    label: <span><ClockCircleOutlined style={{ marginRight: 6 }} />TAT</span>,
                    children: <CytoTATDashboard type="nongyne" />,
                  },
                ]}
              />
            ),
          },
          {
            key: "quality",
            label: <span><StarOutlined style={{ marginRight: 6 }} />Quality & Registry</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="slide-quality"
                style={INNER_STYLE}
                items={[
                  {
                    key: "slide-quality",
                    label: <span><StarOutlined style={{ marginRight: 6 }} />Slide Quality</span>,
                    children: <SlideQualityStatPage />,
                  },
                  {
                    key: "cancer-registry",
                    label: <span><MedicineBoxOutlined style={{ marginRight: 6 }} />Cancer Registry</span>,
                    children: <CancerRegistryPage />,
                  },
                  ...(settings?.tumor_registry_enabled ? [{
                    key: "tumor-registry",
                    label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Tumor Registry</span>,
                    children: <TumorRegistryPage />,
                  }] : []),
                  {
                    key: "cyto-histo",
                    label: <span><LinkOutlined style={{ marginRight: 6 }} />Cyto-Histo Correlation</span>,
                    children: <CytoHistoCorrelationReport />,
                  },
                ]}
              />
            ),
          },
          {
            key: "workload",
            label: <span><FormOutlined style={{ marginRight: 6 }} />Workload</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="registration"
                style={INNER_STYLE}
                items={[
                  {
                    key: "registration",
                    label: <span><TeamOutlined style={{ marginRight: 6 }} />Registration by Staff</span>,
                    children: <StaffRegistrationPage />,
                  },
                  {
                    key: "gross",
                    label: <span><ScissorOutlined style={{ marginRight: 6 }} />Grossing</span>,
                    children: <StaffGrossPage />,
                  },
                  {
                    key: "histo",
                    label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Histo</span>,
                    children: <HistoPage />,
                  },
                  {
                    key: "storage",
                    label: <span><InboxOutlined style={{ marginRight: 6 }} />Storage</span>,
                    children: <StorageWorkloadPage />,
                  },
                  {
                    key: "outlab",
                    label: <span><SendOutlined style={{ marginRight: 6 }} />Outlab</span>,
                    children: <OutlabWorkloadPage />,
                  },
                ]}
              />
            ),
          },
          {
            key: "tools",
            label: <span><DownloadOutlined style={{ marginRight: 6 }} />Tools</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="lab-tech"
                style={INNER_STYLE}
                items={[
                  {
                    key: "lab-tech",
                    label: <span><TeamOutlined style={{ marginRight: 6 }} />Lab Tech Stats</span>,
                    children: <LabTechStatPage />,
                  },
                  {
                    key: "export",
                    label: <span><DownloadOutlined style={{ marginRight: 6 }} />Export</span>,
                    children: <ExportPanel />,
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </PageContainer>
  );
};

export default ReportAnalyticsHub;
