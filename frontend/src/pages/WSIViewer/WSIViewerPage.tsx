import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Typography,
  Alert,
  Spin,
  Space,
} from "antd";
import { PictureOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import OpenSeadragon from "openseadragon";

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

interface WSIInfo {
  format: string;
  dimensions: [number, number];
  level_count: number;
  level_dimensions: [number, number][];
  level_downsamples: number[];
  mpp_x: string | null;
  mpp_y: string | null;
}

interface DziInfo {
  tile_size: number;
  overlap: number;
  level_count: number;
  width: number;
  height: number;
}

interface Props {
  onBack?: () => void;
}

export default function WSIViewerPage({ onBack }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const osdRef = useRef<OpenSeadragon.Viewer | null>(null);

  const filePath =
    new URLSearchParams(window.location.search).get("path") ??
    sessionStorage.getItem("wsi_viewer_path") ??
    "";
  const filename = filePath.split(/[/\\]/).pop() ?? filePath;

  const [info, setInfo] = useState<WSIInfo | null>(null);
  const [dzi, setDzi] = useState<DziInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlide = async (path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    setDzi(null);

    try {
      const [infoRes, dziRes] = await Promise.all([
        fetch(`${API_BASE}/wsi/info?path=${encodeURIComponent(path)}`),
        fetch(`${API_BASE}/wsi/dzi-info?path=${encodeURIComponent(path)}`),
      ]);

      if (!infoRes.ok) {
        const d = await infoRes.json();
        throw new Error(d.detail || "Failed to load slide info");
      }
      if (!dziRes.ok) {
        const d = await dziRes.json();
        throw new Error(d.detail || "Failed to load DZI info");
      }

      setInfo(await infoRes.json());
      setDzi(await dziRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!dzi || !viewerRef.current) return;

    osdRef.current?.destroy();
    osdRef.current = null;

    const encodedPath = encodeURIComponent(filePath);

    const thumbnailUrl = `${API_BASE}/wsi/thumbnail?path=${encodedPath}`;

    const viewer = OpenSeadragon({
      element: viewerRef.current,
      prefixUrl: "/osd-images/",
      showNavigationControl: true,
      showNavigator: true,
      navigatorPosition: "BOTTOM_RIGHT",
      navigatorBackground: "#fff",
      navigatorOpacity: 1,
      animationTime: 0.3,
      tileSources: {
        height: dzi.height,
        width: dzi.width,
        tileSize: dzi.tile_size,
        tileOverlap: dzi.overlap,
        minLevel: 0,
        maxLevel: dzi.level_count - 1,
        getTileUrl(level: number, x: number, y: number) {
          return `${API_BASE}/wsi/dzi-tile/${level}/${x}/${y}?path=${encodedPath}`;
        },
      },
    });

    // ใส่ thumbnail เป็น background ของ navigator canvas เพื่อแสดง overview
    viewer.addHandler("open", () => {
      const navEl = (viewer as any).navigator?.element as HTMLElement | undefined;
      if (navEl) {
        navEl.style.backgroundImage = `url("${thumbnailUrl}")`;
        navEl.style.backgroundSize = "100% 100%";
        navEl.style.backgroundRepeat = "no-repeat";
      }
    });

    osdRef.current = viewer;
  }, [dzi]);

  useEffect(() => {
    if (filePath) loadSlide(filePath);
    return () => { osdRef.current?.destroy(); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", padding: "16px 24px 0" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {onBack && (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
        )}
        <Space size={8}>
          <PictureOutlined style={{ fontSize: 18, color: "#595959" }} />
          <Title level={4} style={{ margin: 0 }}>WSI Viewer</Title>
          {filename && <Text type="secondary">/ {filename}</Text>}
          {loading && <Spin size="small" />}
        </Space>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 8 }} />}

      {!filePath && !loading && !error && (
        <div style={{ color: "#8c8c8c", textAlign: "center", marginTop: 60 }}>
          No file specified. Go back and open a file from WSI Files list.
        </div>
      )}

      {info && (
        <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "8px 16px" } }}>
          <Descriptions size="small" column={6}>
            <Descriptions.Item label="Format">{info.format}</Descriptions.Item>
            <Descriptions.Item label="Size">
              {info.dimensions[0].toLocaleString()} × {info.dimensions[1].toLocaleString()} px
            </Descriptions.Item>
            <Descriptions.Item label="Levels">{info.level_count}</Descriptions.Item>
            <Descriptions.Item label="MPP">{info.mpp_x ?? "N/A"} µm</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <div
        ref={viewerRef}
        style={{ flex: 1, width: "100%", minHeight: 0, background: "#f5f5f5" }}
      />
    </div>
  );
}
