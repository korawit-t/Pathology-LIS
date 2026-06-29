import React, { useEffect, useState } from "react";
import { Badge, Button, Input, Space, Table, Tag, Typography, message } from "antd";
import { EyeOutlined, FileSearchOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import WsiSettingService from "../../services/wsiSettingService";
import type { WsiFile } from "../../types/system";

const { Title } = Typography;

interface Props {
  onNavigate?: (view: string) => void;
}

const WSISlideGallery: React.FC<Props> = ({ onNavigate }) => {
  const [files, setFiles] = useState<WsiFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await WsiSettingService.listWsiFiles({ limit: 500 });
      // show only confirmed slides
      setFiles(data.filter((f) => f.slide_links.some((l) => l.status === "confirmed")));
    } catch {
      message.error("Failed to load WSI slides.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = files.filter((f) =>
    f.filename.toLowerCase().includes(search.toLowerCase()) ||
    f.slide_links.some(
      (l) =>
        l.accession_no?.toLowerCase().includes(search.toLowerCase()) ||
        l.block_code?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const columns: ColumnsType<WsiFile> = [
    {
      title: "Filename",
      dataIndex: "filename",
      key: "filename",
      sorter: (a, b) => a.filename.localeCompare(b.filename),
    },
    {
      title: "Format",
      key: "format",
      width: 100,
      render: (_, record) => {
        const v = record.format ?? record.filename.split(".").pop()?.toUpperCase();
        return v ? <Tag color="blue">{v}</Tag> : <Tag>—</Tag>;
      },
    },
    {
      title: "Accession",
      key: "accession",
      width: 140,
      render: (_, record) => {
        const v =
          record.parsed_accession ??
          record.slide_links.find((l) => l.status === "confirmed")?.accession_no;
        return v ?? <span style={{ color: "#bfbfbf" }}>—</span>;
      },
      sorter: (a, b) => {
        const av = a.parsed_accession ?? a.slide_links.find((l) => l.status === "confirmed")?.accession_no ?? "";
        const bv = b.parsed_accession ?? b.slide_links.find((l) => l.status === "confirmed")?.accession_no ?? "";
        return av.localeCompare(bv);
      },
    },
    {
      title: "Block",
      key: "block",
      width: 80,
      render: (_, record) => {
        const v =
          record.parsed_block ??
          record.slide_links.find((l) => l.status === "confirmed")?.block_code;
        return v ?? <span style={{ color: "#bfbfbf" }}>—</span>;
      },
    },
    {
      title: "Status",
      key: "status",
      width: 130,
      render: (_, record) => {
        const link = record.slide_links.find((l) => l.status === "confirmed");
        return (
          <Badge
            status="success"
            text={
              link?.accession_no && link?.block_code
                ? `${link.accession_no} · ${link.block_code}`
                : "Confirmed"
            }
          />
        );
      },
    },
    {
      title: "Size (MB)",
      key: "size_mb",
      width: 100,
      sorter: (a, b) => (a.file_size_bytes ?? 0) - (b.file_size_bytes ?? 0),
      render: (_, r) =>
        r.file_size_bytes ? (r.file_size_bytes / 1024 / 1024).toFixed(1) : "—",
    },
    {
      title: "Last Seen",
      dataIndex: "last_seen_at",
      key: "last_seen_at",
      width: 150,
      defaultSortOrder: "descend",
      sorter: (a, b) =>
        (a.last_seen_at ?? a.discovered_at).localeCompare(b.last_seen_at ?? b.discovered_at),
      render: (d?: string) => (d ? dayjs(d).format("DD/MM/YYYY HH:mm") : "—"),
    },
    {
      title: "",
      key: "action",
      width: 90,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            sessionStorage.setItem("wsi_viewer_path", record.file_path);
            onNavigate?.("wsi-viewer");
          }}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <FileSearchOutlined style={{ marginRight: 12, color: "#595959" }} />
          WSI Slides
        </Title>
      }
      subTitle="Confirmed whole slide images linked to surgical cases"
      extra={
        <Space>
          <Input.Search
            placeholder="Search filename, accession, block..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (total) => `${total} slides` }}
        size="middle"
      />
    </PageContainer>
  );
};

export default WSISlideGallery;
