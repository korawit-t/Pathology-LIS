import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import WSISlideGallery from ".";
import WsiSettingService from "../../services/wsiSettingService";
import type { WsiFile } from "../../types/system";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/wsiSettingService", () => ({
  default: { listWsiFiles: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const file = (over: Partial<WsiFile> = {}) =>
  ({
    id: 1,
    filename: "S26-00001_A1.svs",
    file_path: "/wsi/S26-00001_A1.svs",
    file_size_bytes: 5 * 1024 * 1024,
    discovered_at: "2026-09-01T10:00:00",
    last_seen_at: "2026-09-02T10:00:00",
    slide_links: [
      { status: "confirmed", accession_no: "S26-00001", block_code: "A1" },
    ],
    ...over,
  }) as unknown as WsiFile;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(WsiSettingService.listWsiFiles).mockResolvedValue([file()]);
  sessionStorage.clear();
});

const renderGallery = (onNavigate = vi.fn()) => {
  render(
    <AntdApp>
      <WSISlideGallery onNavigate={onNavigate} />
    </AntdApp>,
  );
  return onNavigate;
};

describe("WSISlideGallery", () => {
  it("lists a confirmed slide with its accession and block", async () => {
    renderGallery();
    expect(await screen.findByText("S26-00001_A1.svs")).toBeInTheDocument();
    expect(screen.getByText("S26-00001 · A1")).toBeInTheDocument();
  });

  it("hides files whose link is still pending confirmation", async () => {
    // แกลเลอรีนี้เป็นของสไลด์ที่ยืนยันการผูกกับเคสแล้วเท่านั้น
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file(),
      file({
        id: 2,
        filename: "UNCONFIRMED.svs",
        slide_links: [{ status: "pending", accession_no: "S26-00002" }] as never,
      }),
      file({ id: 3, filename: "ORPHAN.svs", slide_links: [] as never }),
    ]);
    renderGallery();

    await screen.findByText("S26-00001_A1.svs");
    expect(screen.queryByText("UNCONFIRMED.svs")).toBeNull();
    expect(screen.queryByText("ORPHAN.svs")).toBeNull();
  });

  it("derives the format from the file extension when none is stored", async () => {
    renderGallery();
    expect(await screen.findByText("SVS")).toBeInTheDocument();
  });

  it("prefers the parsed accession over the linked one", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({ parsed_accession: "S26-PARSED" } as never),
    ]);
    renderGallery();
    expect(await screen.findByText("S26-PARSED")).toBeInTheDocument();
  });

  it("shows the size in MB, not raw bytes", async () => {
    renderGallery();
    expect(await screen.findByText("5.0")).toBeInTheDocument();
  });

  it("searches filename, accession and block together", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file(),
      file({
        id: 2,
        filename: "other.svs",
        slide_links: [
          { status: "confirmed", accession_no: "S26-99999", block_code: "B2" },
        ] as never,
      }),
    ]);
    renderGallery();
    await screen.findByText("S26-00001_A1.svs");

    const search = screen.getByPlaceholderText(/Search filename/i);
    fireEvent.change(search, { target: { value: "b2" } });

    // ค้นด้วย block code ต้องเจอไฟล์ที่ชื่อไม่ได้มีคำนั้นเลย
    expect(await screen.findByText("other.svs")).toBeInTheDocument();
    expect(screen.queryByText("S26-00001_A1.svs")).toBeNull();
  });

  it("hands the viewer the file path through sessionStorage", async () => {
    const onNavigate = renderGallery();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.click(screen.getByText("Open").closest("button") as Element);

    expect(sessionStorage.getItem("wsi_viewer_path")).toBe("/wsi/S26-00001_A1.svs");
    expect(onNavigate).toHaveBeenCalledWith("wsi-viewer");
  });

  it("reports a failed load instead of showing an empty gallery", async () => {
    mocked(WsiSettingService.listWsiFiles).mockRejectedValue(new Error("boom"));
    renderGallery();
    expect(
      await screen.findByText("Failed to load WSI slides."),
    ).toBeInTheDocument();
  });

  it("reloads on demand", async () => {
    renderGallery();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.click(screen.getByText("Refresh").closest("button") as Element);
    await waitFor(() =>
      expect(mocked(WsiSettingService.listWsiFiles).mock.calls.length).toBe(2),
    );
  });
});
