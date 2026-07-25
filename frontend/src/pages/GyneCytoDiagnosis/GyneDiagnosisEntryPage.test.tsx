import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import GyneDiagnosisEntryPage from "./GyneDiagnosisEntryPage";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import type { User } from "../../types/user";
import type { GyneCytologyCase } from "../../types/gyne-cytology";
import type { GyneDiagnosisResponse, GyneSpecimenAdequacy } from "../../types/gyne-diagnosis";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/gyneDiagnosisService", () => ({
  default: {
    getReportsByCase: vi.fn().mockResolvedValue([]),
    getReportPdf: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    updateDiagnosis: vi.fn().mockResolvedValue({}),
    reviseReport: vi.fn().mockResolvedValue({}),
    createInitial: vi.fn().mockResolvedValue({}),
    publishReport: vi.fn().mockResolvedValue({ status: "published" }),
  },
}));
vi.mock("../../services/gyneCytoCaseService", () => ({
  default: {
    update: vi.fn().mockResolvedValue({}),
    uploadConsultPdf: vi.fn(),
    deleteConsultPdf: vi.fn(),
  },
}));
vi.mock("../../services/notificationRuleService", () => ({
  default: { triggerEvent: vi.fn() },
}));

const { trivialMock } = vi.hoisted(() => ({
  trivialMock: (name: string) => () => <div data-testid={name} />,
}));
vi.mock("../../components/ReportPreviewModal", () => ({ default: trivialMock("mock-report-preview") }));
vi.mock("../../components/PatientInfoCard", () => ({ default: trivialMock("mock-patient-info") }));
vi.mock("./components/GyneCytologyImageCaptureModal", () => ({ default: trivialMock("mock-image-capture") }));
vi.mock("./components/GynePathologistDiagnosisManager", () => ({ default: trivialMock("mock-pathologist-manager") }));
vi.mock("../../components/InternalConsult/ConsultRequestModal", () => ({ default: trivialMock("mock-consult-request") }));
vi.mock("../../components/InternalConsult/ConsultHistorySection", () => ({ default: trivialMock("mock-consult-history") }));
vi.mock("../../components/OutlabConsult/ConsultPdfPanel", () => ({ default: trivialMock("mock-consult-pdf-panel") }));
vi.mock("../../components/CytoCorrelationManager", () => ({ default: trivialMock("mock-cyto-correlation") }));
vi.mock("./components/GyneClinicalInfoCard", () => ({ default: trivialMock("mock-clinical-info") }));
vi.mock("./components/GyneReportedResult", () => ({ default: trivialMock("mock-reported-result") }));
vi.mock("./components/GyneCytologyImagesSection", () => ({ default: trivialMock("mock-images-section") }));
vi.mock("./components/GyneQCReviewSection", () => ({ default: trivialMock("mock-qc-review") }));
vi.mock("./components/GyneSignOffPage", () => ({ default: trivialMock("mock-sign-off") }));

const mockUseGyneDiagnosisData = vi.fn();
vi.mock("./hooks/useGyneDiagnosisData", () => ({
  useGyneDiagnosisData: (...args: unknown[]) => mockUseGyneDiagnosisData(...args),
}));

const makeCaseData = (overrides: Partial<GyneCytologyCase> = {}): GyneCytologyCase =>
  ({
    id: 300,
    accession_no: "C26-00002",
    status: "registered",
    is_out_lab_consult: false,
    patient: { name: "Somchai", ln: "Deejai", hn: "HN002" },
    ...overrides,
  }) as GyneCytologyCase;

const makeDiagnosis = (overrides: Partial<GyneDiagnosisResponse> = {}): GyneDiagnosisResponse =>
  ({
    id: 600,
    case_id: 300,
    signers: [],
    ...overrides,
  }) as unknown as GyneDiagnosisResponse;

const currentUser = { id: 2, username: "cyto1", full_name: "CT One", roles: ["cytotechnologist"] } as User;

const makeHookReturn = (overrides: Record<string, unknown> = {}) => ({
  caseData: makeCaseData(),
  setCaseData: vi.fn(),
  diagnosis: null,
  setDiagnosis: vi.fn(),
  images: [],
  descMap: {},
  setDescMap: vi.fn(),
  categories: [],
  pathologists: [] as { id: number; full_name?: string; roles?: string[] }[],
  currentUser,
  systemSettings: {},
  loading: false,
  loadingMaster: false,
  activeReportId: null,
  mainCategories: [],
  adequacyOptions: [] as GyneSpecimenAdequacy[],
  zoneOptions: [],
  qualityOptions: [],
  defaultSigners: [],
  fetchDiagnosis: vi.fn(),
  fetchCaseData: vi.fn(),
  fetchImages: vi.fn(),
  saveDesc: vi.fn(),
  ...overrides,
});

const baseProps = { caseId: "300", onBack: vi.fn() };

// GyneDiagnosisEntryPage calls App.useApp() directly (for message/notification),
// which needs a real antd <App> context provider or message.success/error silently
// aren't functions and throw.
const renderPage = (props: Partial<typeof baseProps> = {}) =>
  render(
    <AntdApp>
      <GyneDiagnosisEntryPage {...baseProps} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGyneDiagnosisData.mockReturnValue(makeHookReturn());
});

describe("GyneDiagnosisEntryPage", () => {
  it("shows a loading spinner while data is loading", () => {
    mockUseGyneDiagnosisData.mockReturnValue(makeHookReturn({ loading: true }));
    const { container } = renderPage();
    expect(container.querySelector(".ant-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-pathologist-manager")).not.toBeInTheDocument();
  });

  it("renders the main form for a draft case", () => {
    renderPage();
    expect(screen.getByText("C26-00002")).toBeInTheDocument();
    expect(screen.getByTestId("mock-pathologist-manager")).toBeInTheDocument();
    expect(screen.getByTestId("mock-images-section")).toBeInTheDocument();
  });

  it("auto-opens the completed-case popup and loads report history for a finalized case", async () => {
    mockUseGyneDiagnosisData.mockReturnValue(
      makeHookReturn({
        caseData: makeCaseData({ status: "published" }),
        diagnosis: makeDiagnosis(),
      }),
    );
    renderPage();
    expect(await screen.findByText("Case Already Signed Off")).toBeInTheDocument();
    expect(GyneDiagnosisService.getReportsByCase).toHaveBeenCalledWith(300);
  });

  it("does not auto-open the completed-case popup while pending pathologist QC review", () => {
    mockUseGyneDiagnosisData.mockReturnValue(
      makeHookReturn({
        caseData: makeCaseData({ status: "pending_review" }),
        diagnosis: makeDiagnosis(),
      }),
    );
    renderPage();
    expect(screen.queryByText("Case Already Signed Off")).not.toBeInTheDocument();
  });

  it("routes an abnormal-adequacy case to a selected pathologist as the new primary signer", async () => {
    mockUseGyneDiagnosisData.mockReturnValue(
      makeHookReturn({
        caseData: makeCaseData({ status: "screened" }),
        diagnosis: makeDiagnosis(),
        adequacyOptions: [
          { id: 20, text: "Unsatisfactory - scant cellularity", group_type: "ADEQUACY" },
        ],
        pathologists: [{ id: 42, full_name: "Dr. Somchai", roles: ["pathologist"] }],
      }),
    );
    renderPage();

    fireEvent.mouseDown(screen.getByText("Select adequacy"));
    fireEvent.click(await screen.findByText("Unsatisfactory - scant cellularity"));

    fireEvent.click(await screen.findByText("Send to Pathologist"));

    fireEvent.mouseDown(screen.getByText("Select pathologist"));
    fireEvent.click(await screen.findByText("Dr. Somchai"));

    fireEvent.click(screen.getByText("Confirm & Send"));

    await waitFor(() => expect(GyneDiagnosisService.updateDiagnosis).toHaveBeenCalled());
    const [, payload] = (GyneDiagnosisService.updateDiagnosis as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.signers).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: 42, role: "primary" })]),
    );
    expect(GyneCytologyCaseService.update).toHaveBeenCalled();
  });
});
