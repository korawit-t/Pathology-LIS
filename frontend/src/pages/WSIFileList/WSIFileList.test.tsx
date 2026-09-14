import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import WSIFileList from ".";
import WsiSettingService from "../../services/wsiSettingService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import type { WsiFile } from "../../types/system";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/wsiSettingService", () => ({
  default: {
    listWsiFiles: vi.fn(),
    triggerScan: vi.fn(),
    updateLink: vi.fn(),
    createLink: vi.fn(),
  },
}));
vi.mock("../../services/surgicalCaseService", () => ({
  default: { getCases: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const file = (over: Partial<WsiFile> = {}) =>
  ({
    id: 1,
    filename: "S26-00001_A1.svs",
    file_path: "/wsi/S26-00001_A1.svs",
    file_size_bytes: 1024 * 1024,
    discovered_at: "2026-09-01T10:00:00",
    last_seen_at: "2026-09-02T10:00:00",
    parsed_accession: null,
    slide_links: [],
    ...over,
  }) as unknown as WsiFile;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(WsiSettingService.listWsiFiles).mockResolvedValue([file()]);
  mocked(SurgicalCaseService.getCases).mockResolvedValue({ items: [], total: 0 });
});

const renderPage = () =>
  render(
    <AntdApp>
      <WSIFileList />
    </AntdApp>,
  );

describe("WSIFileList link status", () => {
  it("offers to link a file the scanner could not match", async () => {
    renderPage();
    expect(await screen.findByText("Unlinked")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();
  });

  it("names the case and block once a link is confirmed", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({
        slide_links: [
          { id: 5, status: "confirmed", accession_no: "S26-00001", block_code: "A1" },
        ] as never,
      }),
    ]);
    renderPage();

    expect(await screen.findByText("S26-00001 · A1")).toBeInTheDocument();
    // ผูกแล้วยังต้องแก้ได้ ไม่ใช่ตันอยู่แค่นั้น
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("tells the operator where to look when the file list cannot load", async () => {
    // สาเหตุที่พบบ่อยคือ WSI root path ตั้งผิด ไม่ใช่ backend ล่ม
    mocked(WsiSettingService.listWsiFiles).mockRejectedValue(new Error("boom"));
    renderPage();

    expect(
      await screen.findByText(/Check WSI root path in System Settings/),
    ).toBeInTheDocument();
  });

  it("filters the list by filename", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file(),
      file({ id: 2, filename: "other-slide.ndpi" }),
    ]);
    renderPage();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.change(screen.getByPlaceholderText(/Search/i), {
      target: { value: "other" },
    });

    expect(await screen.findByText("other-slide.ndpi")).toBeInTheDocument();
    expect(screen.queryByText("S26-00001_A1.svs")).toBeNull();
  });
});

describe("WSIFileList scanning", () => {
  it("reloads the file list after a scan", async () => {
    mocked(WsiSettingService.triggerScan).mockResolvedValue({
      found: 3,
      created: 1,
      linked: 1,
    });
    renderPage();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.click(screen.getByText(/Scan/i).closest("button") as Element);

    await waitFor(() => expect(WsiSettingService.triggerScan).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocked(WsiSettingService.listWsiFiles).mock.calls.length).toBe(2),
    );
  });

  it("surfaces the server's reason when a scan is refused", async () => {
    mocked(WsiSettingService.triggerScan).mockRejectedValue({
      response: { data: { detail: "WSI root path is not configured" } },
    });
    renderPage();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.click(screen.getByText(/Scan/i).closest("button") as Element);
    expect(
      await screen.findByText("WSI root path is not configured"),
    ).toBeInTheDocument();
  });
});

describe("WSIFileList manual linking", () => {
  it("pre-searches with the accession parsed out of the filename", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({ parsed_accession: "S26-00001" } as never),
    ]);
    renderPage();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.click(screen.getByText("Link"));

    await waitFor(() =>
      expect(SurgicalCaseService.getCases).toHaveBeenCalledWith(
        expect.objectContaining({ search: "S26-00001" }),
      ),
    );
  });

  it("does not search on an empty accession", async () => {
    renderPage();
    await screen.findByText("S26-00001_A1.svs");

    fireEvent.click(screen.getByText("Link"));
    expect(SurgicalCaseService.getCases).not.toHaveBeenCalled();
  });

  it("rejects the previous confirmed link before making a new one", async () => {
    // ไฟล์เดียวต้องชี้บล็อกเดียว ไม่งั้นภาพสไลด์ไปโผล่ในเคสที่ไม่ใช่
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({
        parsed_accession: "S26-00001",
        slide_links: [
          { id: 5, status: "confirmed", accession_no: "S26-00001", block_code: "A1" },
        ],
      } as never),
    ]);
    mocked(SurgicalCaseService.getCases).mockResolvedValue({
      items: [
        {
          id: 1,
          accession_no: "S26-00001",
          specimens: [
            {
              id: 11,
              specimen_label: "A",
              specimen_name: "Skin",
              blocks: [{ id: 77, block_code: "A2", block_no: 2 }],
            },
          ],
        },
      ],
      total: 1,
    });
    mocked(WsiSettingService.updateLink).mockResolvedValue({});
    mocked(WsiSettingService.createLink).mockResolvedValue({ id: 9 });

    renderPage();
    await screen.findByText("S26-00001 · A1");
    fireEvent.click(screen.getByText("Edit"));

    // ป้าย Radio ถูกแบ่งเป็นสอง text node ("Block " กับ code) จึงจับด้วย matcher
    const radio = await screen.findByText(
      (_, el) => el?.tagName === "SPAN" && el.textContent === "Block A2",
    );
    fireEvent.click(radio);

    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Link & Confirm"),
    );
    fireEvent.click(confirm as Element);

    await waitFor(() =>
      expect(WsiSettingService.updateLink).toHaveBeenCalledWith(5, { status: "rejected" }),
    );
    await waitFor(() =>
      expect(WsiSettingService.createLink).toHaveBeenCalledWith(
        expect.objectContaining({ wsi_file_id: 1, surgical_block_id: 77 }),
      ),
    );
    await waitFor(() =>
      expect(WsiSettingService.updateLink).toHaveBeenCalledWith(9, { status: "confirmed" }),
    );
  });

  it("will not submit until a block has been picked", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({ parsed_accession: "S26-00001" } as never),
    ]);
    renderPage();
    await screen.findByText("S26-00001_A1.svs");
    fireEvent.click(screen.getByText("Link"));

    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Link & Confirm"),
    );
    expect(confirm).toBeDisabled();
  });
});

describe("WSIFileList link review", () => {
  it("offers review — not a silent accept — for a link the scanner guessed", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({
        slide_links: [
          { id: 5, status: "pending", accession_no: "S26-00001", block_code: "A1" },
        ],
      } as never),
    ]);
    renderPage();

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("marks a file rejected once every guess has been turned down", async () => {
    mocked(WsiSettingService.listWsiFiles).mockResolvedValue([
      file({
        slide_links: [{ id: 5, status: "rejected", accession_no: "S26-00001" }],
      } as never),
    ]);
    renderPage();

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    // ปฏิเสธแล้วต้องยังผูกใหม่ได้ ไม่ใช่ค้างอยู่แบบนั้นถาวร
    expect(screen.getByText("Re-link")).toBeInTheDocument();
  });
});
