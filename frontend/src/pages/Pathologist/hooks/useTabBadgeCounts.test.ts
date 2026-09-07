import { renderHook, waitFor } from "@testing-library/react";
import { useTabBadgeCounts } from "./useTabBadgeCounts";
import api from "../../../services/httpClient";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import InternalConsultService from "../../../services/internalConsultService";

vi.mock("../../../services/httpClient", () => ({
  default: { get: vi.fn() },
}));
vi.mock("../../../services/surgicalCaseService", () => ({
  default: { getCases: vi.fn() },
}));
vi.mock("../../../services/gyneCytoCaseService", () => ({
  default: { getAll: vi.fn() },
}));
vi.mock("../../../services/internalConsultService", () => ({
  default: { getMyPending: vi.fn() },
}));

const mockApiGet = api.get as ReturnType<typeof vi.fn>;
const mockGetCases = SurgicalCaseService.getCases as ReturnType<typeof vi.fn>;
const mockGyneGetAll = GyneCytologyCaseService.getAll as ReturnType<typeof vi.fn>;
const mockGetMyPending = InternalConsultService.getMyPending as ReturnType<typeof vi.fn>;

const USER_ID = 42;

describe("useTabBadgeCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: [] });
    mockGetCases.mockResolvedValue({ items: [], total: 0 });
    mockGyneGetAll.mockResolvedValue({ items: [], total: 0 });
    mockGetMyPending.mockResolvedValue({ items: [], total: 0 });
  });

  it("fills every badge on mount, without the tab panels being rendered", async () => {
    mockApiGet.mockResolvedValue({
      data: [
        { stains: [{ status: "pending" }] },
        { stains: [{ status: "completed" }, { status: "in_progress" }] },
        { stains: [{ status: "completed" }] }, // fully stained — not outstanding
      ],
    });
    mockGetCases.mockResolvedValue({ items: [], total: 7 });
    mockGyneGetAll.mockResolvedValue({ items: [], total: 3 });
    mockGetMyPending.mockResolvedValue({ items: [], total: 5 });

    const { result } = renderHook(() => useTabBadgeCounts(USER_ID));

    await waitFor(() => expect(result.current.externalConsultCount).toBe(7));
    expect(result.current.readyStainCount).toBe(2);
    expect(result.current.outlabApprovalCount).toBe(3);
    expect(result.current.internalConsultCount).toBe(5);
  });

  it("asks only for a total, not a page of rows", async () => {
    renderHook(() => useTabBadgeCounts(USER_ID));

    await waitFor(() => expect(mockGetCases).toHaveBeenCalled());

    expect(mockGetCases).toHaveBeenCalledWith(
      expect.objectContaining({
        pathologist_id: USER_ID,
        is_out_lab_consult: true,
        consult_status: "pending,processing",
        limit: 1,
      }),
    );
    expect(mockGyneGetAll).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_user_id: USER_ID,
        is_out_lab: true,
        has_out_lab_result: true,
        outlab_result_approved: false,
        limit: 1,
      }),
    );
    expect(mockGetMyPending).toHaveBeenCalledWith({ skip: 0, limit: 1 });
  });

  it("keeps the other badges when one endpoint fails", async () => {
    mockGetCases.mockRejectedValue(new Error("boom"));
    mockGetMyPending.mockResolvedValue({ items: [], total: 5 });

    const { result } = renderHook(() => useTabBadgeCounts(USER_ID));

    await waitFor(() => expect(result.current.internalConsultCount).toBe(5));
    expect(result.current.externalConsultCount).toBe(0);
  });

  it("fetches nothing until the user is known", async () => {
    renderHook(() => useTabBadgeCounts(undefined));

    await waitFor(() => expect(mockGetCases).not.toHaveBeenCalled());
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockGyneGetAll).not.toHaveBeenCalled();
    expect(mockGetMyPending).not.toHaveBeenCalled();
  });
});
