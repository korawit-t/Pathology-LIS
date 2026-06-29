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
import IHCStatPage from "./IHCStatPage";

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
            key: "cytology",
            label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Cytology</span>,
            children: (
              <Tabs
                size="middle"
                defaultActiveKey="gyne"
                style={INNER_STYLE}
                items={[
                  {
                    key: "gyne",
                    label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Gyne Stats</span>,
                    children: <CytologyStatPanel type="gyne" />,
                  },
                  {
                    key: "nongyne",
                    label: <span><ExperimentOutlined style={{ marginRight: 6 }} />Non-Gyne Stats</span>,
                    children: <CytologyStatPanel type="nongyne" />,
                  },
                  {
                    key: "cyto-workload",
                    label: <span><TeamOutlined style={{ marginRight: 6 }} />Workload</span>,
                    children: <CytoWorkloadPage />,
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
