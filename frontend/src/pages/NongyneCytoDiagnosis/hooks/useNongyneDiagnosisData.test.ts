import { renderHook, waitFor, act } from "@testing-library/react";
import { message } from "antd";
import { useNongyneDiagnosisData } from "./useNongyneDiagnosisData";
import NongyneCaseImageService from "../../../services/nongyneCaseImageService";
import NongyneDiagnosisService from "../../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";
import NongyneReportService from "../../../services/nongyneReportService";
import UserService from "../../../services/userService";
import type { FormInstance } from "antd";

vi.mock("../../../services/nongyneCaseImageService", () => ({
  default: { getImages: vi.fn(), update: vi.fn() },
}));
vi.mock("../../../services/nongyneDiagnosisService", () => ({
  default: { getByCaseId: vi.fn() },
}));
vi.mock("../../../services/nongyneCytoCaseService", () => ({
  default: { getById: vi.fn() },
}));
vi.mock("../../../services/nongyneReportService", () => ({
  default: { getReportsByCase: vi.fn() },
}));
vi.mock("../../../services/userService", () => ({
  default: { getUsers: vi.fn(), getCurrentUser: vi.fn() },
}));
vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");
  return { ...actual, message: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } };
});

const makeForm = () => ({ setFieldsValue: vi.fn() }) as unknown as FormInstance;

const makeCaseData = (overrides: Record<string, unknown> = {}) => ({
  id: 400,
  accession_no: "N26-00001",
  status: "registered",
  clinical_history: "Some history",
  specimen_type: "Fluid",
  collection_site: "Ascitic fluid",
  received_volume_ml: "50",
  has_malignancy: false,
  has_critical: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  (NongyneCytologyCaseService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCaseData());
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (UserService.getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
  (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (NongyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("useNongyneDiagnosisData", () => {
  it("does nothing and stays loading:false when caseId is undefined", async () => {
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData(undefined, form));

    expect(result.current.loading).toBe(false);
    expect(NongyneCytologyCaseService.getById).not.toHaveBeenCalled();
    expect(NongyneDiagnosisService.getByCaseId).not.toHaveBeenCalled();
  });

  it("loads case data + users + current user together and fills the case-level form fields", async () => {
    const form = makeForm();
    renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() =>
      expect(form.setFieldsValue).toHaveBeenCalledWith(
        expect.objectContaining({
          clinical_history: "Some history",
          specimen_type: "Fluid",
          collection_site: "Ascitic fluid",
          received_volume_ml: "50",
          has_malignancy: false,
          has_critical: false,
        }),
      ),
    );
  });

  it("loads diagnosis and fills the form when one exists", async () => {
    const diag = { id: 900, case_id: 400, status: "draft", diagnosis_order: 1, entry_type: "Initial" };
    (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([diag]);
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() => expect(result.current.diagnosis).toEqual(diag));
    expect(form.setFieldsValue).toHaveBeenCalledWith(diag);
  });

  it("leaves diagnosis null without filling the form when none exists", async () => {
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.diagnosis).toBeNull();
  });

  it("fetchDiagnosis(true) updates diagnosis without filling the form", async () => {
    const diag = { id: 901, case_id: 400, status: "draft", diagnosis_order: 2, entry_type: "Addendum" };
    (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([diag]);
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));
    await waitFor(() => expect(result.current.loading).toBe(false));
    form.setFieldsValue = vi.fn();

    await act(async () => {
      await result.current.fetchDiagnosis(true);
    });

    expect(result.current.diagnosis).toEqual(diag);
    expect(form.setFieldsValue).not.toHaveBeenCalled();
  });

  it("shows an error message when loading diagnosis fails", async () => {
    (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const form = makeForm();
    renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() => expect(message.error).toHaveBeenCalledWith("Failed to load diagnosis data."));
  });

  it("builds descMap from image descriptions, falling back to empty string", async () => {
    (NongyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, description: "lesion" },
      { id: 2, description: null },
    ]);
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() => expect(result.current.images).toHaveLength(2));
    expect(result.current.descMap).toEqual({ 1: "lesion", 2: "" });
  });

  it("saveDesc sends the current descMap entry for the given image", async () => {
    (NongyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, description: "old" },
    ]);
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));
    await waitFor(() => expect(result.current.descMap).toEqual({ 1: "old" }));

    await act(async () => {
      await result.current.saveDesc(1);
    });

    expect(NongyneCaseImageService.update).toHaveBeenCalledWith(1, { description: "old" });
  });

  it("fetchCaseData updates caseData without re-filling the form (ConsultPdfPanel onRefresh path)", async () => {
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));
    await waitFor(() => expect(result.current.caseData).not.toBeNull());
    form.setFieldsValue = vi.fn();
    (NongyneCytologyCaseService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCaseData({ clinical_history: "Updated" }),
    );

    await act(async () => {
      result.current.fetchCaseData();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.caseData).toEqual(expect.objectContaining({ clinical_history: "Updated" })),
    );
    expect(form.setFieldsValue).not.toHaveBeenCalled();
  });

  it("activeReportId picks the first pending_approval/published report", async () => {
    (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, status: "draft" },
      { id: 2, status: "pending_approval" },
      { id: 3, status: "published" },
    ]);
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() => expect(result.current.activeReportId).toBe(2));
  });

  it("re-fetches activeReportId when caseData's status changes (regression: was missing from deps)", async () => {
    const form = makeForm();
    const { result } = renderHook(() => useNongyneDiagnosisData("400", form));
    // Mount alone already fires this effect twice (once for the initial
    // caseData:null -> {status:"registered"} transition, since caseData?.status
    // is itself a dep) — let that fully settle before capturing a baseline,
    // rather than assuming a specific small absolute count.
    await waitFor(() => expect(result.current.caseData?.status).toBe("registered"));
    const callsBeforeStatusChange = (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mock
      .calls.length;

    (NongyneCytologyCaseService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeCaseData({ status: "published" }),
    );
    await act(async () => {
      result.current.fetchCaseData();
      await Promise.resolve();
    });

    // The real regression guard: a SECOND status change (registered ->
    // published) triggers the effect again. With the pre-fix [caseId]-only
    // deps, this call would never happen no matter how many times
    // caseData.status changes after mount.
    await waitFor(() =>
      expect(NongyneReportService.getReportsByCase).toHaveBeenCalledTimes(callsBeforeStatusChange + 1),
    );
  });

  it("fetches users unfiltered (locked-in, deliberate divergence from Gyne's role-filtered hook)", async () => {
    const form = makeForm();
    renderHook(() => useNongyneDiagnosisData("400", form));

    await waitFor(() => expect(UserService.getUsers).toHaveBeenCalledWith());
  });
});
