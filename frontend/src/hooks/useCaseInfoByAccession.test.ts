import { renderHook } from "@testing-library/react";
import { useCaseInfoByAccession } from "./useCaseInfoByAccession";
import SurgicalCaseService from "../services/surgicalCaseService";

vi.mock("../services/surgicalCaseService", () => ({
  default: { getCases: vi.fn() },
}));

const mockGetCases = SurgicalCaseService.getCases as ReturnType<typeof vi.fn>;

describe("useCaseInfoByAccession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves each unique accession number to its case, keyed by accession number", async () => {
    mockGetCases
      .mockResolvedValueOnce({ items: [{ id: 1, accession_no: "S26-001", hn: "HN001" }], total: 1 })
      .mockResolvedValueOnce({ items: [{ id: 2, accession_no: "S26-002", hn: "HN002" }], total: 1 });

    const { result } = renderHook(() => useCaseInfoByAccession());
    const map = await result.current.resolveCaseInfo(["S26-001", "S26-002"]);

    expect(map).toEqual({
      "S26-001": { id: 1, accession_no: "S26-001", hn: "HN001" },
      "S26-002": { id: 2, accession_no: "S26-002", hn: "HN002" },
    });
    expect(mockGetCases).toHaveBeenCalledTimes(2);
  });

  it("dedupes accession numbers before fetching", async () => {
    mockGetCases.mockResolvedValue({ items: [{ id: 1, accession_no: "S26-001" }], total: 1 });

    const { result } = renderHook(() => useCaseInfoByAccession());
    await result.current.resolveCaseInfo(["S26-001", "S26-001", null, undefined, ""]);

    expect(mockGetCases).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map without calling the service when given no accession numbers", async () => {
    const { result } = renderHook(() => useCaseInfoByAccession());
    const map = await result.current.resolveCaseInfo([]);

    expect(map).toEqual({});
    expect(mockGetCases).not.toHaveBeenCalled();
  });

  it("silently omits accession numbers whose lookup fails", async () => {
    mockGetCases
      .mockResolvedValueOnce({ items: [{ id: 1, accession_no: "S26-001" }], total: 1 })
      .mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useCaseInfoByAccession());
    const map = await result.current.resolveCaseInfo(["S26-001", "S26-002"]);

    expect(map).toEqual({ "S26-001": { id: 1, accession_no: "S26-001" } });
  });

  it("silently omits accession numbers with no matching case", async () => {
    mockGetCases.mockResolvedValue({ items: [], total: 0 });

    const { result } = renderHook(() => useCaseInfoByAccession());
    const map = await result.current.resolveCaseInfo(["S26-999"]);

    expect(map).toEqual({});
  });
});
