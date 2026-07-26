import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import NongyneDiagnosisEntryPage from "./NongyneDiagnosisEntryPage";
import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NongyneReportService from "../../services/nongyneReportService";
import NongyneCaseImageService from "../../services/nongyneCaseImageService";
import SystemSettingService from "../../services/systemSettingService";
import UserService from "../../services/userService";
import type { NongyneCytologyCase } from "../../types/nongyne";
import type { User } from "../../types/user";
import type { NongyneCaseImage } from "../../services/nongyneCaseImageService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/nongyneDiagnosisService", () => ({
  default: {
    getByCaseId: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    previewReportPdf: vi.fn(),
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
vi.mock("../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn().mockResolvedValue({ nongyne_slide_dispatch_enabled: true }) },
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
vi.mock("../../components/InternalConsult/ConsultRequestModal", () => ({ default: trivialMock("mock-consult-request") }));
vi.mock("../../components/InternalConsult/ConsultHistorySection", () => ({ default: trivialMock("mock-consult-history") }));
vi.mock("../../components/OutlabConsult/ConsultPdfPanel", () => ({ default: trivialMock("mock-consult-pdf-panel") }));
vi.mock("./components/NongyneIHCResultPanel", () => ({ default: trivialMock("mock-ihc-panel") }));
vi.mock("./components/NongyneCytologyImageCaptureModal", () => ({ default: trivialMock("mock-image-capture") }));
vi.mock("./components/NongyneCytologyImageGrid", () => ({ default: trivialMock("mock-image-grid") }));
vi.mock("../../components/CytoCorrelationManager", () => ({ default: trivialMock("mock-cyto-correlation") }));
vi.mock("../../components/Editors/SimpleTiptapEditor", () => ({ default: trivialMock("mock-tiptap-editor") }));
vi.mock("../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem", () => ({ default: trivialMock("mock-diagnostic-template") }));
vi.mock("../Gross/components/GrossTemplateSystem", () => ({ default: trivialMock("mock-gross-template") }));

const mockGetById = NongyneCytologyCaseService.getById as ReturnType<typeof vi.fn>;

const makeCaseData = (overrides: Partial<NongyneCytologyCase> = {}): NongyneCytologyCase =>
  ({
    id: 500,
    accession_no: "N26-00002",
    status: "screened",
    is_out_lab_consult: false,
    patient: { name: "Somchai", ln: "Deejai", hn: "HN005" },
    ...overrides,
  }) as NongyneCytologyCase;

const makeImage = (overrides: Partial<NongyneCaseImage> = {}): NongyneCaseImage =>
  ({
    id: 1,
    image_url: "/images/1.jpg",
    show_in_report: false,
    description: "",
    ...overrides,
  }) as NongyneCaseImage;

const baseProps = { caseId: "500", onBack: vi.fn() };

// NongyneDiagnosisEntryPage doesn't use App.useApp() itself, but message/App
// static calls elsewhere in the tree are safest under a real <App> context.
const renderPage = (props: Partial<typeof baseProps> = {}) =>
  render(
    <AntdApp>
      <NongyneDiagnosisEntryPage {...baseProps} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockGetById.mockResolvedValue(makeCaseData());
  (NongyneReportService.getReportsByCase as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (SystemSettingService.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
    nongyne_slide_dispatch_enabled: true,
  });
  (NongyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("NongyneDiagnosisEntryPage", () => {
  it("shows a loading spinner while data is loading", () => {
    mockGetById.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector(".ant-spin")).toBeInTheDocument();
  });

  it("renders the main form once case data has loaded", async () => {
    renderPage();
    expect(await screen.findByText("N26-00002")).toBeInTheDocument();
    expect(screen.getByTestId("mock-image-grid")).toBeInTheDocument();
  });

  it("renders the IHC panel when the case is a cell block", async () => {
    mockGetById.mockResolvedValue(makeCaseData({ is_cell_block: true } as never));
    renderPage();
    expect(await screen.findByTestId("mock-ihc-panel")).toBeInTheDocument();
  });

  it("does not render the IHC panel when the case is not a cell block", async () => {
    renderPage();
    await screen.findByText("N26-00002");
    expect(screen.queryByTestId("mock-ihc-panel")).not.toBeInTheDocument();
  });

  it("sends the case to the selected pathologist", async () => {
    (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, full_name: "Dr. Somsak", roles: ["pathologist"] } as User,
    ]);
    (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 900, status: "draft" },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Send to Pathologist/i }));
    fireEvent.mouseDown(screen.getByText("Select pathologist..."));
    fireEvent.click(await screen.findByText("Dr. Somsak"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Continue/i }));

    await waitFor(() => expect(NongyneCytologyCaseService.update).toHaveBeenCalled());
    const [, payload] = (NongyneCytologyCaseService.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({ pathologist_id: 42, is_screened: true }),
    );
  });

  it("does not render an empty gallery header when no image is flagged show_in_report", async () => {
    mockGetById.mockResolvedValue(makeCaseData({ status: "published" }));
    (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 900, status: "published", diagnosis: "NILM" },
    ]);
    (NongyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeImage({ show_in_report: false }),
    ]);
    renderPage();

    expect(await screen.findByText("Reported Result")).toBeInTheDocument();
    expect(screen.queryByText("Cytology Images")).not.toBeInTheDocument();
  });

  it("renders the gallery when an image is flagged show_in_report", async () => {
    mockGetById.mockResolvedValue(makeCaseData({ status: "published" }));
    (NongyneDiagnosisService.getByCaseId as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 900, status: "published", diagnosis: "NILM" },
    ]);
    (NongyneCaseImageService.getImages as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeImage({ show_in_report: true }),
    ]);
    renderPage();

    expect(await screen.findByText("Cytology Images")).toBeInTheDocument();
  });
});
