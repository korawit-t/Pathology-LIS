import React from "react";
import { render, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import PathologistNongyneDiagnosisPage from "./PathologistNongyneDiagnosisPage";
import NongyneReportService from "../../services/nongyneReportService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import type { NongyneCytologyCase } from "../../types/nongyne";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/nongyneDiagnosisService", () => ({
  default: {
    getByCaseId: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../services/nongyneCytoCaseService", () => ({
  default: {
    getById: vi.fn(),
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
  },
}));
vi.mock("../../services/nongyneCaseImageService", () => ({
  default: {
    getImages: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../services/userService", () => ({
  default: {
    getUsers: vi.fn().mockResolvedValue([]),
    getCurrentUser: vi.fn().mockResolvedValue(null),
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
vi.mock("../../components/Editors/SimpleTiptapEditor", () => ({ default: trivialMock("mock-tiptap-editor") }));
vi.mock("../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem", () => ({ default: trivialMock("mock-diagnostic-template") }));
vi.mock("../Gross/components/GrossTemplateSystem", () => ({ default: trivialMock("mock-gross-template") }));
vi.mock("./components/NongyneSignOffPage", () => ({ default: trivialMock("mock-sign-off") }));

const mockGetById = NongyneCytologyCaseService.getById as ReturnType<typeof vi.fn>;

const makeCaseData = (overrides: Partial<NongyneCytologyCase> = {}): NongyneCytologyCase =>
  ({
    id: 400,
    accession_no: "N26-00001",
    status: "registered",
    is_out_lab_consult: false,
    patient: { name: "Somsri", ln: "Jaidee", hn: "HN004" },
    ...overrides,
  }) as NongyneCytologyCase;

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
  mockGetById.mockResolvedValue(makeCaseData());
  (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("PathologistNongyneDiagnosisPage", () => {
  it("shows a loading spinner while data is loading", () => {
    mockGetById.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector(".ant-spin")).toBeInTheDocument();
  });

  it("renders the main form once case data has loaded", async () => {
    renderPage();
    expect(await screen.findByText("N26-00001")).toBeInTheDocument();
    expect(screen.getByTestId("mock-pathologist-manager")).toBeInTheDocument();
  });

  it("renders the IHC panel when the case is a cell block", async () => {
    mockGetById.mockResolvedValue(makeCaseData({ is_cell_block: true } as never));
    renderPage();
    expect(await screen.findByTestId("mock-ihc-panel")).toBeInTheDocument();
  });

  it("does not render the IHC panel when the case is not a cell block", async () => {
    renderPage();
    await screen.findByText("N26-00001");
    expect(screen.queryByTestId("mock-ihc-panel")).not.toBeInTheDocument();
  });

  it("auto-opens the completed-case popup and loads report history for a finalized case", async () => {
    mockGetById.mockResolvedValue(makeCaseData({ status: "published" }));
    renderPage();
    expect(await screen.findByText("Case Already Signed Off")).toBeInTheDocument();
    expect(NongyneReportService.getReportsByCase).toHaveBeenCalledWith(400);
  });

  it("does not auto-open the completed-case popup for a draft case", async () => {
    renderPage();
    await screen.findByText("N26-00001");
    expect(screen.queryByText("Case Already Signed Off")).not.toBeInTheDocument();
  });
});
