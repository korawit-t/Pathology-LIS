import { renderHook, waitFor } from "@testing-library/react";
import { usePathologistStats } from "./usePathologistStats";
import PathologistService from "../../../../../services/pathologistService";
import { MolecularCaseService } from "../../../../../services/molecularCaseService";

vi.mock("../../../../../services/pathologistService", () => ({
  default: { getMyWorklist: vi.fn() },
}));

vi.mock("../../../../../services/molecularCaseService", () => ({
  MolecularCaseService: { count: vi.fn() },
}));

const mockWorklist = PathologistService.getMyWorklist as ReturnType<typeof vi.fn>;
const mockCount = MolecularCaseService.count as ReturnType<typeof vi.fn>;

describe("usePathologistStats — Molecular counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every surgical bucket resolves empty; these tests are about the
    // Molecular tiles, and a zero baseline keeps the assertions unambiguous.
    mockWorklist.mockResolvedValue({ total: 0 });
  });

  it("splits unfinished Molecular cases into in-house, external and PDF received", async () => {
    mockCount.mockImplementation(({ status, is_outlab }: { status: string; is_outlab?: boolean }) =>
      Promise.resolve(status === "pdf_received" ? 4 : is_outlab ? 5 : 2),
    );

    const { result } = renderHook(() => usePathologistStats(7));

    await waitFor(() => {
      expect(result.current.stats.molecularPendingInHouse).toBe(2);
      expect(result.current.stats.molecularPendingExternal).toBe(5);
      expect(result.current.stats.molecularPdfReceived).toBe(4);
    });

    expect(mockCount).toHaveBeenCalledWith({ status: "pending", is_outlab: false });
    expect(mockCount).toHaveBeenCalledWith({ status: "pending", is_outlab: true });
    expect(mockCount).toHaveBeenCalledWith({ status: "pdf_received" });
  });

  it("never counts reported cases, so they cannot inflate the tiles", async () => {
    mockCount.mockResolvedValue(0);

    renderHook(() => usePathologistStats(7));

    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(3));
    for (const [params] of mockCount.mock.calls) {
      expect(["pending", "pdf_received"]).toContain(params.status);
    }
  });

  it("does not scope Molecular counts to the viewing pathologist", async () => {
    // Unowned Molecular cases are the ones most likely to be forgotten, so the
    // tiles are department-wide on purpose. If a user filter is ever added,
    // this test should fail and force the decision to be made again.
    mockCount.mockResolvedValue(0);

    renderHook(() => usePathologistStats(7));

    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(3));
    for (const [params] of mockCount.mock.calls) {
      expect(params).not.toHaveProperty("assist_pathologist_id");
    }
  });

  it("keeps the surgical rows working when the Molecular count fails", async () => {
    // The Molecular tiles were added to a card that already worked without
    // them, so their outage must degrade to zeroes — not blank the rows
    // that were there first. Without the per-call .catch, Promise.all rejects
    // as a unit and every number below goes to 0.
    mockWorklist.mockResolvedValue({ total: 3 });
    mockCount.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => usePathologistStats(7));

    await waitFor(() => expect(result.current.stats.pendingDiagnosis).toBe(3));
    expect(result.current.stats.pendingSpecialStains).toBe(3);
    expect(result.current.stats.molecularPendingInHouse).toBe(0);
    expect(result.current.stats.molecularPendingExternal).toBe(0);
    expect(result.current.stats.molecularPdfReceived).toBe(0);
  });
});
