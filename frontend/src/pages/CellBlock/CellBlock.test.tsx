import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import CellBlock from ".";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/nongyneCytoCaseService", () => ({
  default: { getAll: vi.fn(), update: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const kase = (over: Record<string, unknown> = {}) => ({
  id: 1,
  accession_no: "N26-00001",
  hn: "0012345",
  patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจงาม" },
  specimen_type: "Pleural fluid",
  cell_block_status: "pending",
  status: "registered",
  registered_at: "2026-09-01T09:00:00",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked(NongyneCytologyCaseService.getAll).mockResolvedValue({
    items: [kase()],
    total: 1,
  });
  mocked(NongyneCytologyCaseService.update).mockResolvedValue({});
});

const renderPage = (onOpenCase = vi.fn()) => {
  render(
    <AntdApp>
      <CellBlock onOpenCase={onOpenCase} />
    </AntdApp>,
  );
  return onOpenCase;
};

const finishWith = async (label: "Mark as Ready" | "Mark as Failed") => {
  fireEvent.click(screen.getByText("Finish").closest("button") as Element);
  const dialog = await screen.findByText("Finish Cell Block Preparation");
  const modal = dialog.closest(".ant-modal") as HTMLElement;
  if (label === "Mark as Failed") {
    fireEvent.click(
      Array.from(modal.querySelectorAll("*")).find(
        (el) => el.textContent === "Failed" && el.children.length === 0,
      ) as Element,
    );
  }
  const ok = Array.from(modal.querySelectorAll("button")).find((b) =>
    (b.textContent || "").includes(label),
  );
  fireEvent.click(ok as Element);
};

describe("CellBlock queue", () => {
  it("lists cases with the patient's full name", async () => {
    renderPage();
    expect(await screen.findByText("N26-00001")).toBeInTheDocument();
    expect(screen.getByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
  });

  it("opens the case when the accession is clicked", async () => {
    const onOpenCase = renderPage();
    await screen.findByText("N26-00001");

    fireEvent.click(screen.getByText("N26-00001"));
    expect(onOpenCase).toHaveBeenCalledWith(1);
  });

  it("reports a failed load rather than an empty queue", async () => {
    mocked(NongyneCytologyCaseService.getAll).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(
      await screen.findByText("Failed to load cell block cases."),
    ).toBeInTheDocument();
  });

  it("passes the status filter to the server", async () => {
    renderPage();
    await screen.findByText("N26-00001");

    fireEvent.mouseDown(
      screen.getByText("All Statuses").closest(".ant-select")
        ?.querySelector(".ant-select-content") as Element,
    );
    fireEvent.click(await screen.findByTitle("Processing"));

    await waitFor(() =>
      expect(NongyneCytologyCaseService.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ cell_block_status: "processing" }),
      ),
    );
  });
});

describe("CellBlock finishing a preparation", () => {
  it("offers Finish only while the block is still in progress", async () => {
    mocked(NongyneCytologyCaseService.getAll).mockResolvedValue({
      items: [
        kase({ id: 1, cell_block_status: "pending" }),
        kase({ id: 2, accession_no: "N26-00002", cell_block_status: "ready" }),
        kase({ id: 3, accession_no: "N26-00003", cell_block_status: "failed" }),
      ],
      total: 3,
    });
    renderPage();
    await screen.findByText("N26-00001");

    // เคสที่จบไปแล้ว (ready/failed) ต้องไม่มีปุ่มให้กดซ้ำ
    expect(screen.getAllByText("Finish")).toHaveLength(1);
  });

  it("marks a finished block ready", async () => {
    renderPage();
    await screen.findByText("N26-00001");
    await finishWith("Mark as Ready");

    await waitFor(() =>
      expect(NongyneCytologyCaseService.update).toHaveBeenCalledWith(1, {
        cell_block_status: "ready",
      }),
    );
  });

  it("records a failed preparation as failed, not ready", async () => {
    // เซลล์บล็อกที่ทำไม่สำเร็จต้องบันทึกตามจริง ไม่งั้นคนอ่านผลรอสไลด์ที่ไม่มีวันมา
    renderPage();
    await screen.findByText("N26-00001");
    await finishWith("Mark as Failed");

    await waitFor(() =>
      expect(NongyneCytologyCaseService.update).toHaveBeenCalledWith(1, {
        cell_block_status: "failed",
      }),
    );
  });

  it("says so when the status could not be saved", async () => {
    mocked(NongyneCytologyCaseService.update).mockRejectedValue(new Error("500"));
    renderPage();
    await screen.findByText("N26-00001");
    await finishWith("Mark as Ready");

    expect(
      await screen.findByText("Failed to update cell block."),
    ).toBeInTheDocument();
  });
});
