import React, { useState, useEffect } from "react";
import {
  Card,
  Input,
  Button,
  Typography,
  Space,
  Spin,
  Empty,
  Divider,
  Checkbox,
  Tag,
  message,
} from "antd";
import {
  PrinterOutlined,
  ScanOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import GyneStainService from "../../../../services/gyneStainService";
import { GyneCytologyStain } from "../../../../types/gyne-stain";
import { printGyneStickers, toStickerSlide } from "../utils/generateGyneStickers";

const { Title, Text } = Typography;

const GyneQuickPrintTab: React.FC = () => {
  const [queue, setQueue] = useState<GyneCytologyStain[]>([]);
  const [filtered, setFiltered] = useState<GyneCytologyStain[]>([]);
  const [searchText, setSearchText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [printing, setPrinting] = useState(false);

  const loadQueue = async () => {
    setFetching(true);
    try {
      const data = await GyneStainService.getPendingPrint();
      setQueue(data);
      setFiltered(data);
    } catch {
      message.error("ไม่สามารถโหลดคิวการพิมพ์ได้");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleSearch = (value: string) => {
    setSearchText(value);
    if (!value.trim()) {
      setFiltered(queue);
    } else {
      const term = value.trim().toUpperCase();
      setFiltered(
        queue.filter((s) => {
          const acc = (s.accession_no || s.case?.accession_no || "").toUpperCase();
          return acc.includes(term);
        }),
      );
    }
    setSelectedIds([]);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map((s) => s.id));
  };

  const handlePrint = () => {
    const slides = filtered
      .filter((s) => selectedIds.includes(s.id))
      .map(toStickerSlide);
    if (slides.length === 0) return;
    setPrinting(true);
    try {
      printGyneStickers(slides);
      message.success(`ส่งพิมพ์ ${slides.length} สติ๊กเกอร์`);
      setSelectedIds([]);
      loadQueue();
    } finally {
      setTimeout(() => setPrinting(false), 1500);
    }
  };

  return (
    <Card
      style={{
        maxWidth: 700,
        margin: "40px auto",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            background: "#f9f0ff",
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <ScanOutlined style={{ fontSize: 32, color: "#722ed1" }} />
        </div>
        <Title level={4}>Quick Print — Gyne Slides</Title>
        <Text type="secondary">สไลด์ที่ยังไม่ได้พิมพ์สติ๊กเกอร์</Text>
      </div>

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Text strong>กรองตาม Accession No.</Text>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Input
              size="large"
              placeholder="e.g. CY26-00001"
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              allowClear
              style={{ flex: 1 }}
            />
            <Button size="large" onClick={loadQueue} loading={fetching}>
              Refresh
            </Button>
          </div>
        </div>

        <Divider style={{ margin: "4px 0" }} />

        {filtered.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Checkbox
              onChange={selectAll}
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              indeterminate={selectedIds.length > 0 && selectedIds.length < filtered.length}
            >
              เลือกทั้งหมด ({filtered.length})
            </Checkbox>
            {selectedIds.length > 0 && (
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                loading={printing}
                style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
              >
                พิมพ์ {selectedIds.length} แผ่น
              </Button>
            )}
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          {fetching ? (
            <div style={{ padding: 40 }}>
              <Spin tip="Loading..." />
            </div>
          ) : filtered.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              {filtered.map((stain) => {
                const accession = stain.accession_no || stain.case?.accession_no || "-";
                const isSelected = selectedIds.includes(stain.id);
                return (
                  <div
                    key={stain.id}
                    onClick={() => toggleSelect(stain.id)}
                    style={{
                      cursor: "pointer",
                      minWidth: 110,
                      minHeight: 80,
                      borderRadius: 8,
                      border: `2px solid ${isSelected ? "#722ed1" : stain.is_printed ? "#52c41a" : "#d9d9d9"}`,
                      background: isSelected ? "#f9f0ff" : "#fff",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "8px 12px",
                      position: "relative",
                      transition: "all 0.2s",
                    }}
                  >
                    {isSelected && (
                      <CheckCircleFilled
                        style={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          color: "#722ed1",
                          fontSize: 18,
                          background: "#fff",
                          borderRadius: "50%",
                        }}
                      />
                    )}
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      {stain.test?.name || "Pap Smear"}
                    </Text>
                    <Text strong style={{ fontSize: 13, color: "#722ed1" }}>
                      {accession}
                    </Text>
                    <Tag color="purple" style={{ fontSize: 10, marginTop: 2 }}>
                      Slide {stain.slide_no}
                    </Tag>
                    {stain.is_printed && !isSelected && (
                      <Text style={{ fontSize: 10, color: "#52c41a" }}>✓ Printed</Text>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty description="ไม่มีสไลด์รอพิมพ์" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      </Space>
    </Card>
  );
};

export default GyneQuickPrintTab;
