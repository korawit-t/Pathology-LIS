import { renderHook, waitFor } from "@testing-library/react";
import { useSurgicalCaseWorklist } from "./useCaseWorklist";
import PathologistService from "../../../services/pathologistService";
import SystemSettingService from "../../../services/systemSettingService";
import SurgicalReportService from "../../../services/surgicalReportService";
import HolidayService from "../../../services/holidayService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";

vi.mock("../../../services/pathologistService", () => ({
  default: { getMyWorklist: vi.fn() },
}));
vi.mock("../../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn() },
}));
vi.mock("../../../services/surgicalReportService", () => ({
  default: { getPendingCosignWorklist: vi.fn() },
}));
vi.mock("../../../services/holidayService", () => ({
  default: { getHolidayDateList: vi.fn() },
}));
vi.mock("../../../services/gyneCytoCaseService", () => ({
  default: { getAll: vi.fn() },
}));
vi.mock("../../../services/nongyneCytoCaseService", () => ({
  default: { getAll: vi.fn() },
}));

const mockGetMyWorklist = PathologistService.getMyWorklist as ReturnType<typeof vi.fn>;
const mockGetSettings = SystemSettingService.getSettings as ReturnType<typeof vi.fn>;
const mockGetPendingCosign = SurgicalReportService.getPendingCosignWorklist as ReturnType<
  typeof vi.fn
>;
const mockGetHolidays = HolidayService.getHolidayDateList as ReturnType<typeof vi.fn>;
const mockGyneGetAll = GyneCytologyCaseService.getAll as ReturnType<typeof vi.fn>;
const mockNongyneGetAll = NongyneCytologyCaseService.getAll as ReturnType<typeof vi.fn>;

const emptyList = { items: [], total: 0 };
const USER_ID = 42;

describe("useSurgicalCaseWorklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyWorklist.mockResolvedValue(emptyList);
    mockGetSettings.mockResolvedValue({});
    mockGetPendingCosign.mockResolvedValue(emptyList);
    mockGetHolidays.mockResolvedValue([]);
    mockGyneGetAll.mockResolvedValue(emptyList);
    mockNongyneGetAll.mockResolvedValue(emptyList);
  });

  it("passes exclude_signed_by for the current user when fetching the Non-Gyne worklist", async () => {
    renderHook(() => useSurgicalCaseWorklist(USER_ID));

    await waitFor(() => expect(mockNongyneGetAll).toHaveBeenCalled());

    expect(mockNongyneGetAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_to_me: true,
        is_reported: false,
        exclude_signed_by: USER_ID,
      }),
    );
  });

  it("normalizes Gyne and Non-Gyne items into the unified worklist shape", async () => {
    mockGyneGetAll.mockResolvedValue({
      items: [
        {
          id: 1,
          created_at: "2026-01-01T00:00:00Z",
          hn: "HN001",
          patient: { name: "Somsri" },
        },
      ],
      total: 1,
    });
    mockNongyneGetAll.mockResolvedValue({
      items: [
        {
          id: 2,
          created_at: "2026-01-02T00:00:00Z",
          hn: "HN002",
          patient: { name: "Somchai" },
        },
      ],
      total: 1,
    });

    const { result } = renderHook(() => useSurgicalCaseWorklist(USER_ID));

    await waitFor(() => expect(result.current.filteredData.gyne).toHaveLength(1));
    await waitFor(() => expect(result.current.filteredData.nonGyne).toHaveLength(1));

    expect(result.current.filteredData.gyne[0]).toMatchObject({
      case_type: "GYNE",
      registered_at: "2026-01-01T00:00:00Z",
      patient_name: "Somsri",
      patient_hn: "HN001",
    });
    expect(result.current.filteredData.nonGyne[0]).toMatchObject({
      case_type: "NON_GYNE",
      registered_at: "2026-01-02T00:00:00Z",
      patient_name: "Somchai",
      patient_hn: "HN002",
    });
  });

  it("computes the Gyne badge total as the deduped union of stained/co-sign/express buckets", async () => {
    // Case 1 appears in both the "stained" and "express" buckets; case 2 only
    // in "co_sign" — union-by-id should total 2, not 3.
    mockGyneGetAll.mockImplementation((params: Record<string, unknown>) => {
      if (params.status === "stained") {
        return Promise.resolve({ items: [{ id: 1 }], total: 1 });
      }
      if (params.signer_id) {
        return Promise.resolve({ items: [{ id: 2 }], total: 1 });
      }
      if (params.is_express) {
        return Promise.resolve({ items: [{ id: 1 }], total: 1 });
      }
      return Promise.resolve(emptyList);
    });

    const { result } = renderHook(() => useSurgicalCaseWorklist(USER_ID));

    await waitFor(() => expect(result.current.filteredData.gyneTotal).toBe(2));
  });

  it("does not fetch anything when userId is undefined", async () => {
    renderHook(() => useSurgicalCaseWorklist(undefined));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetMyWorklist).not.toHaveBeenCalled();
    expect(mockGyneGetAll).not.toHaveBeenCalled();
    expect(mockNongyneGetAll).not.toHaveBeenCalled();
  });
});
