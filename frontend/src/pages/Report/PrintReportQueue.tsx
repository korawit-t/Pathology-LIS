import React, { useEffect, useState, useCallback } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Input,
  Popconfirm,
  Tabs,
} from "antd";
import type { TablePaginationConfig } from "antd/es/table";
import PageContainer from "../../components/Layout/PageContainer";
import {
  FilePdfOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  BarcodeOutlined,
} from "@ant-design/icons";
import JSZip from "jszip";
import SurgicalReportService from "../../services/surgicalReportService";
import GyneReportService from "../../services/gyneReportService";
import NongyneReportService from "../../services/nongyneReportService";
import { SurgicalReport } from "../../types/surgicalReport";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import dayjs from "dayjs";
import logger from "../../utils/logger";

const { Text, Title } = Typography;

type ReportSource = "surgical" | "gyne" | "nongyne";

interface PrintQueueItem {
  id: number;
  _source: ReportSource;
  accession_no?: string;
  patient_title?: string;
  patient_name?: string;
  patient_ln?: string;
  patient_hn?: string;
  patient_age?: number;
  patient_gender?: string;
  is_print: boolean;
  published_at?: string;
  report_type?: string;
  // surgical-only
  patient_age_display?: string;
}

const SOURCE_LABEL: Record<ReportSource, string> = {
  surgical: "Surgical",
  gyne: "Gyne Cyto",
  nongyne: "NonGyne Cyto",
};

const SOURCE_COLOR: Record<ReportSource, string> = {
  surgical: "blue",
  gyne: "purple",
  nongyne: "cyan",
};

const PrintReportQueue: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportSource>("surgical");
  const [reports, setReports] = useState<PrintQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | undefined>(undefined);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const rowKey = (item: PrintQueueItem) => `${item._source}-${item.id}`;

  const fetchReports = useCallback(
    async (source: ReportSource, page = 1, size = 10, search = "") => {
      setLoading(true);
      try {
        let items: PrintQueueItem[] = [];
        let tot = 0;

        if (source === "surgical") {
          const data = await SurgicalReportService.getAllReports(page, size, search, "published");
          items = (data.items || []).map((r: SurgicalReport) => ({
            id: r.id,
            _source: "surgical",
            accession_no: r.accession_no,
            patient_title: r.patient_title,
            patient_name: r.patient_name,
            patient_ln: r.patient_ln,
            patient_hn: r.patient_hn,
            patient_age: r.patient_age,
            patient_age_display: r.patient_age_display,
            patient_gender: r.patient_gender,
            is_print: r.is_print,
            published_at: r.published_at,
            report_type: r.report_type,
          }));
          tot = data.total || 0;
        } else if (source === "gyne") {
          const data = await GyneReportService.getAllReports(page, size, search, "published");
          items = (data.items || []).map((r) => ({ ...r, _source: "gyne" as ReportSource }));
          tot = data.total || 0;
        } else {
          const data = await NongyneReportService.getAllReports(page, size, search, "published");
          items = (data.items || []).map((r) => ({ ...r, _source: "nongyne" as ReportSource }));
          tot = data.total || 0;
        }

        setReports(items);
        setTotal(tot);
        setCurrentPage(page);
      } catch (error) {
        logger.error("Fetch Error:", error);
        message.error("ไม่สามารถดึงข้อมูลรายงานได้");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedRowKeys([]);
    fetchReports(activeTab, 1, pageSize, searchText);
  }, [activeTab, fetchReports, pageSize]);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    fetchReports(activeTab, pagination.current, pagination.pageSize, searchText);
    setPageSize(pagination.pageSize ?? 10);
  };

  const onSearch = (value: string) => {
    setSearchText(value);
    fetchReports(activeTab, 1, pageSize, value);
  };

  const getPdfBlob = async (item: PrintQueueItem, preview = true): Promise<Blob> => {
    if (item._source === "surgical") {
      return SurgicalReportService.getReportPdf(item.id, preview);
    } else if (item._source === "gyne") {
      return GyneReportService.getReportPdf(item.id);
    } else {
      return NongyneReportService.getReportPdf(item.id);
    }
  };

  const handleViewPDF = async (item: PrintQueueItem) => {
    const key = rowKey(item);
    try {
      setPreviewLoadingId(key);
      setPreviewFilename(`${item.patient_hn}.pdf`);
      const blob = await getPdfBlob(item, true);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setIsModalOpen(true);
    } catch (error) {
      logger.error("View PDF Error:", error);
      message.error("ไม่สามารถโหลดรายงานได้");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleDownloadPDF = async (item: PrintQueueItem) => {
    const key = rowKey(item);
    try {
      setDownloadingId(key);
      const blob = await getPdfBlob(item, true);
      await downloadBlob(blob, `${item.patient_hn}.pdf`);
    } catch (error) {
      logger.error("Download PDF Error:", error);
      message.error("ไม่สามารถดาวน์โหลดรายงานได้");
    } finally {
      setDownloadingId(null);
    }
  };

  const setPrintStatus = async (item: PrintQueueItem, isPrint: boolean) => {
    if (item._source === "surgical") {
      await SurgicalReportService.updatePrintStatus(item.id, isPrint);
    } else if (item._source === "gyne") {
      await GyneReportService.updatePrintStatus(item.id, isPrint);
    } else {
      await NongyneReportService.updatePrintStatus(item.id, isPrint);
    }
  };

  const handleMarkAsPrinted = async (item: PrintQueueItem) => {
    try {
      await setPrintStatus(item, true);
      message.success("ทำเครื่องหมายว่าพิมพ์แล้วสำเร็จ");
      fetchReports(activeTab, currentPage, pageSize, searchText);
    } catch (error) {
      logger.error("Update Print Status Error:", error);
      message.error("ไม่สามารถอัปเดตสถานะการพิมพ์ได้");
    }
  };

  const handleMarkAsUnprinted = async (item: PrintQueueItem) => {
    try {
      await setPrintStatus(item, false);
      message.success("ยกเลิกสถานะการพิมพ์สำเร็จ");
      fetchReports(activeTab, currentPage, pageSize, searchText);
    } catch (error) {
      logger.error("Update Print Status Error:", error);
      message.error("ไม่สามารถอัปเดตสถานะการพิมพ์ได้");
    }
  };

  const handleBulkMarkPrinted = async () => {
    try {
      await Promise.all(
        selectedRowKeys.map((key) => {
          const item = reports.find((r) => rowKey(r) === key);
          return item ? setPrintStatus(item, true) : Promise.resolve();
        }),
      );
      message.success(`ทำเครื่องหมายว่าพิมพ์แล้ว ${selectedRowKeys.length} รายการสำเร็จ`);
      setSelectedRowKeys([]);
      fetchReports(activeTab, currentPage, pageSize, searchText);
    } catch (error) {
      logger.error("Bulk Update Print Error:", error);
      message.error("เกิดข้อผิดพลาดในการอัปเดตบางรายการ");
    }
  };

  const handleBulkMarkUnprinted = async () => {
    try {
      await Promise.all(
        selectedRowKeys.map((key) => {
          const item = reports.find((r) => rowKey(r) === key);
          return item ? setPrintStatus(item, false) : Promise.resolve();
        }),
      );
      message.success(`ยกเลิกสถานะการพิมพ์ ${selectedRowKeys.length} รายการสำเร็จ`);
      setSelectedRowKeys([]);
      fetchReports(activeTab, currentPage, pageSize, searchText);
    } catch (error) {
      logger.error("Bulk Update Print Error:", error);
      message.error("เกิดข้อผิดพลาดในการอัปเดตบางรายการ");
    }
  };

  const downloadBlob = (blob: Blob, filename: string) =>
    new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const link = document.createElement("a");
        link.href = reader.result as string;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve();
      };
      reader.readAsDataURL(blob);
    });

  const handleBulkDownloadPdf = async () => {
    const items = selectedRowKeys
      .map((key) => reports.find((r) => rowKey(r) === key))
      .filter((r): r is PrintQueueItem => !!r);
    if (items.length === 0) return;

    setBulkDownloading(true);
    const zip = new JSZip();
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        message.loading({
          content: `กำลังโหลด PDF ${i + 1}/${items.length} — ${item.accession_no ?? item.patient_hn}`,
          key: "bulkDownload",
          duration: 0,
        });
        const blob = await getPdfBlob(item, true);
        const filename = `${item.accession_no ?? item.patient_hn}_${item.patient_name ?? ""}.pdf`.replace(/\s+/g, "_");
        zip.file(filename, blob);
      }

      message.loading({ content: "กำลังบีบอัด ZIP...", key: "bulkDownload", duration: 0 });
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFilename = `Reports_${dayjs().format("YYYYMMDD_HHmmss")}.zip`;
      await downloadBlob(zipBlob, zipFilename);

      // mark all as printed
      message.loading({ content: "กำลัง Mark Printed...", key: "bulkDownload", duration: 0 });
      await Promise.all(items.map((item) => setPrintStatus(item, true)));

      message.success({
        content: `ดาวน์โหลด ${items.length} ไฟล์ และ Mark Printed สำเร็จ`,
        key: "bulkDownload",
        duration: 3,
      });
      setSelectedRowKeys([]);
      fetchReports(activeTab, currentPage, pageSize, searchText);
    } catch (error) {
      logger.error("Bulk Download Error:", error);
      message.error({ content: "ผิดพลาดในการดาวน์โหลด", key: "bulkDownload", duration: 2 });
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleBulkPrintBarcode = async () => {
    try {
      message.loading({ content: "กำลังสร้าง Barcode PDF...", key: "bulkBarcode" });
      const surgicalIds = selectedRowKeys
        .map((k) => reports.find((r) => rowKey(r) === k))
        .filter((r) => r?._source === "surgical")
        .map((r) => r!.id);
      const gyneIds = selectedRowKeys
        .map((k) => reports.find((r) => rowKey(r) === k))
        .filter((r) => r?._source === "gyne")
        .map((r) => r!.id);
      const nongyneIds = selectedRowKeys
        .map((k) => reports.find((r) => rowKey(r) === k))
        .filter((r) => r?._source === "nongyne")
        .map((r) => r!.id);

      const blobs: Blob[] = [];
      if (surgicalIds.length > 0) blobs.push(await SurgicalReportService.getBarcodePdf(surgicalIds));
      if (gyneIds.length > 0) blobs.push(await GyneReportService.getBarcodePdf(gyneIds));
      if (nongyneIds.length > 0) blobs.push(await NongyneReportService.getBarcodePdf(nongyneIds));

      for (const blob of blobs) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `BarcodeLabels_${dayjs().format("YYYYMMDD_HHmmss")}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      message.success({ content: "สร้าง Barcode PDF สำเร็จ", key: "bulkBarcode", duration: 2 });
    } catch (error) {
      logger.error("Bulk Barcode Error:", error);
      message.error({ content: "ผิดพลาดในการสร้าง Barcode", key: "bulkBarcode", duration: 2 });
    }
  };

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      render: (text: string) => (
        <Text strong copyable>
          {text}
        </Text>
      ),
      width: 140,
    },
    {
      title: "Patient Info",
      key: "patient",
      render: (record: PrintQueueItem) => (
        <Space direction="vertical" size={0}>
          <Text strong>
            {[record.patient_title, record.patient_name, record.patient_ln]
              .filter(Boolean)
              .join(" ")}
          </Text>
          <Text type="secondary" style={{ fontSize: "12px" }}>
            HN: {record.patient_hn} | {record.patient_gender} ({record.patient_age_display ?? record.patient_age}y)
          </Text>
        </Space>
      ),
    },
    {
      title: "Type",
      key: "source",
      width: 110,
      render: (record: PrintQueueItem) => (
        <Tag color={SOURCE_COLOR[record._source]}>{SOURCE_LABEL[record._source]}</Tag>
      ),
    },
    {
      title: "Published Date",
      dataIndex: "published_at",
      key: "published_at",
      render: (date: string) => (date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-"),
      width: 150,
    },
    {
      title: "Print Status",
      dataIndex: "is_print",
      key: "is_print",
      render: (is_print: boolean) => (
        <Tag color={is_print ? "green" : "gold"}>{is_print ? "Printed" : "Pending Print"}</Tag>
      ),
      width: 120,
    },
    {
      title: "Action",
      key: "action",
      width: 310,
      render: (record: PrintQueueItem) => (
        <Space>
          <Button
            type="primary"
            ghost
            icon={<FilePdfOutlined />}
            loading={previewLoadingId === rowKey(record)}
            onClick={() => handleViewPDF(record)}
          >
            PDF
          </Button>
          <Button
            icon={<DownloadOutlined />}
            loading={downloadingId === rowKey(record)}
            onClick={() => handleDownloadPDF(record)}
          >
            Download
          </Button>
          {!record.is_print ? (
            <Popconfirm
              title="ทำเครื่องหมายว่าพิมพ์รายงานนี้แล้วหรือไม่?"
              onConfirm={() => handleMarkAsPrinted(record)}
              okText="ใช่"
              cancelText="ไม่"
            >
              <Button type="primary" icon={<PrinterOutlined />}>
                Mark Printed
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="ต้องการยกเลิกสถานะการพิมพ์หรือไม่?"
              onConfirm={() => handleMarkAsUnprinted(record)}
              okText="ใช่"
              cancelText="ไม่"
            >
              <Button icon={<CheckCircleOutlined />} style={{ color: "green", borderColor: "green" }}>
                Printed
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = (
    [
      { key: "surgical", label: "Surgical" },
      { key: "gyne", label: "Gyne Cyto" },
      { key: "nongyne", label: "NonGyne Cyto" },
    ] as { key: ReportSource; label: string }[]
  ).map((tab) => ({
    key: tab.key,
    label: tab.label,
  }));

  return (
    <PageContainer
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <PrinterOutlined style={{ marginRight: 12, color: "#595959" }} />
          Report Print Queue
        </Title>
      }
      withCard
      cardProps={{ bodyStyle: { paddingTop: 8 } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ReportSource)}
        items={tabItems}
        tabBarStyle={{ marginBottom: 16 }}
        tabBarExtraContent={
          <Input.Search
            placeholder="Search HN, Name, Accession No..."
            onSearch={onSearch}
            style={{ width: 300 }}
            allowClear
            enterButton
          />
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={handleBulkMarkPrinted}
          >
            Mark Printed
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={handleBulkMarkUnprinted}
          >
            Mark Unprinted
          </Button>
          <Button
            type="default"
            icon={<DownloadOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={bulkDownloading}
            onClick={handleBulkDownloadPdf}
          >
            Download ZIP + Mark Printed
          </Button>
          <Button
            type="dashed"
            icon={<BarcodeOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={handleBulkPrintBarcode}
          >
            Print Barcodes
          </Button>
          {selectedRowKeys.length > 0 && (
            <Text type="secondary">Selected {selectedRowKeys.length} items</Text>
          )}
        </Space>
      </div>

      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        dataSource={reports}
        columns={columns}
        rowKey={rowKey}
        loading={loading}
        bordered
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (tot) => `Total ${tot} reports`,
        }}
        onChange={handleTableChange}
      />
      <ReportPreviewModal
        open={isModalOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setIsModalOpen(false)}
        filename={previewFilename}
      />
    </PageContainer>
  );
};

export default PrintReportQueue;
