import React, { useState } from "react";
import { sanitizeHtml } from "../../../../utils/sanitize";
import { Card, Typography, Tag, Space, Flex, Divider, Button, Spin, Tooltip, message } from "antd";
import {
  HistoryOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { SurgicalSpecimen } from "../../../../types/surgical";
import { SurgicalDiagnosis } from "../../../../types/surgicalDiagnosis";
import { SurgicalReport } from "../../../../types/surgicalReport";
import SurgicalReportService from "../../../../services/surgicalReportService";
import StyledCard from "../../../../components/Layout/StyledCard";

const { Text } = Typography;

interface Props {
  reports: SurgicalDiagnosis[];
  specimens: SurgicalSpecimen[];
  onSelect: (diagnosis: SurgicalDiagnosis) => void;
  showSpecimenName?: boolean;
  diagnosisMode?: "individual" | "integrated" | "clean";
  reportSnapshots?: SurgicalReport[];
}

const ReportHistorySection: React.FC<Props> = ({
  reports,
  specimens,
  onSelect,
  showSpecimenName = true,
  reportSnapshots,
}) => {
  const [pdfLoadingOrder, setPdfLoadingOrder] = useState<number | null>(null);

  if (!reports || reports.length === 0) return null;

  const handleViewPdf = async (reportId: number, order: number) => {
    const matched = reportSnapshots?.find((r) => r.id === reportId);
    if (!matched) return;
    // open synchronously so Safari doesn't block it as a popup
    const newWindow = window.open("", "_blank");
    setPdfLoadingOrder(order);
    try {
      const blob = await SurgicalReportService.getReportPdf(matched.id);
      const url = URL.createObjectURL(blob);
      if (newWindow) {
        newWindow.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch {
      newWindow?.close();
      message.error("ไม่สามารถโหลด PDF ได้");
    } finally {
      setPdfLoadingOrder(null);
    }
  };

  // 1. Group ข้อมูลโดยใช้ diagnosis_order เป็นหลัก
  const groupedReports = reports.reduce(
    (acc, curr) => {
      const order = curr.diagnosis_order ?? 0;
      // ใช้ order เป็น key โดยตรงเพื่อความแม่นยำในการ Sort
      if (!acc[order]) acc[order] = [];
      acc[order].push(curr);
      return acc;
    },
    {} as Record<number, SurgicalDiagnosis[]>,
  );

  // 2. Sort กลุ่มตาม Order (ล่าสุดขึ้นก่อน)
  const sortedOrders = Object.keys(groupedReports)
    .map(Number)
    .sort((a, b) => b - a); // Order มาก (ล่าสุด) อยู่บน

  return (
    <section id="history-section">
      <StyledCard
        size="small"
        style={{
          marginBottom: 16,
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #e8e8e8",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
        styles={{ body: { padding: "16px" } }}
      >
        {/* Header Section */}
        <div
          style={{
            padding: "10px 16px",
            background: "#fafafa",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderLeft: "5px solid #1890ff",
            margin: "-16px -16px 16px -16px",
          }}
        >
          <Space>
            <HistoryOutlined style={{ color: "#1890ff" }} />
            <Text strong style={{ fontSize: "14px" }}>
              Entry History
            </Text>
          </Space>
        </div>

        <Flex vertical style={{ width: "100%" }} gap={16}>
          {sortedOrders.map((order) => {
            const items = groupedReports[order];
            // หาข้อมูลทั่วไปของกลุ่มจากตัวแรก
            const firstItem = items[0];
            const isGroupSigned = items.every((r) => r.status === "signed");
            const hasCaseLevel = items.some(
              (r) => r.diagnosis_level === "CASE",
            );
            const matchedReport = reportSnapshots?.find(
              (r) =>
                (r.status === "published" || r.status === "signed out") &&
                r.signers?.[0]?.diagnosis_order === order,
            );

            const sortedItems = [...items]
              .filter((r) => {
                // 🚩 [แก้ไขจุดที่ 2] กรองตามความเป็นจริงของรอบนั้น
                if (hasCaseLevel) {
                  // ถ้ารอบนี้มีการเซ็นแบบ CASE ให้โชว์เฉพาะตัว CASE เท่านั้น
                  return r.diagnosis_level === "CASE";
                }
                // ถ้ารอบนี้ไม่มี CASE ให้โชว์เฉพาะ SPECIMEN
                return r.diagnosis_level === "SPECIMEN";
              })
              .sort((a, b) => {
                const specA = specimens.find(
                  (s) => s.id === a.surgical_specimen_id,
                );
                const specB = specimens.find(
                  (s) => s.id === b.surgical_specimen_id,
                );
                return (specA?.specimen_label || "").localeCompare(
                  specB?.specimen_label || "",
                );
              });

            if (sortedItems.length === 0) return null;

            return (
              <Card
                key={order}
                size="small"
                title={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Space>
                      <Tag color={isGroupSigned ? "purple" : "orange"}>
                        {firstItem.entry_type?.toUpperCase()}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: "11px" }}>
                        <ClockCircleOutlined />{" "}
                        {dayjs(
                          firstItem.diagnosis_at || firstItem.created_at,
                        ).format("DD/MM/YYYY HH:mm")}
                      </Text>
                    </Space>
                    <Space size={4}>
                      <Text type="secondary" style={{ fontSize: "11px" }}>
                        Order: {order}
                      </Text>
                      {matchedReport && (
                        <Tooltip title="ดู PDF">
                          <Button
                            type="text"
                            size="small"
                            icon={
                              pdfLoadingOrder === order ? (
                                <Spin size="small" />
                              ) : (
                                <FilePdfOutlined style={{ color: "#722ed1" }} />
                              )
                            }
                            disabled={pdfLoadingOrder === order}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewPdf(matchedReport.id, order);
                            }}
                          />
                        </Tooltip>
                      )}
                    </Space>
                  </div>
                }
                style={{
                  borderLeft: `4px solid ${isGroupSigned ? "#722ed1" : "#faad14"}`,
                }}
              >
                {sortedItems.map((r, index) => {
                  const spec = specimens.find(
                    (s) => s.id === r.surgical_specimen_id,
                  );
                  let specTitle = "";

                  if (r.diagnosis_level === "CASE") {
                    // ดึงจาก linked_specimen_ids หรือถ้าไม่มี ให้หาช่วง A-B จาก specimens ทั้งหมด
                    const labels = sortedItems[0].linked_specimen_ids?.length
                      ? specimens
                          .filter((s) =>
                            sortedItems[0].linked_specimen_ids?.includes(s.id),
                          )
                          .map((s) => s.specimen_label)
                          .sort()
                      : specimens.map((s) => s.specimen_label).sort();

                    if (labels.length > 0) {
                      specTitle =
                        labels.length === 1
                          ? `${labels[0]}:`
                          : `${labels[0]}-${labels[labels.length - 1]}:`;
                    }
                  } else {
                    specTitle = `${spec?.specimen_label || "?"}${showSpecimenName ? `: ${spec?.specimen_name || ""}` : ":"}`;
                  }

                  return (
                    <div
                      key={r.id}
                      onClick={() => onSelect(r)}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderRadius: 4,
                      }}
                      className="hover-bg-gray"
                    >
                      {index > 0 && <Divider style={{ margin: "8px 0" }} />}
                      {specTitle && (
                        <Text
                          strong
                          style={{
                            color:
                              r.diagnosis_level === "CASE"
                                ? "#722ed1"
                                : "#003a8c",
                            fontSize: "12px",
                          }}
                        >
                          {specTitle}
                        </Text>
                      )}
                      <div
                        style={{
                          marginTop: specTitle ? "2px" : "0",
                          fontSize: "13px",
                          color: "#262626",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(r.diagnosis || "-"),
                        }}
                      />
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </Flex>
      </StyledCard>
    </section>
  );
};

export default ReportHistorySection;
