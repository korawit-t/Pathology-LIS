import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import WSIViewerPage from "./WSIViewerPage";

// OpenSeadragon ต้องมี canvas/WebGL จริง — jsdom ไม่มี จึงแทนด้วย viewer ปลอม
const osdCalls: Record<string, unknown>[] = [];
const destroy = vi.fn();
vi.mock("openseadragon", () => ({
  default: (opts: Record<string, unknown>) => {
    osdCalls.push(opts);
    return { destroy, addHandler: vi.fn(), navigator: undefined };
  },
}));

const okJson = (body: unknown) => ({ ok: true, json: async () => body });
const errJson = (body: unknown) => ({ ok: false, json: async () => body });

const info = {
  format: "aperio",
  dimensions: [40000, 30000],
  level_count: 4,
  level_dimensions: [],
  level_downsamples: [],
  mpp_x: "0.25",
  mpp_y: "0.25",
};
const dzi = { tile_size: 254, overlap: 1, level_count: 9, width: 40000, height: 30000 };

beforeEach(() => {
  vi.clearAllMocks();
  osdCalls.length = 0;
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  globalThis.fetch = vi.fn(async (url: string) =>
    String(url).includes("dzi-info") ? okJson(dzi) : okJson(info),
  ) as unknown as typeof fetch;
});

const renderViewer = (props = {}) =>
  render(
    <AntdApp>
      <WSIViewerPage {...props} />
    </AntdApp>,
  );

describe("WSIViewerPage slide source", () => {
  it("says what to do when no slide was chosen", () => {
    renderViewer();
    expect(screen.getByText(/No file specified/)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("opens the slide the gallery handed over in sessionStorage", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/S26-00001_A1.svs");
    renderViewer();

    // ชื่อไฟล์ในหัวเรื่องต้องเป็น basename ไม่ใช่ path เต็ม
    expect(await screen.findByText("/ S26-00001_A1.svs")).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("lets a ?path= query string win over the stored slide", async () => {
    // เปิดลิงก์ตรงไปยังสไลด์หนึ่ง ต้องไม่โดนสไลด์ที่เคยเปิดค้างไว้แย่ง
    sessionStorage.setItem("wsi_viewer_path", "/wsi/stale.svs");
    window.history.replaceState({}, "", "/?path=%2Fwsi%2Ffresh.svs");
    renderViewer();

    expect(await screen.findByText("/ fresh.svs")).toBeInTheDocument();
  });

  it("handles a Windows-style path when naming the slide", async () => {
    sessionStorage.setItem("wsi_viewer_path", "C:\\slides\\S26-00002_B1.ndpi");
    renderViewer();
    expect(await screen.findByText("/ S26-00002_B1.ndpi")).toBeInTheDocument();
  });
});

describe("WSIViewerPage metadata and errors", () => {
  it("shows the slide dimensions and microns-per-pixel", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/a.svs");
    renderViewer();

    expect(await screen.findByText("40,000 × 30,000 px")).toBeInTheDocument();
    expect(screen.getByText("0.25 µm")).toBeInTheDocument();
  });

  it("says N/A rather than blank when the slide has no MPP", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/a.svs");
    globalThis.fetch = vi.fn(async (url: string) =>
      String(url).includes("dzi-info") ? okJson(dzi) : okJson({ ...info, mpp_x: null }),
    ) as unknown as typeof fetch;
    renderViewer();

    expect(await screen.findByText("N/A µm")).toBeInTheDocument();
  });

  it("surfaces the server's reason when the slide cannot be read", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/broken.svs");
    globalThis.fetch = vi.fn(async () =>
      errJson({ detail: "Unsupported slide format" }),
    ) as unknown as typeof fetch;
    renderViewer();

    expect(await screen.findByText("Unsupported slide format")).toBeInTheDocument();
  });

  it("does not build a viewer when the tile source is unavailable", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/broken.svs");
    globalThis.fetch = vi.fn(async (url: string) =>
      String(url).includes("dzi-info")
        ? errJson({ detail: "DZI unavailable" })
        : okJson(info),
    ) as unknown as typeof fetch;
    renderViewer();

    expect(await screen.findByText("DZI unavailable")).toBeInTheDocument();
    expect(osdCalls.length).toBe(0);
  });
});

describe("WSIViewerPage tiling", () => {
  it("builds tile URLs against the slide it opened", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/S26-00001_A1.svs");
    renderViewer();

    await waitFor(() => expect(osdCalls.length).toBe(1));
    const tileSources = osdCalls[0].tileSources as {
      maxLevel: number;
      tileSize: number;
      getTileUrl: (l: number, x: number, y: number) => string;
    };
    // maxLevel เป็น index จึงต้องเป็น level_count - 1 ไม่ใช่ level_count
    expect(tileSources.maxLevel).toBe(8);
    expect(tileSources.tileSize).toBe(254);
    expect(tileSources.getTileUrl(3, 1, 2)).toContain("/wsi/dzi-tile/3/1/2");
    expect(tileSources.getTileUrl(3, 1, 2)).toContain(
      encodeURIComponent("/wsi/S26-00001_A1.svs"),
    );
  });

  it("tears the viewer down when the page goes away", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/a.svs");
    const { unmount } = renderViewer();
    await waitFor(() => expect(osdCalls.length).toBe(1));

    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  it("offers a back action only when the host page provides one", async () => {
    sessionStorage.setItem("wsi_viewer_path", "/wsi/a.svs");
    const onBack = vi.fn();
    const { unmount } = renderViewer({ onBack });
    fireEvent.click(
      document.querySelector(".anticon-arrow-left")?.closest("button") as Element,
    );
    expect(onBack).toHaveBeenCalled();
    unmount();

    renderViewer();
    expect(document.querySelector(".anticon-arrow-left")).toBeNull();
  });
});
