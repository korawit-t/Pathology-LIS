import React, { useState } from "react";
import { Button, Card, Space, Table, Tabs, Tag, Typography, message } from "antd";
import {
  ExperimentOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import StainingRunList from "./components/HEStainingRunList";
import CreateStainingRun from "./components/CreateStainingRun";
import QuickPrintTab from "../PrintStickerHE/components/QuickPrintTab";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import { StainingRunResponse, StainRequest } from "../../../types/stains";
import PageContainer from "../../../components/Layout/PageContainer";
import { executePrint } from "../PrintStickerHE/utils/generateHEStickers";

const { Title, Text } = Typography;

type StainingViewMode = "list" | "create" | "details";

const RoutineHEManager: React.FC = () => {
  const [currentView, setCurrentView] = useState<StainingViewMode>("list");
  const [selectedRun, setSelectedRun] = useState<StainingRunResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleBack = (): void => {
    setCurrentView("list");
    setSelectedRun(null);
  };

  const handleSelectRun = (run: StainingRunResponse): void => {
    setSelectedRun(run);
    setCurrentView("details");
  };

  const pageTitle = (() => {
    if (currentView === "details") return (
      <Title level={3} style={{ margin: 0 }}>
        <HistoryOutlined style={{ marginRight: 8, color: "#595959" }} />
        Staining Run Details: {selectedRun?.run_no}
      </Title>
    );
    if (currentView === "create") return (
      <Title level={3} style={{ margin: 0 }}>
        <PlusOutlined style={{ marginRight: 8, color: "#595959" }} />
        New Staining Run
      </Title>
    );
    return (
      <Title level={3} style={{ margin: 0 }}>
        <ExperimentOutlined style={{ marginRight: 8, color: "#595959" }} />
        H&E Staining
      </Title>
    );
  })();

  const pageExtra = currentView === "list" ? (
    <Space>
      <Button
        icon={<ReloadOutlined />}
        onClick={() => setRefreshKey((k) => k + 1)}
      >
        Refresh
      </Button>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => setCurrentView("create")}
      >
        New Batch
      </Button>
    </Space>
  ) : null;

  return (
    <PageContainer
      withCard
      title={pageTitle}
      extra={pageExtra}
      onBack={currentView !== "list" ? handleBack : undefined}
    >
      {currentView === "list" && (
        <Tabs
          type="card"
          items={[
            {
              key: "history",
              label: <span><ExperimentOutlined /> H&E Staining History</span>,
              children: (
                <StainingRunList
                  onSelectRun={handleSelectRun}
                  onPrint={handleBatchPrint}
                  refreshKey={refreshKey}
                />
              ),
            },
            {
              key: "quick-print",
              label: <span><ScanOutlined /> Quick Print</span>,
              children: <QuickPrintTab loading={false} onPrint={handleQuickPrint} />,
            },
          ]}
        />
      )}

      {currentView === "create" && <CreateStainingRun onBack={handleBack} />}

      {currentView === "details" && selectedRun && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <p>
              <b>Operator:</b> {selectedRun.operator?.full_name || "N/A"}
            </p>
            <p>
              <b>Stainer:</b> {selectedRun.stainer_id || "Manual"}
            </p>
            <p>
              <b>Total Slides:</b> {selectedRun.details?.length || 0}
            </p>
          </div>

          <Card type="inner" title="Slides in This Batch">
            <Table
              dataSource={selectedRun.details}
              rowKey="id"
              pagination={false}
              size="middle"
              bordered
              columns={[
                {
                  title: "#",
                  render: (_: unknown, __: unknown, index: number) => index + 1,
                  width: 70,
                },
                {
                  title: "Slide",
                  key: "slide_label",
                  render: (_: unknown, record: StainingRunResponse["details"][number]) => {
                    const stain = record.stain_order;
                    const block = stain?.block;
                    const specimen = block?.specimen;
                    const sCase = specimen?.case;

                    const accession =
                      sCase?.accession_no || block?.accession_no || "N/A";

                    const bLabel = block?.specimen_label || specimen?.specimen_label || "";
                    const bNo = block?.block_no ? String(block.block_no) : "";
                    const bCode =
                      bLabel && bNo
                        ? `${bLabel}${bNo}`
                        : block?.block_code || "N/A";

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <Text>{accession}</Text>
                        <Text strong style={{ color: "#1890ff", fontSize: "14px" }}>
                          {bCode}
                        </Text>
                        <div style={{ marginTop: "4px" }}>
                          <Tag color="blue" style={{ fontSize: "10px", borderRadius: "4px" }}>
                            {stain?.stain_type}
                          </Tag>
                          {block?.is_decal && (
                            <Tag color="volcano" style={{ fontSize: "10px", borderRadius: "4px" }}>
                              Decal
                            </Tag>
                          )}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  title: "Result",
                  dataIndex: "is_success",
                  render: (success: boolean) => (
                    <Tag color={success ? "success" : "error"}>
                      {success ? "Success" : "Failed"}
                    </Tag>
                  ),
                },
                {
                  title: "Remark",
                  dataIndex: "remark",
                  render: (text: string) => text || "-",
                },
              ]}
            />
          </Card>
        </div>
      )}
    </PageContainer>
  );
};

export default RoutineHEManager;
