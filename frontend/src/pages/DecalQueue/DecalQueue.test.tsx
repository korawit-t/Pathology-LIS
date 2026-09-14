import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import DecalQueuePage from ".";
import UserService from "../../services/userService";
import SurgicalBlockService from "../../services/surgicalBlockService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn() },
}));
vi.mock("../../services/surgicalBlockService", () => ({
  default: { getBlocks: vi.fn() },
}));
// ฟอร์มบันทึกผล decal มีเทสต์แยก ที่นี่สนใจว่าคิวรีเฟรชหลังบันทึก
vi.mock("../Gross/components/DecalFormModal", () => ({
  default: ({ open, onSuccess }: { open: boolean; onSuccess: () => void }) =>
    open ? <button onClick={onSuccess}>decal-form-save</button> : null,
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const block = (over: Record<string, unknown> = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  specimen_label: "A",
  block_no: 1,
  is_decal: true,
  decal_start_at: "2026-09-01T08:00:00",
  ...over,
});

/** getBlocks ถูกเรียกสี่ครั้ง (decal / fixing / ประวัติอีกสอง) ตอบตามฟิลเตอร์ */
const byFilter = (map: Record<string, unknown[]>) =>
  vi.fn(async (params: Record<string, unknown>) => {
    const key = Object.keys(map).find((k) => params[k]);
    return { items: key ? map[key] : [], total: key ? map[key].length : 0 };
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocked(UserService.getUsers).mockResolvedValue([
    { id: 3, username: "somchai", full_name: "สมชาย ใจดี", report_name: "S. Jaidee" },
  ]);
  mocked(SurgicalBlockService.getBlocks).mockImplementation(
    byFilter({ is_decal: [block()] }),
  );
});

const renderPage = () =>
  render(
    <AntdApp>
      <DecalQueuePage />
    </AntdApp>,
  );

describe("DecalQueuePage", () => {
  it("asks for each queue separately rather than filtering one list", async () => {
    renderPage();
    await screen.findByText("S26-00001");

    const filters = mocked(SurgicalBlockService.getBlocks).mock.calls.map(
      ([p]) => Object.keys(p).filter((k) => p[k] === true),
    );
    expect(filters.flat().sort()).toEqual([
      "decal_history",
      "fix_history",
      "is_decal",
      "is_fixing",
    ]);
  });

  it("badges each tab with how many blocks are waiting", async () => {
    renderPage();
    await screen.findByText("S26-00001");

    const decalTab = Array.from(document.querySelectorAll(".ant-tabs-tab")).find(
      (t) => (t.textContent || "").includes("Decal") &&
        !(t.textContent || "").includes("History"),
    ) as HTMLElement;
    expect(within(decalTab).getByTitle("1")).toBeInTheDocument();
  });

  it("keeps loading the queues when the staff list is unavailable", async () => {
    // รายชื่อผู้ใช้ใช้แค่แปลง id เป็นชื่อ ไม่ควรทำให้ทั้งหน้าใช้ไม่ได้
    mocked(UserService.getUsers).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("S26-00001")).toBeInTheDocument();
  });

  it("survives a queue that fails to load", async () => {
    mocked(SurgicalBlockService.getBlocks).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText(/Decal & Extended Fix Queue/)).toBeInTheDocument();
  });

  it("searches by accession and by block code together", async () => {
    mocked(SurgicalBlockService.getBlocks).mockImplementation(
      byFilter({
        is_decal: [
          block(),
          block({ id: 2, accession_no: "S26-00002", specimen_label: "B", block_no: 7 }),
        ],
      }),
    );
    renderPage();
    await screen.findByText("S26-00001");

    const search = screen.getByPlaceholderText("Search by Block / Accession No.");
    // "b7" คือ specimen_label + block_no ไม่ได้อยู่ในเลข accession เลย
    fireEvent.change(search, { target: { value: "b7" } });
    // ช่องนี้กรองตอน onSearch ไม่ใช่ทุกตัวอักษรที่พิมพ์
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.keyUp(search, { key: "Enter" });

    await waitFor(() => expect(screen.queryByText("S26-00001")).toBeNull());
    expect(screen.getByText("S26-00002")).toBeInTheDocument();
  });

  it("refreshes every queue after a decal result is saved", async () => {
    renderPage();
    await screen.findByText("S26-00001");
    const before = mocked(SurgicalBlockService.getBlocks).mock.calls.length;

    fireEvent.click(screen.getAllByText("Manage")[0].closest("button") as Element);
    fireEvent.click(await screen.findByText("decal-form-save"));

    // บันทึกเสร็จแล้วบล็อกย้ายคิว ทุกแท็บจึงต้องโหลดใหม่ ไม่ใช่แค่แท็บที่เปิดอยู่
    await waitFor(() =>
      expect(mocked(SurgicalBlockService.getBlocks).mock.calls.length).toBe(before + 4),
    );
  });

  it("reloads the staff list on demand", async () => {
    renderPage();
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByText("Refresh").closest("button") as Element);
    await waitFor(() =>
      expect(mocked(UserService.getUsers).mock.calls.length).toBe(2),
    );
  });
});
