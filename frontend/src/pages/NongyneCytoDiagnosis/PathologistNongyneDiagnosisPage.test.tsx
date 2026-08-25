import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App as AntdApp } from "antd";
import PathologistNongyneDiagnosisPage from "./PathologistNongyneDiagnosisPage";
import NongyneReportService from "../../services/nongyneReportService";
import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import type { NongyneCytologyCase } from "../../types/nongyne";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/nongyneDiagnosisService", () => ({
  default: {
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    previewReportPdf: vi.fn(),
    getReportPdf: vi.fn(),
  },
}));
vi.mock("../../services/nongyneCytoCaseService", () => ({
  default: {
    update: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../services/notificationRuleService", () => ({
  default: { triggerEvent: vi.fn() },
}));
vi.mock("../../services/nongyneReportService", () => ({
  default: {
    getReportsByCase: vi.fn().mockResolvedValue([]),
    getReportPdf: vi.fn(),
    publishReport: vi.fn(),
  },
}));

const { trivialMock } = vi.hoisted(() => ({
  trivialMock: (name: string) => () => <div data-testid={name} />,
}));
vi.mock("../../components/PatientInfoCard", () => ({ default: trivialMock("mock-patient-info") }));
vi.mock("../../components/ReportPreviewModal", () => ({ default: trivialMock("mock-report-preview") }));
vi.mock("../../components/PathologistDiagnosis/PathologistDiagnosisManager", () => ({ default: trivialMock("mock-pathologist-manager") }));
vi.mock("../../components/InternalConsult/ConsultRequestModal", () => ({ default: trivialMock("mock-consult-request") }));
vi.mock("../../components/InternalConsult/ConsultHistorySection", () => ({ default: trivialMock("mock-consult-history") }));
vi.mock("../../components/OutlabConsult/ConsultPdfPanel", () => ({ default: trivialMock("mock-consult-pdf-panel") }));
vi.mock("./components/NongyneIHCResultPanel", () => ({ default: trivialMock("mock-ihc-panel") }));
vi.mock("./components/NongyneCytologyImageCaptureModal", () => ({ default: trivialMock("mock-image-capture") }));
vi.mock("../../components/SecureImage", () => ({ default: trivialMock("mock-secure-image") }));
vi.mock("../../components/CytoCorrelationManager", () => ({ default: trivialMock("mock-cyto-correlation") }));
vi.mock("../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem", () => ({ default: trivialMock("mock-diagnostic-template") }));
vi.mock("../Gross/components/GrossTemplateSystem", () => ({ default: trivialMock("mock-gross-template") }));
// Unlike the other stubs, this one honours `open` — the sign-off flow's
// whole point is *when* this page appears (only after the draft saved).
vi.mock("./components/NongyneSignOffPage", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-sign-off" /> : null,
}));
// A controlled stand-in for the tiptap editor so tests can assert what the
// form actually hands to saveDraft (the real editor needs a DOM range API).
vi.mock("../../components/Editors/SimpleTiptapEditor", () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (v: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

const mockUseNongyneDiagnosisData = vi.fn();
vi.mock("./hooks/useNongyneDiagnosisData", () => ({
  useNongyneDiagnosisData: (...args: unknown[]) => mockUseNongyneDiagnosisData(...args),
}));

const makeCaseData = (overrides: Partial<NongyneCytologyCase> = {}): NongyneCytologyCase =>
  ({
    id: 400,
    accession_no: "N26-00001",
    status: "registered",
    is_out_lab_consult: false,
    patient: { name: "Somsri", ln: "Jaidee", hn: "HN004" },
    ...overrides,
  }) as NongyneCytologyCase;

const makeHookReturn = (overrides: Record<string, unknown> = {}) => ({
  caseData: makeCaseData(),
  setCaseData: vi.fn(),
  diagnosis: null,
  setDiagnosis: vi.fn(),
  images: [],
  descMap: {},
  setDescMap: vi.fn(),
  allUsers: [],
  currentUser: null,
  loading: false,
  setLoading: vi.fn(),
  submitting: false,
  setSubmitting: vi.fn(),
  activeReportId: null,
  defaultSigners: [],
  fetchDiagnosis: vi.fn(),
  fetchCaseData: vi.fn(),
  fetchImages: vi.fn(),
  saveDesc: vi.fn(),
  saveDraft: vi.fn().mockResolvedValue({ isCreate: false }),
  finalize: vi.fn().mockResolvedValue(true),
  ...overrides,
});

const baseProps = { caseId: "400", onBack: vi.fn() };

// PathologistNongyneDiagnosisPage doesn't use App.useApp(), but message/App
// static calls elsewhere in the tree are safest under a real <App> context.
const renderPage = (props: Partial<typeof baseProps> = {}) =>
  render(
    <AntdApp>
      <PathologistNongyneDiagnosisPage {...baseProps} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNongyneDiagnosisData.mockReturnValue(makeHookReturn());
  (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-report-pdf");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("PathologistNongyneDiagnosisPage", () => {
  it("shows a loading spinner while data is loading", () => {
    mockUseNongyneDiagnosisData.mockReturnValue(makeHookReturn({ loading: true }));
    const { container } = renderPage();
    expect(container.querySelector(".ant-spin")).toBeInTheDocument();
  });

  it("renders the main form once case data has loaded", () => {
    renderPage();
    expect(screen.getByText("N26-00001")).toBeInTheDocument();
    expect(screen.getByTestId("mock-pathologist-manager")).toBeInTheDocument();
  });

  it("renders the IHC panel when the case is a cell block", () => {
    mockUseNongyneDiagnosisData.mockReturnValue(
      makeHookReturn({ caseData: makeCaseData({ is_cell_block: true } as never) }),
    );
    renderPage();
    expect(screen.getByTestId("mock-ihc-panel")).toBeInTheDocument();
  });

  it("does not render the IHC panel when the case is not a cell block", () => {
    renderPage();
    expect(screen.queryByTestId("mock-ihc-panel")).not.toBeInTheDocument();
  });

  it("auto-opens the completed-case popup and loads report history for a finalized case", async () => {
    mockUseNongyneDiagnosisData.mockReturnValue(
      makeHookReturn({ caseData: makeCaseData({ status: "published" }) }),
    );
    renderPage();
    expect(await screen.findByText("Case Already Signed Off")).toBeInTheDocument();
    expect(NongyneReportService.getReportsByCase).toHaveBeenCalledWith(400);
  });

  it("does not auto-open the completed-case popup for a draft case", async () => {
    renderPage();
    await screen.findByText("N26-00001");
    expect(screen.queryByText("Case Already Signed Off")).not.toBeInTheDocument();
  });

  it("selecting a report in the completed-case popup fetches and renders its PDF", async () => {
    mockUseNongyneDiagnosisData.mockReturnValue(
      makeHookReturn({ caseData: makeCaseData({ status: "published" }) }),
    );
    (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 901, status: "published", created_at: "2026-07-01T00:00:00Z" },
    ]);
    (NongyneReportService.getReportPdf as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(["fake-pdf"], { type: "application/pdf" }),
    );

    renderPage();
    await screen.findByText("Case Already Signed Off");

    await waitFor(() => expect(NongyneReportService.getReportPdf).toHaveBeenCalledWith(901));
    const iframe = await screen.findByTitle("Report PDF");
    expect(iframe).toHaveAttribute("src", "blob:mock-report-pdf");
  });

  describe("Sign-off", () => {
    // The hook owns the form fill in real use; it's mocked here, so seed the
    // required fields (specimen_type, diagnosis) the same way it would.
    const renderWithFilledForm = (hookReturn: ReturnType<typeof makeHookReturn>) => {
      mockUseNongyneDiagnosisData.mockImplementation(
        (_caseId: unknown, form: { setFieldsValue: (v: unknown) => void }) => {
          React.useEffect(() => {
            form.setFieldsValue({
              specimen_type: "Fluid",
              diagnosis: "Adenocarcinoma",
            });
          }, [form]);
          return hookReturn;
        },
      );
      return renderPage();
    };

    const withDiagnosis = (overrides: Record<string, unknown> = {}) =>
      makeHookReturn({
        diagnosis: { id: 55, diagnosis: "Previously saved" },
        ...overrides,
      });

    it("saves the draft before opening the sign-off page", async () => {
      const saveDraft = vi.fn().mockResolvedValue({ isCreate: false });
      const fetchDiagnosis = vi.fn().mockResolvedValue(undefined);
      renderWithFilledForm(withDiagnosis({ saveDraft, fetchDiagnosis }));

      expect(screen.queryByTestId("mock-sign-off")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Sign-off/i }));

      await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
      expect(saveDraft.mock.calls[0][0]).toMatchObject({
        specimen_type: "Fluid",
        diagnosis: "Adenocarcinoma",
      });
      expect(fetchDiagnosis).toHaveBeenCalledWith(false);
      expect(await screen.findByTestId("mock-sign-off")).toBeInTheDocument();
    });

    it("picks up edits made since the last manual Save Draft", async () => {
      const saveDraft = vi.fn().mockResolvedValue({ isCreate: false });
      renderWithFilledForm(withDiagnosis({ saveDraft }));

      fireEvent.change(screen.getByLabelText("Enter diagnosis..."), {
        target: { value: "Suspicious for malignancy" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Sign-off/i }));

      await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
      expect(saveDraft.mock.calls[0][0]).toMatchObject({
        diagnosis: "Suspicious for malignancy",
      });
    });

    it("keeps the sign-off page closed when the draft save fails", async () => {
      const saveDraft = vi.fn().mockRejectedValue(new Error("network down"));
      renderWithFilledForm(withDiagnosis({ saveDraft }));

      fireEvent.click(screen.getByRole("button", { name: /Sign-off/i }));

      await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId("mock-sign-off")).not.toBeInTheDocument();
    });

    it("blocks sign-off (and the save) when a required field is empty", async () => {
      const saveDraft = vi.fn().mockResolvedValue({ isCreate: false });
      // specimen_type filled, diagnosis left empty — the diagnosis Form.Item
      // is noStyle, so the toast is the only feedback the user gets.
      mockUseNongyneDiagnosisData.mockImplementation(
        (_caseId: unknown, form: { setFieldsValue: (v: unknown) => void }) => {
          React.useEffect(() => {
            form.setFieldsValue({ specimen_type: "Fluid" });
          }, [form]);
          return withDiagnosis({ saveDraft });
        },
      );
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: /Sign-off/i }));

      expect(await screen.findByText("Diagnosis is required.")).toBeInTheDocument();
      expect(saveDraft).not.toHaveBeenCalled();
      expect(screen.queryByTestId("mock-sign-off")).not.toBeInTheDocument();
    });
  });

  it("revokes the previous preview PDF when Preview PDF is clicked twice without closing the modal", async () => {
    let blobCounter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-preview-${++blobCounter}`);
    (NongyneDiagnosisService.previewReportPdf as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(["fake-pdf"], { type: "application/pdf" }),
    );

    renderPage();
    const previewButton = screen.getByRole("button", { name: /Preview PDF/i });

    fireEvent.click(previewButton);
    await waitFor(() => expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1));

    fireEvent.click(previewButton);
    await waitFor(() => expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(2));

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-preview-1");
  });
});
