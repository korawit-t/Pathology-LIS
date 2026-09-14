import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SectioningRunList from ".";
import SectioningService from "../../services/sectioningService";
import type { SectioningRunResponse } from "../../types/sectioning";

vi.mock("../../services/sectioningService", () => ({
  default: { getAllRuns: vi.fn(), deleteRun: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const run = (over: Partial<SectioningRunResponse> = {}) =>
  ({
    id: 1,
    run_no: "SEC-2026-0001",
    user: { full_name: "สมชาย ใจดี", username: "somchai" },
    microtome_id: "MT-01",
    started_at: "2026-09-01T09:00:00",
    finished_at: null,
    details: [],
    ...over,
  }) as unknown as SectioningRunResponse;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(SectioningService.getAllRuns).mockResolvedValue([run()]);
  mocked(SectioningService.deleteRun).mockResolvedValue({});
});

const renderList = (onSelectRun = vi.fn()) => {
  render(
    <AntdApp>
      <SectioningRunList onSelectRun={onSelectRun} />
    </AntdApp>,
  );
  return onSelectRun;
};

/** ปุ่มยืนยันของ Modal.confirm อยู่นอก render tree ของ component จึงหาจาก document */
const confirmOk = async () => {
  const dialog = await waitFor(() => {
    const el = document.querySelector(".ant-modal-confirm");
    if (!el) throw new Error("confirm not open");
    return el as HTMLElement;
  });
  const ok = Array.from(dialog.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("ลบ"),
  );
  fireEvent.click(ok as Element);
};

describe("SectioningRunList", () => {
  it("lists the runs the service returns", async () => {
    renderList();
    expect(await screen.findByText("SEC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("สมชาย ใจดี")).toBeInTheDocument();
  });

  it("counts cassettes and slides separately", async () => {
    // badge = จำนวนตลับ, ในวงเล็บ = จำนวนสไลด์รวม — สองเลขนี้ไม่เท่ากัน
    mocked(SectioningService.getAllRuns).mockResolvedValue([
      run({ details: [{ slide_count: 3 }, { slide_count: 2 }] as never }),
    ]);
    renderList();

    expect(await screen.findByText("(5 slides)")).toBeInTheDocument();
    expect(screen.getByTitle("2")).toBeInTheDocument();
  });

  it("tells the user when the history cannot be loaded", async () => {
    mocked(SectioningService.getAllRuns).mockRejectedValue(new Error("boom"));
    renderList();
    expect(await screen.findByText("โหลดประวัติการตัดไม่สำเร็จ")).toBeInTheDocument();
  });

  it("hands the run to the details view when View is clicked", async () => {
    const onSelectRun = renderList();
    await screen.findByText("SEC-2026-0001");

    fireEvent.click(screen.getByText("View").closest("button") as Element);
    expect(onSelectRun).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("will not offer to delete a run that already has cassettes on it", async () => {
    // ลบรอบที่สแกนตลับไปแล้วจะทำให้ประวัติสไลด์ขาดหาย backend ก็ปฏิเสธอยู่แล้ว
    mocked(SectioningService.getAllRuns).mockResolvedValue([
      run({ details: [{ slide_count: 1 }] as never }),
    ]);
    renderList();
    await screen.findByText("SEC-2026-0001");

    expect(screen.getByText("Delete").closest("button")).toBeDisabled();
  });

  it("asks before deleting, then reloads the list", async () => {
    renderList();
    await screen.findByText("SEC-2026-0001");

    fireEvent.click(screen.getByText("Delete").closest("button") as Element);
    await confirmOk();

    await waitFor(() => expect(SectioningService.deleteRun).toHaveBeenCalledWith(1));
    expect(await screen.findByText("ลบรอบการตัดสำเร็จ")).toBeInTheDocument();
    // โหลดครั้งแรกตอน mount + โหลดซ้ำหลังลบ
    await waitFor(() =>
      expect(mocked(SectioningService.getAllRuns).mock.calls.length).toBe(2),
    );
  });

  it("does not delete anything if the confirm is dismissed", async () => {
    renderList();
    await screen.findByText("SEC-2026-0001");

    fireEvent.click(screen.getByText("Delete").closest("button") as Element);
    const dialog = await waitFor(() => {
      const el = document.querySelector(".ant-modal-confirm");
      if (!el) throw new Error("confirm not open");
      return el as HTMLElement;
    });
    const cancel = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ยกเลิก"),
    );
    fireEvent.click(cancel as Element);

    expect(SectioningService.deleteRun).not.toHaveBeenCalled();
  });

  it("surfaces the server's own reason when the delete is refused", async () => {
    // backend รู้เหตุผลจริง (เช่น มีสไลด์ผูกอยู่) อย่ากลบด้วยข้อความ default
    mocked(SectioningService.deleteRun).mockRejectedValue({
      response: { data: { detail: "รอบนี้ถูกอ้างถึงในใบเบิกสไลด์แล้ว" } },
    });
    renderList();
    await screen.findByText("SEC-2026-0001");

    fireEvent.click(screen.getByText("Delete").closest("button") as Element);
    await confirmOk();

    expect(
      await screen.findByText("รอบนี้ถูกอ้างถึงในใบเบิกสไลด์แล้ว"),
    ).toBeInTheDocument();
  });

  it("falls back to a readable reason when the server sends none", async () => {
    mocked(SectioningService.deleteRun).mockRejectedValue(new Error("network"));
    renderList();
    await screen.findByText("SEC-2026-0001");

    fireEvent.click(screen.getByText("Delete").closest("button") as Element);
    await confirmOk();

    expect(
      await screen.findByText("ไม่สามารถลบได้ เนื่องจากรอบนี้มีข้อมูลสไลด์แล้ว"),
    ).toBeInTheDocument();
  });
});
