import React, { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LinkOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import WsiSettingService from "../../services/wsiSettingService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import type { WsiFile, WsiScanResult } from "../../types/system";
import type { SurgicalCase } from "../../types/surgical";

const { Title, Text } = Typography;

interface Props {
  onNavigate?: (view: string) => void;
}

const WsiFileListPage: React.FC<Props> = ({ onNavigate }) => {
  const [files, setFiles] = useState<WsiFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [scanResult, setScanResult] = useState<WsiScanResult | null>(null);

  // Review pending modal state
  const [reviewFile, setReviewFile] = useState<WsiFile | null>(null);
  const [reviewLoading, setReviewLoading] = useState<Set<number>>(new Set());

  // Manual link modal state
  const [linkFile, setLinkFile] = useState<WsiFile | null>(null);
  const [caseSearch, setCaseSearch] = useState("");
  const [caseResults, setCaseResults] = useState<SurgicalCase[]>([]);
  const [caseSearching, setCaseSearching] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [stainType, setStainType] = useState("HE");
  const [isPrimary, setIsPrimary] = useState(true);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await WsiSettingService.listWsiFiles({ limit: 500 });
      setFiles(data);
    } catch {
      message.error("Failed to load WSI files. Check WSI root path in System Settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await WsiSettingService.triggerScan();
      setScanResult(result);
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleLinkAction = async (linkId: number, status: "confirmed" | "rejected") => {
    setReviewLoading((prev) => new Set(prev).add(linkId));
    try {
      await WsiSettingService.updateLink(linkId, { status });
      const patchLinks = (links: WsiFile["slide_links"]) =>
        links.map((l) => (l.id === linkId ? { ...l, status } : l));
      setFiles((prev) =>
        prev.map((f) => ({ ...f, slide_links: patchLinks(f.slide_links) }))
      );
      setReviewFile((prev) =>
        prev ? { ...prev, slide_links: patchLinks(prev.slide_links) } : null
      );
      message.success(status === "confirmed" ? "Link confirmed" : "Link rejected");
    } catch {
      message.error("Failed to update link");
    } finally {
      setReviewLoading((prev) => {
        const next = new Set(prev);
        next.delete(linkId);
        return next;
      });
    }
  };

  const searchCases = async (q: string) => {
    if (!q.trim()) { setCaseResults([]); return; }
    setCaseSearching(true);
    try {
      const res = await SurgicalCaseService.getCases({ search: q, limit: 5 } as any);
      setCaseResults(res.items ?? []);
    } catch {
      setCaseResults([]);
    } finally {
      setCaseSearching(false);
    }
  };

  const openLinkModal = (record: WsiFile) => {
    setLinkFile(record);
    setCaseSearch(record.parsed_accession ?? "");
    setCaseResults([]);
    setSelectedBlockId(null);
    setStainType("HE");
    setIsPrimary(true);
    if (record.parsed_accession) {
      searchCases(record.parsed_accession);
    }
  };

  const handleManualLink = async () => {
    if (!linkFile || !selectedBlockId) return;
    setLinkSubmitting(true);
    try {
      // reject existing links before creating a new one
      await Promise.all(
        linkFile.slide_links
          .filter((l) => l.status !== "rejected")
          .map((l) => WsiSettingService.updateLink(l.id, { status: "rejected" }))
      );
      const link = await WsiSettingService.createLink({
        wsi_file_id: linkFile.id,
        surgical_block_id: selectedBlockId,
        stain_type: stainType,
        is_primary: isPrimary,
      });
      await WsiSettingService.updateLink(link.id, { status: "confirmed" });
      message.success("Linked and confirmed");
      setLinkFile(null);
      await load();
    } catch {
      message.error("Failed to link");
    } finally {
      setLinkSubmitting(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = files.filter((f) =>
    f.filename.toLowerCase().includes(search.toLowerCase())
  );

  const linkStatusCell = (record: WsiFile) => {
    const links = record.slide_links;
    const isUnlinked = !links || links.length === 0;
    const hasConfirmed = links?.some((l) => l.status === "confirmed");
    const hasPending = links?.some((l) => l.status === "pending");
    const allRejected = links?.length > 0 && links.every((l) => l.status === "rejected");

    if (isUnlinked)
      return (
        <Space size={6}>
          <Badge status="default" text="Unlinked" />
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            style={{ padding: 0, height: "auto" }}
            onClick={() => openLinkModal(record)}
          >
            Link
          </Button>
        </Space>
      );

    if (hasConfirmed) {
      const confirmedLink = links.find((l) => l.status === "confirmed");
      const label = confirmedLink?.accession_no && confirmedLink?.block_code
        ? `${confirmedLink.accession_no} · ${confirmedLink.block_code}`
        : "Confirmed";
      return (
        <Space size={6}>
          <Badge status="success" text={label} />
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            style={{ padding: 0, height: "auto", color: "#8c8c8c" }}
            onClick={() => openLinkModal(record)}
          >
            Edit
          </Button>
        </Space>
      );
    }

    if (hasPending)
      return (
        <Space size={6}>
          <Badge status="warning" text="Pending" />
          <Button
            type="link"
            size="small"
            icon={<AuditOutlined />}
            style={{ padding: 0, height: "auto" }}
            onClick={() => setReviewFile(record)}
          >
            Review
          </Button>
        </Space>
      );

    if (allRejected)
      return (
        <Space size={6}>
          <Badge status="error" text="Rejected" />
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            style={{ padding: 0, height: "auto" }}
            onClick={() => openLinkModal(record)}
          >
            Re-link
          </Button>
        </Space>
      );

    return <Badge status="default" text="—" />;
  };

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
        const v = record.format
          ?? record.filename.split(".").pop()?.toUpperCase();
        return v ? <Tag color="blue">{v}</Tag> : <Tag>—</Tag>;
      },
    },
    {
      title: "Accession",
      key: "parsed_accession",
      width: 130,
      render: (_, record) => {
        const v = record.parsed_accession
          ?? record.slide_links.find((l) => l.status === "confirmed")?.accession_no;
        return v ? <span>{v}</span> : <span style={{ color: "#bfbfbf" }}>—</span>;
      },
    },
    {
      title: "Block",
      key: "parsed_block",
      width: 80,
      render: (_, record) => {
        const v = record.parsed_block
          ?? record.slide_links.find((l) => l.status === "confirmed")?.block_code;
        return v ? <span>{v}</span> : <span style={{ color: "#bfbfbf" }}>—</span>;
      },
    },
    {
      title: "Link Status",
      key: "link_status",
      width: 200,
      render: (_, record) => linkStatusCell(record),
      filters: [
        { text: "Confirmed", value: "confirmed" },
        { text: "Pending", value: "pending" },
        { text: "Unlinked", value: "unlinked" },
        { text: "Rejected", value: "rejected" },
      ],
      onFilter: (value, record) => {
        if (value === "unlinked") return record.slide_links.length === 0;
        return record.slide_links.some((l) => l.status === value);
      },
    },
    {
      title: "Size (MB)",
      key: "size_mb",
      width: 110,
      sorter: (a, b) => (a.file_size_bytes ?? 0) - (b.file_size_bytes ?? 0),
      render: (_, r) =>
        r.file_size_bytes ? (r.file_size_bytes / 1024 / 1024).toFixed(1) : "—",
    },
    {
      title: "Last Seen",
      dataIndex: "last_seen_at",
      key: "last_seen_at",
      width: 150,
      sorter: (a, b) =>
        (a.last_seen_at ?? a.discovered_at).localeCompare(b.last_seen_at ?? b.discovered_at),
      defaultSortOrder: "descend",
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
          WSI Files
        </Title>
      }
      subTitle="Whole slide images in the configured WSI storage path"
      extra={
        <Space>
          <Input.Search
            placeholder="Search filename..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <Button icon={<ScanOutlined />} onClick={handleScan} loading={scanning}>
            Scan Files
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            Refresh
          </Button>
          <Button icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)}>
            How to use
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (total) => `${total} files` }}
        size="middle"
      />

      {/* How to use modal */}
      <Modal
        title={<Space><QuestionCircleOutlined style={{ color: "#1677ff" }} /> How to Use — WSI Files</Space>}
        open={helpOpen}
        onCancel={() => setHelpOpen(false)}
        footer={<Button type="primary" onClick={() => setHelpOpen(false)}>Got it</Button>}
        width={620}
      >
        <div style={{ lineHeight: 1.8, fontSize: 14 }}>
          <p style={{ marginBottom: 16, color: "#595959" }}>
            This page manages Whole Slide Image (WSI) files discovered in the configured storage path.
            Histology staff use this page to scan, review, and link slide files to surgical cases.
          </p>

          <Title level={5} style={{ marginBottom: 8 }}>Workflow</Title>
          <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li style={{ marginBottom: 8 }}>
              <Text strong>Scan Files</Text> — Click <Text code>Scan Files</Text> to discover new WSI files
              in the storage folder. Files are matched to surgical cases automatically when the filename
              follows the configured pattern (e.g. <Text code>S25-001_A1.svs</Text>).
            </li>
            <li style={{ marginBottom: 8 }}>
              <Text strong>Review pending links</Text> — Files matched automatically appear as{" "}
              <Badge status="warning" text="Pending" />. Click <Text code>Review</Text> to confirm
              or reject the suggested link.
            </li>
            <li style={{ marginBottom: 8 }}>
              <Text strong>Manual link</Text> — Files with non-standard names show as{" "}
              <Badge status="default" text="Unlinked" />. Click <Text code>Link</Text> to search for
              a case, select a block, and confirm the link manually.
            </li>
            <li style={{ marginBottom: 8 }}>
              <Text strong>Edit a confirmed link</Text> — If a slide was linked to the wrong block,
              click <Text code>Edit</Text> next to a <Badge status="success" text="Confirmed" /> badge
              to re-link it. The previous link will be rejected automatically.
            </li>
            <li>
              <Text strong>Open viewer</Text> — Click <Text code>Open</Text> on any row to launch
              the full-screen WSI viewer in a new tab.
            </li>
          </ol>

          <Title level={5} style={{ marginBottom: 8 }}>Link Status</Title>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            <Space><Badge status="default" text="Unlinked" /> — No case associated. Link manually.</Space>
            <Space><Badge status="warning" text="Pending" /> — Auto-matched. Awaiting confirmation.</Space>
            <Space><Badge status="success" text="Confirmed" /> — Linked and confirmed. Visible to pathologists.</Space>
            <Space><Badge status="error" text="Rejected" /> — Link was rejected. Can be re-linked.</Space>
          </div>

          <Title level={5} style={{ marginBottom: 8 }}>Tips</Title>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>Accession and Block columns auto-fill from the filename when a scanner profile is configured.</li>
            <li>For non-standard filenames, these columns fall back to the confirmed link's block info.</li>
            <li>Only <Badge status="success" text="Confirmed" /> slides appear in the pathologist's diagnosis form.</li>
          </ul>
        </div>
      </Modal>

      {/* Scan result modal */}
      <Modal
        title="Scan Complete"
        open={scanResult !== null}
        onOk={() => setScanResult(null)}
        onCancel={() => setScanResult(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setScanResult(null)}>
            OK
          </Button>,
        ]}
      >
        {scanResult && (
          <div style={{ display: "flex", gap: 24, justifyContent: "center", padding: "16px 0" }}>
            <Statistic title="New Files" value={scanResult.discovered} />
            <Statistic title="Updated" value={scanResult.updated} />
            <Statistic title="Auto-linked" value={scanResult.auto_linked} />
            <Statistic title="Pending Review" value={scanResult.pending_review} />
          </div>
        )}
      </Modal>

      {/* Review pending links modal */}
      <Modal
        title={
          <Space>
            <AuditOutlined style={{ color: "#faad14" }} />
            Review Slide Link
          </Space>
        }
        open={reviewFile !== null}
        onCancel={() => setReviewFile(null)}
        footer={<Button onClick={() => setReviewFile(null)}>Close</Button>}
        width={520}
      >
        {reviewFile && (
          <>
            <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
              {reviewFile.filename}
            </Text>
            {reviewFile.slide_links.filter((l) => l.status === "pending").length === 0 ? (
              <Text type="secondary">No pending links.</Text>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {reviewFile.slide_links
                  .filter((l) => l.status === "pending")
                  .map((link) => {
                    const isLoading = reviewLoading.has(link.id);
                    const confidencePct =
                      link.link_confidence != null
                        ? `${Math.round(link.link_confidence * 100)}%`
                        : "—";
                    return (
                      <Card
                        key={link.id}
                        size="small"
                        styles={{ body: { padding: "12px 16px" } }}
                        style={{ borderColor: "#faad14", borderRadius: 8 }}
                      >
                        <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
                          <Descriptions.Item label="Accession">
                            {reviewFile.parsed_accession || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Block">
                            {reviewFile.parsed_block || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Method">
                            <Tag color="blue">{link.link_method || "—"}</Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="Confidence">
                            {confidencePct}
                          </Descriptions.Item>
                        </Descriptions>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                          <Button
                            danger
                            size="small"
                            icon={<CloseCircleOutlined />}
                            loading={isLoading}
                            onClick={() => handleLinkAction(link.id, "rejected")}
                          >
                            Reject
                          </Button>
                          <Button
                            type="primary"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            loading={isLoading}
                            onClick={() => handleLinkAction(link.id, "confirmed")}
                          >
                            Confirm
                          </Button>
                        </Space>
                      </Card>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Manual link modal */}
      <Modal
        title={
          <Space>
            <LinkOutlined style={{ color: "#1677ff" }} />
            Link WSI to Case
          </Space>
        }
        open={linkFile !== null}
        onCancel={() => setLinkFile(null)}
        footer={
          <Space>
            <Button onClick={() => setLinkFile(null)}>Cancel</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={!selectedBlockId}
              loading={linkSubmitting}
              onClick={handleManualLink}
            >
              Link &amp; Confirm
            </Button>
          </Space>
        }
        width={560}
      >
        {linkFile && (
          <>
            <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
              {linkFile.filename}
            </Text>

            <Input.Search
              placeholder="Search accession no. or patient name..."
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
              onSearch={searchCases}
              loading={caseSearching}
              enterButton
              style={{ marginBottom: 12 }}
            />

            {caseResults.length > 0 && (
              <Radio.Group
                value={selectedBlockId}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                style={{ width: "100%" }}
              >
                <div
                  style={{
                    maxHeight: 280,
                    overflowY: "auto",
                    border: "1px solid #f0f0f0",
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginBottom: 16,
                  }}
                >
                  {caseResults.map((c) => (
                    <div key={c.id} style={{ marginBottom: 10 }}>
                      <Text strong style={{ fontSize: 13 }}>
                        {c.accession_no}
                      </Text>
                      {c.specimens?.map((spec) => (
                        <div key={spec.id} style={{ paddingLeft: 12, marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 2 }}>
                            {spec.specimen_label}: {spec.specimen_name}
                          </Text>
                          {spec.blocks?.map((blk) => (
                            <div key={blk.id} style={{ paddingLeft: 16 }}>
                              <Radio value={blk.id} style={{ fontSize: 13 }}>
                                Block {(blk as any).block_code ?? `${spec.specimen_label}${blk.block_no}`}
                              </Radio>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Radio.Group>
            )}

            {caseResults.length === 0 && caseSearch && !caseSearching && (
              <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                No cases found. Try a different search term.
              </Text>
            )}

            <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 4 }}>Stain</div>
                <Select
                  value={stainType}
                  onChange={setStainType}
                  size="small"
                  style={{ width: 120 }}
                  options={[
                    { value: "HE", label: "H&E" },
                    { value: "IHC", label: "IHC" },
                    { value: "Special", label: "Special" },
                  ]}
                />
              </div>
              <Checkbox
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
              >
                Primary slide
              </Checkbox>
            </div>
          </>
        )}
      </Modal>
    </PageContainer>
  );
};

export default WsiFileListPage;
