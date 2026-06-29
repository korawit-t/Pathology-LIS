import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Button,
  Tabs,
  Typography,
  Tag,
  Modal,
  message,
  Space,
  Input,
  Select,
} from "antd";
import { DeleteOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { TablePaginationConfig } from "antd";
import dayjs from "dayjs";
import SlideStorageService from "../../../../services/slideStorageService";
import { SlideStorageDetailResponse, StainCategory } from "../../../../types/slideStorage";

const { Text } = Typography;
const PAGE_SIZE = 20;

const CATEGORY_COLORS: Record<string, string> = {
  HE: "#1890ff",
  Special: "#722ed1",
  IHC: "#d46b08",
  Gyne: "#13c2c2",
  NonGyne: "#eb2f96",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "HE", label: "H&E Slide" },
  { value: "Special", label: "Special Stain" },
  { value: "IHC", label: "IHC" },
  { value: "Gyne", label: "Gyne Cytology" },
  { value: "NonGyne", label: "Non-Gyne Cytology" },
];

function getSlideLabel(r: SlideStorageDetailResponse): string {
  if (r.stain) {
    const block = r.stain.block?.block_code ?? "";
    const test = r.stain.test?.name ?? "H&E";
    return `${block} ${test} #${r.stain.slide_no ?? ""}`.trim();
  }
  if (r.gyne_stain) {
    const test = r.gyne_stain.test?.name ?? "Pap";
    return `${test} #${r.gyne_stain.slide_no ?? ""}`.trim();
  }
  if (r.nongyne_stain) {
    const test = r.nongyne_stain.test?.name ?? "";
    return `${test} #${r.nongyne_stain.slide_no ?? ""}`.trim();
  }
  return "-";
}

function getAccession(r: SlideStorageDetailResponse): string {
  return (
    r.stain?.block?.specimen?.case?.accession_no ??
    r.gyne_stain?.case?.accession_no ??
    r.nongyne_stain?.case?.accession_no ??
    "-"
  );
}

const SlideDisposalTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState("stored");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Stored
  const [storedSlides, setStoredSlides] = useState<SlideStorageDetailResponse[]>([]);
  const [storedTotal, setStoredTotal] = useState(0);
  const [storedPage, setStoredPage] = useState(1);
  const [storedSearch, setStoredSearch] = useState("");
  const [loadingStored, setLoadingStored] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isDisposing, setIsDisposing] = useState(false);

  // Disposed
  const [disposedSlides, setDisposedSlides] = useState<SlideStorageDetailResponse[]>([]);
  const [disposedTotal, setDisposedTotal] = useState(0);
  const [disposedPage, setDisposedPage] = useState(1);
  const [disposedSearch, setDisposedSearch] = useState("");
  const [loadingDisposed, setLoadingDisposed] = useState(false);

  const fetchStored = useCallback(async (page: number, search: string, category: string) => {
    try {
      setLoadingStored(true);
      const skip = (page - 1) * PAGE_SIZE;
      const data = await SlideStorageService.getStoredSlides(skip, PAGE_SIZE, search, category || undefined);
      setStoredSlides(data.items);
      setStoredTotal(data.total);
    } catch {
      message.error("ไม่สามารถโหลดข้อมูลสไลด์ที่จัดเก็บได้");
    } finally {
      setLoadingStored(false);
    }
  }, []);

  const fetchDisposed = useCallback(async (page: number, search: string, category: string) => {
    try {
      setLoadingDisposed(true);
      const skip = (page - 1) * PAGE_SIZE;
      const data = await SlideStorageService.getDisposedSlides(skip, PAGE_SIZE, search, category || undefined);
      setDisposedSlides(data.items);
      setDisposedTotal(data.total);
    } catch {
      message.error("ไม่สามารถโหลดประวัติการทำลายสไลด์ได้");
    } finally {
      setLoadingDisposed(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "stored") fetchStored(storedPage, storedSearch, categoryFilter);
    else fetchDisposed(disposedPage, disposedSearch, categoryFilter);
  }, [activeTab, storedPage, disposedPage, categoryFilter, fetchStored, fetchDisposed]);

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val);
    setStoredPage(1);
    setDisposedPage(1);
    setSelectedRowKeys([]);
  };

  const handleDispose = () => {
    if (selectedRowKeys.length === 0) {
      return message.warning("กรุณาเลือกอย่างน้อย 1 สไลด์");
    }
    const selected = storedSlides.filter((s) => selectedRowKeys.includes(s.id));
    Modal.confirm({
      title: "ยืนยันการทำลายสไลด์",
      width: 620,
      content: (
        <div>
          <p>
            คุณกำลังจะทำลาย <b>{selected.length}</b> สไลด์
            <br />
            <Text type="danger">การดำเนินการนี้ไม่สามารถย้อนกลับได้</Text>
          </p>
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={selected}
            columns={[
              { title: "Accession No.", render: (_, r) => getAccession(r), width: 140 },
              { title: "สไลด์", render: (_, r) => getSlideLabel(r) },
              {
                title: "ประเภท",
                render: (_, r) => {
                  const cat = r.run?.stain_category;
                  return cat ? <Tag color={CATEGORY_COLORS[cat] ?? "default"}>{cat}</Tag> : "-";
                },
                width: 90,
              },
            ]}
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      okText: "ยืนยันทำลาย",
      cancelText: "ยกเลิก",
      okType: "danger",
      onOk: async () => {
        try {
          setIsDisposing(true);
          await SlideStorageService.disposeSlides(selectedRowKeys as number[]);
          message.success(`ทำลาย ${selected.length} สไลด์เรียบร้อยแล้ว`);
          setSelectedRowKeys([]);
          fetchStored(storedPage, storedSearch, categoryFilter);
        } catch {
          message.error("ไม่สามารถทำลายสไลด์ได้");
        } finally {
          setIsDisposing(false);
        }
      },
    });
  };

  const storedColumns = [
    {
      title: "Accession No.",
      key: "accession",
      width: 150,
      render: (_: unknown, r: SlideStorageDetailResponse) => (
        <Text strong>{getAccession(r)}</Text>
      ),
    },
    {
      title: "สไลด์",
      key: "slide",
      render: (_: unknown, r: SlideStorageDetailResponse) => getSlideLabel(r),
    },
    {
      title: "ประเภท",
      key: "category",
      width: 110,
      render: (_: unknown, r: SlideStorageDetailResponse) => {
        const cat = r.run?.stain_category;
        return cat ? <Tag color={CATEGORY_COLORS[cat] ?? "default"}>{cat}</Tag> : "-";
      },
    },
    {
      title: "ตำแหน่งจัดเก็บ",
      dataIndex: "storage_location",
      key: "storage_location",
      render: (v: string) => v || "-",
    },
    {
      title: "วันที่จัดเก็บ",
      dataIndex: "stored_at",
      key: "stored_at",
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "-"),
    },
    {
      title: "Batch No.",
      key: "run_no",
      render: (_: unknown, r: SlideStorageDetailResponse) =>
        r.run?.run_no ? <Tag>{r.run.run_no}</Tag> : "-",
    },
  ];

  const disposedColumns = [
    {
      title: "Accession No.",
      key: "accession",
      width: 150,
      render: (_: unknown, r: SlideStorageDetailResponse) => (
        <Text strong>{getAccession(r)}</Text>
      ),
    },
    {
      title: "สไลด์",
      key: "slide",
      render: (_: unknown, r: SlideStorageDetailResponse) => getSlideLabel(r),
    },
    {
      title: "ประเภท",
      key: "category",
      width: 110,
      render: (_: unknown, r: SlideStorageDetailResponse) => {
        const cat = r.run?.stain_category;
        return cat ? <Tag color={CATEGORY_COLORS[cat] ?? "default"}>{cat}</Tag> : "-";
      },
    },
    {
      title: "ตำแหน่งจัดเก็บ",
      dataIndex: "storage_location",
      key: "storage_location",
      render: (v: string) => v || "-",
    },
    {
      title: "Batch No.",
      key: "run_no",
      render: (_: unknown, r: SlideStorageDetailResponse) =>
        r.run?.run_no ? <Tag>{r.run.run_no}</Tag> : "-",
    },
    {
      title: "วันที่ทำลาย",
      dataIndex: "discard_at",
      key: "discard_at",
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "-"),
    },
    {
      title: "ทำลายโดย",
      key: "discard_by",
      render: (_: unknown, r: SlideStorageDetailResponse) => r.discard_by?.full_name ?? "-",
    },
  ];

  const filterBar = (
    <Space>
      <Select
        value={categoryFilter}
        onChange={handleCategoryChange}
        options={CATEGORY_OPTIONS}
        style={{ width: 160 }}
        placeholder="ทุกประเภท"
      />
    </Space>
  );

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(k) => {
        setActiveTab(k);
        setSelectedRowKeys([]);
      }}
      tabBarStyle={{ marginBottom: 16 }}
      items={[
        {
          key: "stored",
          label: "รอทำลาย",
          children: (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Space>
                  {filterBar}
                  <Input.Search
                    placeholder="ค้นหา Accession No."
                    prefix={<SearchOutlined />}
                    allowClear
                    style={{ width: 260 }}
                    onSearch={(v) => {
                      setStoredSearch(v);
                      setStoredPage(1);
                      fetchStored(1, v, categoryFilter);
                    }}
                  />
                  <Text type="secondary">เลือกแล้ว: {selectedRowKeys.length} สไลด์</Text>
                </Space>
                <Space>
                  <Button
                    type="primary"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDispose}
                    loading={isDisposing}
                    disabled={selectedRowKeys.length === 0}
                  >
                    ทำลาย ({selectedRowKeys.length})
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => fetchStored(storedPage, storedSearch, categoryFilter)}
                    loading={loadingStored}
                  >
                    รีเฟรช
                  </Button>
                </Space>
              </div>
              <Table
                size="middle"
                bordered
                rowKey="id"
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                columns={storedColumns}
                dataSource={storedSlides}
                loading={loadingStored}
                pagination={{
                  current: storedPage,
                  pageSize: PAGE_SIZE,
                  total: storedTotal,
                  showSizeChanger: false,
                  showTotal: (t) => `ทั้งหมด ${t} สไลด์`,
                }}
                onChange={(p: TablePaginationConfig) => setStoredPage(p.current ?? 1)}
              />
            </div>
          ),
        },
        {
          key: "disposed",
          label: "ประวัติทำลาย",
          children: (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Space>
                  {filterBar}
                  <Input.Search
                    placeholder="ค้นหา Accession No."
                    prefix={<SearchOutlined />}
                    allowClear
                    style={{ width: 260 }}
                    onSearch={(v) => {
                      setDisposedSearch(v);
                      setDisposedPage(1);
                      fetchDisposed(1, v, categoryFilter);
                    }}
                  />
                </Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => fetchDisposed(disposedPage, disposedSearch, categoryFilter)}
                  loading={loadingDisposed}
                >
                  รีเฟรช
                </Button>
              </div>
              <Table
                size="middle"
                bordered
                rowKey="id"
                columns={disposedColumns}
                dataSource={disposedSlides}
                loading={loadingDisposed}
                pagination={{
                  current: disposedPage,
                  pageSize: PAGE_SIZE,
                  total: disposedTotal,
                  showSizeChanger: false,
                  showTotal: (t) => `ทั้งหมด ${t} สไลด์`,
                }}
                onChange={(p: TablePaginationConfig) => setDisposedPage(p.current ?? 1)}
              />
            </div>
          ),
        },
      ]}
    />
  );
};

export default SlideDisposalTab;
