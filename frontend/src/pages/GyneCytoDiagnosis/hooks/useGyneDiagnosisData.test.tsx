import { renderHook, waitFor, act, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import type { ReactNode } from "react";
import type { FormInstance } from "antd";
import { useGyneDiagnosisData } from "./useGyneDiagnosisData";
import GyneCaseImageService from "../../../services/gyneCaseImageService";
import GyneDiagnosisService from "../../../services/gyneDiagnosisService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import NotificationRuleService from "../../../services/notificationRuleService";
import UserService from "../../../services/userService";
import SystemSettingService from "../../../services/systemSettingService";

vi.mock("../../../services/gyneCaseImageService", () => ({
  default: { getImages: vi.fn(), update: vi.fn() },
}));
vi.mock("../../../services/gyneDiagnosisService", () => ({
  default: {
    getCurrentDiagnosis: vi.fn(),
    getDiagnosisCategories: vi.fn(),
    getSpecimenAdequacies: vi.fn(),
    getReportsByCase: vi.fn(),
    createInitial: vi.fn(),
    updateDiagnosis: vi.fn(),
    reviseReport: vi.fn(),
    publishReport: vi.fn(),
    completeReview: vi.fn(),
  },
}));
vi.mock("../../../services/gyneCytoCaseService", () => ({
  default: { getById: vi.fn(), update: vi.fn() },
}));
vi.mock("../../../services/notificationRuleService", () => ({
  default: { triggerEvent: vi.fn() },
}));
vi.mock("../../../services/userService", () => ({
  default: { getUsers: vi.fn(), getCurrentUser: vi.fn() },
}));
vi.mock("../../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn() },
}));

const wrapper = ({ children }: { children: ReactNode }) => <AntdApp>{children}</AntdApp>;

const makeForm = (fieldValues: Record<string, unknown> = {}) =>
  ({
    setFieldsValue: vi.fn(),
    getFieldValue: vi.fn((name: string) => fieldValues[name]),
    setFieldValue: vi.fn(),
  }) as unknown as FormInstance;

const currentUser = { id: 1, full_name: "CT One", roles: ["cytotechnologist"] };

const makeCaseData = (overrides: Record<string, unknown> = {}) => ({
  id: 300,
  accession_no: "C26-00002",
  status: "registered",
  is_out_lab_consult: false,
  ...overrides,
});

const makeDiagnosis = (overrides: Record<string, unknown> = {}) => ({
  id: 700,
  case_id: 300,
  version: 1,
  is_current: true,
  signers: [{ user_id: 1, role: "primary", signed_at: null }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  (GyneCytologyCaseService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(makeCaseData());
  (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockRejectedValue({
    response: { status: 404 },
  });
  (GyneDiagnosisService.getDiagnosisCategories as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (GyneDiagnosisService.getSpecimenAdequacies as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (GyneDiagnosisService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (GyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (UserService.getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(currentUser);
  (SystemSettingService.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe("useGyneDiagnosisData", () => {
  it("loads case data and diagnosis (404 => null, no error message)", async () => {
    const form = makeForm();
    const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });

    await waitFor(() => expect(result.current.caseData).toEqual(expect.objectContaining({ id: 300 })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.diagnosis).toBeNull();
  });

  it("fills the form when a current diagnosis exists", async () => {
    const diag = makeDiagnosis();
    (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockResolvedValue(diag);
    const form = makeForm();
    const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });

    await waitFor(() => expect(result.current.diagnosis).toEqual(diag));
    expect(form.setFieldsValue).toHaveBeenCalledWith(diag);
  });

  it("splits categories/adequacies into mainCategories/adequacyOptions/zoneOptions/qualityOptions", async () => {
    (GyneDiagnosisService.getDiagnosisCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, code: "1", text: "NILM", parent_id: null },
      { id: 2, code: "1a", text: "Sub of NILM", parent_id: 1 },
    ]);
    (GyneDiagnosisService.getSpecimenAdequacies as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 10, group_type: "ADEQUACY", text: "Satisfactory" },
      { id: 11, group_type: "ZONE", text: "Present" },
      { id: 12, group_type: "QUALITY", text: "Scant cellularity" },
    ]);
    const form = makeForm();
    const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });

    await waitFor(() => expect(result.current.loadingMaster).toBe(false));
    expect(result.current.mainCategories).toEqual([expect.objectContaining({ id: 1 })]);
    expect(result.current.adequacyOptions).toEqual([expect.objectContaining({ id: 10 })]);
    expect(result.current.zoneOptions).toEqual([expect.objectContaining({ id: 11 })]);
    expect(result.current.qualityOptions).toEqual([expect.objectContaining({ id: 12 })]);
  });

  describe("saveDraft", () => {
    const values = { interpretation: "Test interpretation", note: "Test note", signers: [{ user_id: 1, role: "primary", signed_at: null }] };

    it("creates a new diagnosis when none exists yet", async () => {
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: { mode: string } | undefined;
      await act(async () => {
        outcome = await result.current.saveDraft(values, { isRevision: false });
      });

      expect(outcome).toEqual({ mode: "create" });
      expect(GyneDiagnosisService.createInitial).toHaveBeenCalledWith(
        expect.objectContaining({ case_id: 300, interpretation: "Test interpretation" }),
      );
    });

    it("updates the existing diagnosis when not in revision mode", async () => {
      const diag = makeDiagnosis();
      (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockResolvedValue(diag);
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.diagnosis).toEqual(diag));

      let outcome: { mode: string } | undefined;
      await act(async () => {
        outcome = await result.current.saveDraft(values, { isRevision: false });
      });

      expect(outcome).toEqual({ mode: "update" });
      expect(GyneDiagnosisService.updateDiagnosis).toHaveBeenCalledWith(700, expect.objectContaining(values));
      expect(GyneDiagnosisService.reviseReport).not.toHaveBeenCalled();
    });

    it("revises with all signatures reset to null when in revision mode", async () => {
      const diag = makeDiagnosis();
      (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockResolvedValue(diag);
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.diagnosis).toEqual(diag));

      let outcome: { mode: string } | undefined;
      await act(async () => {
        outcome = await result.current.saveDraft(
          { ...values, signers: [{ user_id: 1, role: "primary", signed_at: "2026-01-01T00:00:00Z" }] },
          { isRevision: true },
        );
      });

      expect(outcome).toEqual({ mode: "revise" });
      expect(GyneDiagnosisService.reviseReport).toHaveBeenCalledWith(
        700,
        expect.objectContaining({ signers: [expect.objectContaining({ user_id: 1, signed_at: null })] }),
      );
    });

    it("converts undefined field values to null before persisting", async () => {
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.saveDraft({ interpretation: undefined, note: "kept" }, { isRevision: false });
      });

      expect(GyneDiagnosisService.createInitial).toHaveBeenCalledWith(
        expect.objectContaining({ interpretation: null, note: "kept" }),
      );
    });
  });

  describe("persistDraftForPreview", () => {
    it("updates the diagnosis when one exists and not in revision mode", async () => {
      const diag = makeDiagnosis();
      (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockResolvedValue(diag);
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.diagnosis).toEqual(diag));

      await act(async () => {
        await result.current.persistDraftForPreview({ interpretation: "x" }, false);
      });

      expect(GyneDiagnosisService.updateDiagnosis).toHaveBeenCalledWith(700, expect.objectContaining({ interpretation: "x" }));
    });

    it("does nothing while in revision mode, even with an existing diagnosis", async () => {
      const diag = makeDiagnosis();
      (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockResolvedValue(diag);
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.diagnosis).toEqual(diag));

      await act(async () => {
        await result.current.persistDraftForPreview({ interpretation: "x" }, true);
      });

      expect(GyneDiagnosisService.updateDiagnosis).not.toHaveBeenCalled();
    });

    it("does nothing when no diagnosis exists yet", async () => {
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.persistDraftForPreview({ interpretation: "x" }, false);
      });

      expect(GyneDiagnosisService.updateDiagnosis).not.toHaveBeenCalled();
    });
  });

  describe("finalize", () => {
    const diag = makeDiagnosis();

    beforeEach(() => {
      (GyneDiagnosisService.getCurrentDiagnosis as ReturnType<typeof vi.fn>).mockResolvedValue(diag);
      (GyneDiagnosisService.publishReport as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "published" });
      (SystemSettingService.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        require_all_gyne_sign: false,
      });
    });

    const setup = async (signers = [{ user_id: 1, role: "primary", signed_at: null }]) => {
      const form = makeForm({ signers });
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.diagnosis).toEqual(diag));
      await waitFor(() => expect(result.current.currentUser).toEqual(currentUser));
      await waitFor(() => expect(result.current.systemSettings).not.toBeNull());
      return { form, result };
    };

    it("normal branch: signs everyone with the current time and publishes", async () => {
      const { form, result } = await setup();

      await act(async () => {
        await result.current.finalize(null, null, undefined, {
          forceEdit: false,
          requiresPathologistReview: false,
          signOnlyCurrentUser: false,
        });
      });

      expect(form.setFieldValue).toHaveBeenCalledWith(
        "signers",
        expect.arrayContaining([expect.objectContaining({ user_id: 1, signed_at: expect.any(String) })]),
      );
      expect(GyneDiagnosisService.publishReport).toHaveBeenCalledWith(300, expect.any(Array), false, undefined, undefined);
      expect(await screen.findByText("NILM — Report Published")).toBeInTheDocument();
    });

    it("signOnlyCurrentUser branch stamps only the current user and flags publish as requiring review (cytotech send-to-pathologist flow)", async () => {
      const signers = [
        { user_id: 1, role: "cytotechnologist", signed_at: null },
        { user_id: 42, role: "primary", signed_at: null },
      ];
      const { form, result } = await setup(signers);

      await act(async () => {
        await result.current.finalize(null, null, undefined, {
          forceEdit: false,
          requiresPathologistReview: true,
          signOnlyCurrentUser: true,
        });
      });

      const updatedSigners = (form.setFieldValue as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(updatedSigners).toEqual([
        expect.objectContaining({ user_id: 1, signed_at: expect.any(String) }),
        expect.objectContaining({ user_id: 42, signed_at: null }),
      ]);
      expect(GyneDiagnosisService.publishReport).toHaveBeenCalledWith(300, updatedSigners, true, undefined, undefined);
    });

    it("regression: a pathologist finalizing an abnormal case (requiresPathologistReview=true, signOnlyCurrentUser=false) still stamps every signer", async () => {
      const signers = [
        { user_id: 1, role: "primary", signed_at: null },
        { user_id: 2, role: "cytotechnologist", signed_at: null },
      ];
      const { form, result } = await setup(signers);

      await act(async () => {
        await result.current.finalize(null, null, undefined, {
          forceEdit: false,
          requiresPathologistReview: true,
          signOnlyCurrentUser: false,
        });
      });

      const updatedSigners = (form.setFieldValue as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(updatedSigners).toEqual([
        expect.objectContaining({ user_id: 1, signed_at: expect.any(String) }),
        expect.objectContaining({ user_id: 2, signed_at: expect.any(String) }),
      ]);
      expect(GyneDiagnosisService.publishReport).toHaveBeenCalledWith(300, updatedSigners, true, undefined, undefined);
    });

    it("out-lab branch reports the out-lab success message and flags the publish call", async () => {
      const { result } = await setup();

      await act(async () => {
        await result.current.finalize("good", "good", { reason: "Need expert opinion" }, {
          forceEdit: false,
          requiresPathologistReview: false,
          signOnlyCurrentUser: false,
        });
      });

      expect(GyneDiagnosisService.publishReport).toHaveBeenCalledWith(
        300,
        expect.any(Array),
        false,
        true,
        "Need expert opinion",
      );
      expect(await screen.findByText("Report signed off — flagged for Out-Lab Consult")).toBeInTheDocument();
    });

    it("require-all-sign branch warns and bails out when the current user isn't a listed signer", async () => {
      (SystemSettingService.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        require_all_gyne_sign: true,
      });
      const { result } = await setup([{ user_id: 99, role: "primary", signed_at: null }]);

      await act(async () => {
        await result.current.finalize(null, null, undefined, {
          forceEdit: false,
          requiresPathologistReview: false,
          signOnlyCurrentUser: false,
        });
      });

      expect(
        await screen.findByText("You are not in the signers list. Please add yourself before finalizing."),
      ).toBeInTheDocument();
      expect(GyneDiagnosisService.publishReport).not.toHaveBeenCalled();
    });

    it("require-all-sign branch waits for other co-signers instead of publishing", async () => {
      (SystemSettingService.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        require_all_gyne_sign: true,
      });
      const { result } = await setup([
        { user_id: 1, role: "primary", signed_at: null },
        { user_id: 2, role: "cytotechnologist", signed_at: null },
      ]);

      await act(async () => {
        await result.current.finalize(null, null, undefined, {
          forceEdit: false,
          requiresPathologistReview: false,
          signOnlyCurrentUser: false,
        });
      });

      expect(await screen.findByText("Signed. Waiting for other co-signers.")).toBeInTheDocument();
      expect(GyneDiagnosisService.publishReport).not.toHaveBeenCalled();
    });
  });

  describe("completeReview", () => {
    it("agree: persists, shows success, and refreshes caseData", async () => {
      (GyneCytologyCaseService.getById as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeCaseData())
        .mockResolvedValueOnce(makeCaseData({ status: "published" }));
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.caseData).toEqual(expect.objectContaining({ status: "registered" })));

      let outcome: string | null = null;
      await act(async () => {
        outcome = await result.current.completeReview("agree");
      });

      expect(outcome).toBe("agree");
      expect(GyneDiagnosisService.completeReview).toHaveBeenCalledWith(300, "agree", undefined, undefined, undefined, undefined);
      expect(await screen.findByText("Agreed — case published.")).toBeInTheDocument();
      await waitFor(() => expect(result.current.caseData).toEqual(expect.objectContaining({ status: "published" })));
    });

    it("disagree: shows the discordance message", async () => {
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: string | null = null;
      await act(async () => {
        outcome = await result.current.completeReview("disagree", "note", "minor");
      });

      expect(outcome).toBe("disagree");
      expect(GyneDiagnosisService.completeReview).toHaveBeenCalledWith(300, "disagree", "note", "minor", undefined, undefined);
      expect(await screen.findByText("Discordance recorded — case returned to cytotechnologist.")).toBeInTheDocument();
    });

    it("returns null and shows an error message when the API call fails", async () => {
      (GyneDiagnosisService.completeReview as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let outcome: string | null = "unset" as never;
      await act(async () => {
        outcome = await result.current.completeReview("agree");
      });

      expect(outcome).toBeNull();
      expect(await screen.findByText("Failed to complete review.")).toBeInTheDocument();
    });
  });

  describe("toggleOutLabConsult", () => {
    it("persists the flag, updates caseData, and triggers a notification when turned on", async () => {
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.caseData).not.toBeNull());

      await act(async () => {
        await result.current.toggleOutLabConsult(true);
      });

      expect(GyneCytologyCaseService.update).toHaveBeenCalledWith(300, { is_out_lab_consult: true });
      expect(result.current.caseData).toEqual(expect.objectContaining({ is_out_lab_consult: true }));
      expect(NotificationRuleService.triggerEvent).toHaveBeenCalledWith(
        "outlab_consult",
        expect.objectContaining({ accession_no: "C26-00002" }),
      );
      expect(await screen.findByText("Out-Lab Consult status updated.")).toBeInTheDocument();
    });

    it("does not trigger a notification when turned off", async () => {
      const form = makeForm();
      const { result } = renderHook(() => useGyneDiagnosisData("300", form), { wrapper });
      await waitFor(() => expect(result.current.caseData).not.toBeNull());

      await act(async () => {
        await result.current.toggleOutLabConsult(false);
      });

      expect(NotificationRuleService.triggerEvent).not.toHaveBeenCalled();
    });
  });
});
