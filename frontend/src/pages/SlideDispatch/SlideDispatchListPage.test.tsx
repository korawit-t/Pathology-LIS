import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SlideDispatchListPage from "./SlideDispatchListPage.tsx";
import SlideDispatchService from "../../services/slideDispatchService";
import SystemSettingService from "../../services/systemSettingService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/slideDispatchService", () => ({
  default: { getAllDispatches: vi.fn(), deleteDispatch: vi.fn() },
}));
vi.mock("../../services/systemSettingService", () => ({
  default: { getPublicSettings: vi.fn() },
}));

const print = vi.fn();
vi.mock("react-to-print", () => ({ useReactToPrint: () => print }));

vi.mock("./CreateSlideDispatchRun", () => ({
  default: ({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) => (
    <div>
      <span>create-dispatch</span>
      <button onClick={onBack}>dispatch-back</button>
      <button onClick={onSuccess}>dispatch-saved</button>
    </div>
  ),
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const run = (over: Record<string, unknown> = {}) => ({
  id: 1,
  dispatch_no: "DS-2026-0001",
  created_at: "2026-09-01T09:00:00",
  remark: "รอบเช้า",
  pathologist: { full_name: "พญ.อรทัย" },
  sender: { full_name: "สมชาย ใจดี" },
  items: [
    {
      id: 11,
      case_type: "SURGICAL",
      remark: "urgent",
      surgical_case: { accession_no: "S26-00001" },
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocked(SlideDispatchService.getAllDispatches).mockResolvedValue({
    items: [run()],
    total: 1,
  });
  mocked(SlideDispatchService.deleteDispatch).mockResolvedValue({});
  mocked(SystemSettingService.getPublicSettings).mockResolvedValue({
    lab_name_en: "Pathology Lab",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const renderPage = (props = {}) =>
  render(
    <AntdApp>
      <SlideDispatchListPage {...props} />
    </AntdApp>,
  );

describe("SlideDispatchListPage", () => {
  it("lists dispatch runs", async () => {
    renderPage();
    expect(await screen.findByText("DS-2026-0001")).toBeInTheDocument();
  });

  it("reports a failed load rather than an empty list", async () => {
    mocked(SlideDispatchService.getAllDispatches).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(
      await screen.findByText("Failed to load slide dispatch records"),
    ).toBeInTheDocument();
  });

  it("still lists dispatches when the lab name cannot be read", async () => {
    // ชื่อแลปใช้แค่บนหัวใบพิมพ์ ไม่ควรทำให้ตารางว่าง
    mocked(SystemSettingService.getPublicSettings).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("DS-2026-0001")).toBeInTheDocument();
  });

  it("warns that cancelling resets the cases before deleting", async () => {
    renderPage();
    await screen.findByText("DS-2026-0001");

    const del = document.querySelector(".anticon-delete")?.closest("button");
    fireEvent.click(del as Element);

    const dialog = await waitFor(() => {
      const el = document.querySelector(".ant-modal-confirm");
      if (!el) throw new Error("confirm not open");
      return el as HTMLElement;
    });
    // คนกดต้องรู้ว่าเคสจะถูกดึงกลับไปสถานะ Stained ไม่ใช่แค่ลบใบ
    expect(dialog.textContent).toContain("reset to Stained status");

    const ok = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Confirm Cancel"),
    );
    fireEvent.click(ok as Element);

    await waitFor(() =>
      expect(SlideDispatchService.deleteDispatch).toHaveBeenCalledWith(1),
    );
    expect(
      await screen.findByText("Slide dispatch cancelled successfully"),
    ).toBeInTheDocument();
  });

  it("says so when a cancellation is refused", async () => {
    mocked(SlideDispatchService.deleteDispatch).mockRejectedValue(new Error("500"));
    renderPage();
    await screen.findByText("DS-2026-0001");

    fireEvent.click(
      document.querySelector(".anticon-delete")?.closest("button") as Element,
    );
    const dialog = await waitFor(() => {
      const el = document.querySelector(".ant-modal-confirm");
      if (!el) throw new Error("confirm not open");
      return el as HTMLElement;
    });
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Confirm Cancel"),
      ) as Element,
    );

    expect(await screen.findByText("Failed to cancel dispatch")).toBeInTheDocument();
  });
});

describe("SlideDispatchListPage reprinting", () => {
  it("reprints with the names recorded on the run, not the current user", async () => {
    renderPage();
    await screen.findByText("DS-2026-0001");

    fireEvent.click(
      document.querySelector(".anticon-printer")?.closest("button") as Element,
    );
    await vi.advanceTimersByTimeAsync(200);

    expect(print).toHaveBeenCalled();
    // ใบที่พิมพ์ซ้ำต้องตรงกับใบเดิม จึงเรนเดอร์ชื่อที่บันทึกไว้ในรอบนั้น
    expect(screen.getAllByText(/พญ.อรทัย/).length).toBeGreaterThan(0);
  });

  it("falls back to a placeholder when a run has no recorded pathologist", async () => {
    mocked(SlideDispatchService.getAllDispatches).mockResolvedValue({
      items: [run({ pathologist: null, sender: null })],
      total: 1,
    });
    renderPage();
    await screen.findByText("DS-2026-0001");

    fireEvent.click(
      document.querySelector(".anticon-printer")?.closest("button") as Element,
    );
    await vi.advanceTimersByTimeAsync(200);

    expect(screen.getAllByText(/N\/A/).length).toBeGreaterThan(0);
  });
});

describe("SlideDispatchListPage case type", () => {
  it("derives the case type from the dashboard view key", async () => {
    renderPage({ currentView: "gyne-slide-dispatch" });
    expect(await screen.findByText(/New Gyne Cytology Dispatch/)).toBeInTheDocument();
  });

  it("falls back to surgical for an unknown view key", async () => {
    renderPage({ currentView: "something-else" });
    expect(await screen.findByText(/New Surgical Dispatch/)).toBeInTheDocument();
  });
});

describe("SlideDispatchListPage create mode", () => {
  it("reloads from the first page after a dispatch is created", async () => {
    renderPage();
    await screen.findByText("DS-2026-0001");

    fireEvent.click(screen.getByText(/New|Create/i).closest("button") as Element);
    expect(screen.getByText("create-dispatch")).toBeInTheDocument();

    fireEvent.click(screen.getByText("dispatch-saved"));
    await waitFor(() =>
      expect(mocked(SlideDispatchService.getAllDispatches).mock.calls.length).toBeGreaterThan(1),
    );
    expect(
      mocked(SlideDispatchService.getAllDispatches).mock.calls.at(-1)?.[0],
    ).toBe(0);
  });
});
