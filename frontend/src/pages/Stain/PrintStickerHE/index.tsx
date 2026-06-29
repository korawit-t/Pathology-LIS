import React, { useEffect, useState } from "react";
import { Typography, Tabs, Button, message } from "antd";
import { TagsOutlined, HistoryOutlined, ScanOutlined, ReloadOutlined } from "@ant-design/icons";
import QuickPrintTab from "./components/QuickPrintTab";
import BatchHistoryTab from "./components/BatchHistoryTab";
import StainingRunDetailModal from "./components/StainingRunDetailModal";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import { StainingRunResponse, StainRequest } from "../../../types/stains";
import PageContainer from "../../../components/Layout/PageContainer";
import { executePrint } from "./utils/generateHEStickers";

const { Title } = Typography;

const PrintStickerHE: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<StainingRunResponse[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedRun, setSelectedRun] = useState<StainingRunResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getStainingRuns();
      setRuns(data);
    } catch {
      message.error("Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [refreshKey]);

  const handleBatchPrint = async (id: number) => {
    try {
      const blob = await SurgicalBlockStainService.printStickers(id);
      executePrint(blob);
      setRefreshKey((k) => k + 1);
    } catch {
      message.error("ไม่สามารถพิมพ์สติกเกอร์ได้");
    }
  };

  const handleQuickPrint = async (orders: StainRequest[]) => {
    const ids = orders.map((o) => o.id).filter(Boolean) as number[];
    if (ids.length === 0) return;
    try {
      const blob = await SurgicalBlockStainService.printHEStickerQuick(ids);
      executePrint(blob);
      message.success(`Sent ${ids.length} sticker(s) to print`);
    } catch {
      message.error("Failed to generate stickers");
    }
  };

  const handleDelete = async (runId: number) => {
    try {
      await SurgicalBlockStainService.deleteStainingRun(runId);
      message.success("Run deleted successfully");
      setRefreshKey((k) => k + 1);
    } catch {
      message.error("Failed to delete the run");
    }
  };

  const pageTitle = (
    <Title level={3} style={{ margin: 0 }}>
      <TagsOutlined style={{ marginRight: 8, color: "#595959" }} />
      Sticker Management (H&E)
    </Title>
  );

  const pageExtra = (
    <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setRefreshKey((k) => k + 1)}>
      Refresh
    </Button>
  );

  return (
    <PageContainer withCard title={pageTitle} extra={pageExtra}>
      <Tabs
        type="card"
        items={[
          {
            key: "history",
            label: <span><HistoryOutlined /> Batch History</span>,
            children: (
              <BatchHistoryTab
                runs={runs}
                loading={loading}
                onRefresh={() => setRefreshKey((k) => k + 1)}
                onPrint={handleBatchPrint}
                onViewDetail={(run) => { setSelectedRun(run); setDetailVisible(true); }}
                onDelete={handleDelete}
              />
            ),
          },
          {
            key: "quick",
            label: <span><ScanOutlined /> Quick Print</span>,
            children: <QuickPrintTab loading={false} onPrint={handleQuickPrint} />,
          },
        ]}
      />

      <StainingRunDetailModal
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        run={selectedRun}
        onPrint={handleBatchPrint}
      />
    </PageContainer>
  );
};

export default PrintStickerHE;
