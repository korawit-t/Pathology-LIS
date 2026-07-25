import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Form, Input } from "antd";
import SurgicalReportForm from "./index";
import UserService from "../../../services/userService";
import SurgicalReportService from "../../../services/surgicalReportService";
import type { User } from "../../../types/user";
import type { SurgicalCase, SurgicalSpecimen } from "../../../types/surgical";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ updateUser: vi.fn() }),
}));

vi.mock("../../../services/microscopicImageService", () => ({
  default: {
    getImagesByCaseId: vi.fn().mockResolvedValue([]),
    updateImage: vi.fn(),
    uploadImage: vi.fn(),
  },
}));
vi.mock("../../../services/userService", () => ({
  default: { updateMyPreferences: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../../services/surgicalCaseService", () => ({
  default: {
    getConsultPdfBlob: vi.fn(),
    uploadConsultPdf: vi.fn(),
    approveConsultPdf: vi.fn(),
    deleteConsultPdf: vi.fn(),
  },
}));
vi.mock("../../../services/surgicalReportService", () => ({
  default: {
    getReportPdf: vi.fn(),
    getReportHistory: vi.fn().mockResolvedValue({ items: [] }),
    deleteReport: vi.fn(),
  },
}));
vi.mock("../../../services/reportGenerationService", () => ({
  default: { getPreview: vi.fn(), generate: vi.fn() },
}));
vi.mock("../../../services/wsiSettingService", () => ({
  default: { getCaseSlides: vi.fn().mockResolvedValue([]) },
}));

// Real Form.Item so tests can dirty the form the same way a real field would.
vi.mock("../../../components/ClinicalInfoSection", () => ({
  default: ({ name }: { name: string }) => (
    <Form.Item name={name}>
      <Input data-testid="clinical-input" />
    </Form.Item>
  ),
}));

// Exposes onUpdatePreference so tests can exercise item 4's merge behavior.
vi.mock("./components/ReportStationSettingsModal", () => ({
  default: ({ onUpdatePreference }: { onUpdatePreference: (p: unknown) => void }) => (
    <button onClick={() => onUpdatePreference({ show_navigator: false })}>
      trigger-update-preference
    </button>
  ),
}));

const { trivialMock } = vi.hoisted(() => ({
  trivialMock: (name: string) => () => <div data-testid={name} />,
}));
vi.mock("../../../components/PatientInfoCard", () => ({ default: trivialMock("mock-patient-info") }));
vi.mock("../../../components/SpecimenManagerSection/SpecimenManagerSection", () => ({ default: trivialMock("mock-specimen-manager") }));
vi.mock("./components/SpecimenIntegratedWorkblock", () => ({ default: trivialMock("mock-workblock") }));
vi.mock("./components/WsiSlidesSection", () => ({ default: trivialMock("mock-wsi-slides") }));
vi.mock("./components/MicroscopicImageCaptureModal", () => ({ default: trivialMock("mock-micro-capture") }));
vi.mock("../../../components/ReportPreviewModal", () => ({ default: trivialMock("mock-report-preview") }));
vi.mock("./components/IntegratedCaseDiagnosisEditor", () => ({ default: trivialMock("mock-integrated-editor") }));
vi.mock("./components/SurgicalReportToolbar", () => ({ default: trivialMock("mock-toolbar") }));
vi.mock("./components/ReportHistorySection", () => ({ default: trivialMock("mock-report-history") }));
vi.mock("./components/PathologistDiagnosisManager", () => ({ default: trivialMock("mock-pathologist-manager") }));
vi.mock("./components/ReportMasterControl", () => ({ default: trivialMock("mock-report-master-control") }));
vi.mock("./components/FinalizeReportPage", () => ({ default: trivialMock("mock-finalize-report") }));
vi.mock("./components/CaseFlagManager", () => ({ default: trivialMock("mock-case-flag-manager") }));
vi.mock("./components/CytoHistoCorrelationCard", () => ({ default: trivialMock("mock-cyto-histo") }));
vi.mock("./components/SurgicalReportNavigator", () => ({ default: trivialMock("mock-navigator") }));
vi.mock("../../../components/PdfPageSelector/PdfPageThumbnailStrip", () => ({ default: trivialMock("mock-pdf-thumbnail-strip") }));
vi.mock("../../../components/PdfPageSelector/PdfPagePreviewPane", () => ({ default: trivialMock("mock-pdf-preview-pane") }));
vi.mock("./components/AIGeneratePreviewModal", () => ({ default: trivialMock("mock-ai-generate") }));

const mockUseSurgicalReport = vi.fn();
vi.mock("../hooks/useSurgicalReport", () => ({
  useSurgicalReport: (...args: unknown[]) => mockUseSurgicalReport(...args),
}));

const makeSpecimen = (overrides: Partial<SurgicalSpecimen> = {}): SurgicalSpecimen =>
  ({
    id: 1,
    specimen_label: "A",
    specimen_name: "Test specimen",
    ...overrides,
  }) as SurgicalSpecimen;

const makeSurgicalCase = (overrides: Partial<SurgicalCase> = {}): SurgicalCase =>
  ({
    id: 100,
    accession_no: "S26-00001",
    status: "draft",
    specimens: [makeSpecimen()],
    reports: [],
    ...overrides,
  }) as SurgicalCase;

const makeHookReturn = (overrides: Record<string, unknown> = {}) => ({
  loading: false,
  pdfUrl: null,
  generatingPdf: false,
  surgicalCase: makeSurgicalCase(),
  allDiagnoses: [],
  currentDiagnosis: null,
  pathologists: [],
  isLocked: false,
  hasOriginalSigned: false,
  settings: {},
  isAwaitingApproval: false,
  diagnosisMode: "individual" as const,
  setDiagnosisMode: vi.fn(),
  handleSaveAsIndividualDraft: vi.fn().mockResolvedValue(undefined),
  handleSaveAsIntegratedDraft: vi.fn().mockResolvedValue(undefined),
  handleSaveAsCleanDraft: vi.fn().mockResolvedValue(undefined),
  handlePreviewPDF: vi.fn().mockResolvedValue(undefined),
  handleSelectDiagnosis: vi.fn(),
  refresh: vi.fn(),
  handleCompleteWorkflow: vi.fn().mockResolvedValue(true),
  setSurgicalCase: vi.fn(),
  ...overrides,
});

const baseUser = { id: 1, username: "path1", full_name: "Dr. Path" } as User;

const baseProps = {
  user: baseUser,
  caseId: "100",
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSurgicalReport.mockReturnValue(makeHookReturn());
});

describe("SurgicalDiagnosisReportForm/index", () => {
  it("renders the main form once case data has loaded", () => {
    render(<SurgicalReportForm {...baseProps} />);
    expect(screen.getByTestId("mock-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("mock-workblock")).toBeInTheDocument();
  });

  it("shows a loading spinner while data is loading and no case yet", () => {
    mockUseSurgicalReport.mockReturnValue(makeHookReturn({ loading: true, surgicalCase: null }));
    const { container } = render(<SurgicalReportForm {...baseProps} />);
    expect(container.querySelector(".ant-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-toolbar")).not.toBeInTheDocument();
  });

  it("shows the empty-specimens guard when the case has no specimens", () => {
    mockUseSurgicalReport.mockReturnValue(
      makeHookReturn({ surgicalCase: makeSurgicalCase({ specimens: [] }) }),
    );
    render(<SurgicalReportForm {...baseProps} />);
    expect(screen.getByText("No Specimens Found")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-toolbar")).not.toBeInTheDocument();
  });

  it("auto-opens the consult PDF popup in its upload state while a consult round is active", async () => {
    mockUseSurgicalReport.mockReturnValue(
      makeHookReturn({
        surgicalCase: makeSurgicalCase({
          is_out_lab_consult: true,
          consult_status: "processing",
        }),
      }),
    );
    await act(async () => {
      render(<SurgicalReportForm {...baseProps} />);
    });
    expect(screen.getByText("Out-Lab Consult")).toBeInTheDocument();
    expect(screen.getByText("Click or drag PDF to upload")).toBeInTheDocument();
  });

  it("auto-opens the completed-case popup and loads report history for a signed-out case", async () => {
    mockUseSurgicalReport.mockReturnValue(
      makeHookReturn({ surgicalCase: makeSurgicalCase({ status: "signed out" }) }),
    );
    await act(async () => {
      render(<SurgicalReportForm {...baseProps} />);
    });
    expect(screen.getByText("Case Already Signed Off")).toBeInTheDocument();
    expect(SurgicalReportService.getReportHistory).toHaveBeenCalledWith(100);
  });

  it("merges a partial preference update and persists only the changed field", async () => {
    render(<SurgicalReportForm {...baseProps} />);
    await act(async () => {
      fireEvent.click(screen.getByText("trigger-update-preference"));
    });
    expect(UserService.updateMyPreferences).toHaveBeenCalledWith({ show_navigator: false });
  });

  it("auto-saves after the configured interval once the form is dirty", async () => {
    vi.useFakeTimers();
    const handleSaveAsIndividualDraft = vi.fn().mockResolvedValue(undefined);
    mockUseSurgicalReport.mockReturnValue(makeHookReturn({ handleSaveAsIndividualDraft }));
    render(<SurgicalReportForm {...baseProps} />);

    fireEvent.change(screen.getByTestId("clinical-input"), { target: { value: "dirty" } });

    // Default auto_save_interval is 45s (user.preferences is undefined here).
    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    expect(handleSaveAsIndividualDraft).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not auto-save when auto_save preference is disabled", async () => {
    vi.useFakeTimers();
    const handleSaveAsIndividualDraft = vi.fn().mockResolvedValue(undefined);
    mockUseSurgicalReport.mockReturnValue(makeHookReturn({ handleSaveAsIndividualDraft }));
    const userWithAutoSaveOff = {
      ...baseUser,
      preferences: { auto_save: false },
    } as User;
    render(<SurgicalReportForm {...baseProps} user={userWithAutoSaveOff} />);

    fireEvent.change(screen.getByTestId("clinical-input"), { target: { value: "dirty" } });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(handleSaveAsIndividualDraft).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
