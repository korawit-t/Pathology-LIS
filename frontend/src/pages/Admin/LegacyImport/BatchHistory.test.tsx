import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import BatchHistory from "./BatchHistory";
import legacyImportService from "../../../services/legacyImportService";

vi.mock("../../../services/legacyImportService", () => ({
  default: { getBatches: vi.fn(), rollback: vi.fn() },
}));

const svc = vi.mocked(legacyImportService);

const committed = {
  id: 5, report_type: "surgical" as const, source_system: "old-lis", file_name: "2558.xlsx",
  total_rows: 10, inserted_count: 8, updated_count: 0, skipped_count: 1, error_count: 1,
  status: "committed" as const, created_at: "2026-11-10T10:00:00", created_by_name: "Admin",
};
const rolledBack = {
  ...committed, id: 4, file_name: "2557.xlsx", status: "rolled_back" as const,
  rolled_back_by_name: "Admin", rolled_back_at: "2026-11-09T10:00:00", rolled_back_count: 8,
};

describe("BatchHistory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    svc.getBatches.mockResolvedValue({ total: 2, items: [committed, rolledBack] });
    svc.rollback.mockResolvedValue({ ...committed, status: "rolled_back", rolled_back_count: 8 });
  });

  it("offers a rollback only for a committed batch and reloads after it", async () => {
    render(<BatchHistory refreshKey={0} />);
    await screen.findByText("2558.xlsx");
    expect(screen.getByText("ยกเลิกแล้ว")).toBeInTheDocument();
    expect(screen.getAllByText("ยกเลิก", { selector: "span" })).toHaveLength(1);

    fireEvent.click(screen.getByText("ยกเลิก", { selector: "span" }).closest("button")!);
    const confirm = await waitFor(() => {
      const el = document.querySelector(".ant-popconfirm") as HTMLElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    expect(within(confirm).getByText(/ลบรายงาน 8 ฉบับ/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByText("ยกเลิกชุดนี้").closest("button")!);

    await waitFor(() => expect(svc.rollback).toHaveBeenCalledWith(5));
    await waitFor(() => expect(svc.getBatches).toHaveBeenCalledTimes(2));
  });

  it("reloads when the page bumps refreshKey", async () => {
    const { rerender } = render(<BatchHistory refreshKey={0} />);
    await screen.findByText("2558.xlsx");
    rerender(<BatchHistory refreshKey={1} />);
    await waitFor(() => expect(svc.getBatches).toHaveBeenCalledTimes(2));
  });
});
