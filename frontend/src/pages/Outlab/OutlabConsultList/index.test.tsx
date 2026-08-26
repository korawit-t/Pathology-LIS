import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import OutLabConsultListPage from "./index";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import type { SurgicalCase } from "../../../types/surgical";
import OutlabConsultRunService from "../../../services/outlabConsultRunService";
import api from "../../../services/httpClient";

vi.mock("../../../services/surgicalCaseService", () => ({
  default: { getCases: vi.fn(), getCaseById: vi.fn() },
}));
vi.mock("../../../services/gyneCytoCaseService", () => ({ default: { getAll: vi.fn() } }));
vi.mock("../../../services/nongyneCytoCaseService", () => ({ default: { getAll: vi.fn() } }));
vi.mock("../../../services/outlabConsultRunService", () => ({
  default: { getRuns: vi.fn(), createRun: vi.fn(), getRegistrationInfo: vi.fn() },
}));
vi.mock("../../../services/httpClient", () => ({ default: { get: vi.fn() } }));
vi.mock("../../../hooks/useAuth", () => ({ useAuth: () => ({ user: { full_name: "Tester" } }) }));

const mockApiGet = vi.mocked(api.get);
const mockGetRuns = vi.mocked(OutlabConsultRunService.getRuns);
const mockGetCases = vi.mocked(SurgicalCaseService.getCases);
const mockGetRegistrationInfo = vi.mocked(OutlabConsultRunService.getRegistrationInfo);

const registrationInfo = {
  case_type: "surgical",
  case_id: 7,
  accession_no: "S26-00012",
  hn: "HN-9001",
  patient_title: "นาย",
  patient_first_name: "สมชาย",
  patient_last_name: "ใจดี",
  patient_full_name: "นาย สมชาย ใจดี",
  cid: "1234567890123",
  clinician_name: "นพ. ผู้ส่งตรวจ",
  collect_at: "2026-08-01T09:30:00",
  clinical_diagnosis: "R/O adenocarcinoma",
  blocks: [],
  slides: [],
  block_count: 0,
  slide_count: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockApiGet.mockResolvedValue({ data: [] });
  mockGetRuns.mockResolvedValue([]);
  mockGetCases.mockResolvedValue({
    items: [
      {
        id: 7,
        accession_no: "S26-00012",
        hn: "HN-9001",
        status: "registered",
        consult_status: "pending",
        patient: { id: 1, title: { title: "นาย" }, name: "สมชาย", ln: "ใจดี" },
      },
    ] as unknown as SurgicalCase[],
    total: 1,
  });
});

describe("OutLabConsultListPage — registration details", () => {
  it("opens the registration details for the case whose accession is clicked", async () => {
    mockGetRegistrationInfo.mockResolvedValue(registrationInfo);

    render(
      <ThemeProvider>
        <OutLabConsultListPage />
      </ThemeProvider>,
    );

    // findByText, not findByRole({name}): resolving accessible names across
    // the whole page costs seconds in jsdom and the click bubbles from the
    // link's own text node to the button either way.
    fireEvent.click(await screen.findByText("S26-00012"));

    await waitFor(() =>
      expect(mockGetRegistrationInfo).toHaveBeenCalledWith("surgical", 7),
    );
    expect(await screen.findByText("1234567890123")).toBeInTheDocument();
    expect(screen.getByText("นพ. ผู้ส่งตรวจ")).toBeInTheDocument();
    expect(screen.getByText("01/08/2026 09:30")).toBeInTheDocument();
  });

  it("does not fetch registration details until a case is clicked", async () => {
    render(
      <ThemeProvider>
        <OutLabConsultListPage />
      </ThemeProvider>,
    );

    await screen.findByText("S26-00012");
    expect(mockGetRegistrationInfo).not.toHaveBeenCalled();
  });
});
