import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import PathologistGyneDiagnosisPage from "./PathologistGyneDiagnosisPage";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
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
vi.mock("../../components/PathologistDiagnosis/PathologistDiagnosisManager", () => ({ default: trivialMock("mock-pathologist-manager") }));
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
    id: 200,
    accession_no: "C26-00001",
    status: "registered",
    is_out_lab_consult: false,
    patient: { name: "Somsri", ln: "Jaidee", hn: "HN001" },
    ...overrides,
  }) as GyneCytologyCase;

const makeDiagnosis = (overrides: Partial<GyneDiagnosisResponse> = {}): GyneDiagnosisResponse =>
  ({
    id: 500,
    case_id: 200,
    signers: [],
    ...overrides,
  }) as unknown as GyneDiagnosisResponse;

const currentUser = { id: 1, username: "path1", full_name: "Dr. Path", roles: ["pathologist"] } as User;

const makeHookReturn = (overrides: Record<string, unknown> = {}) => ({
  caseData: makeCaseData(),
  setCaseData: vi.fn(),
  diagnosis: null,
  setDiagnosis: vi.fn(),
  images: [],
  descMap: {},
  setDescMap: vi.fn(),
  categories: [],
  pathologists: [],
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

const baseProps = { caseId: "200", onBack: vi.fn() };

// PathologistGyneDiagnosisPage calls App.useApp() directly (for message/notification),
// which needs a real antd <App> context provider or message.success/error silently
// aren't functions and throw.
const renderPage = (props: Partial<typeof baseProps> = {}) =>
  render(
    <AntdApp>
      <PathologistGyneDiagnosisPage {...baseProps} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGyneDiagnosisData.mockReturnValue(makeHookReturn());
});

describe("PathologistGyneDiagnosisPage", () => {
  it("shows a loading spinner while data is loading", () => {
    mockUseGyneDiagnosisData.mockReturnValue(makeHookReturn({ loading: true }));
    const { container } = renderPage();
    expect(container.querySelector(".ant-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-pathologist-manager")).not.toBeInTheDocument();
  });

  it("renders the main form for a draft case", () => {
    renderPage();
    expect(screen.getByText("C26-00001")).toBeInTheDocument();
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
    expect(GyneDiagnosisService.getReportsByCase).toHaveBeenCalledWith(200);
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

  it("adds the current pathologist as a co-signer when submitting a disagree-revision", async () => {
    mockUseGyneDiagnosisData.mockReturnValue(
      makeHookReturn({
        caseData: makeCaseData({ status: "published", review_result: "disagree" }),
        diagnosis: makeDiagnosis({
          signers: [{ user_id: 999, role: "primary", signed_at: "2026-01-01T00:00:00Z" }],
        }),
        adequacyOptions: [{ id: 10, text: "Satisfactory", group_type: "ADEQUACY" }],
      }),
    );
    renderPage();

    fireEvent.click(await screen.findByText("Revise"));

    fireEvent.mouseDown(screen.getByText("Select adequacy"));
    fireEvent.click(await screen.findByText("Satisfactory"));

    fireEvent.change(
      screen.getByPlaceholderText("Explain why this report is being revised..."),
      { target: { value: "Pathologist disagreed with the prior read." } },
    );

    fireEvent.click(screen.getByText("Save Draft Revision"));

    await waitFor(() => expect(GyneDiagnosisService.reviseReport).toHaveBeenCalled());
    const [, payload] = (GyneDiagnosisService.reviseReport as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.signers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 1, role: "co-sign pathologist" }),
      ]),
    );
  });
});
