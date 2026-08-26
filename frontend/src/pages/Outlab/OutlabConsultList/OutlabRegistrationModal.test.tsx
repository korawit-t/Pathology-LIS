import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import OutlabRegistrationModal from "./OutlabRegistrationModal";
import OutlabConsultRunService from "../../../services/outlabConsultRunService";

vi.mock("../../../services/outlabConsultRunService", () => ({
  default: { getRegistrationInfo: vi.fn() },
}));

const mockGetRegistrationInfo = vi.mocked(OutlabConsultRunService.getRegistrationInfo);
const writeText = vi.fn();

const surgicalInfo = (overrides = {}) => ({
  case_type: "surgical",
  case_id: 7,
  accession_no: "S26-00012",
  hn: "HN-9001",
  patient_title: "นาย",
  patient_first_name: "สมชาย",
  patient_last_name: "ใจดี",
  patient_full_name: "นาย สมชาย ใจดี",
  cid: "1234567890123",
  gender: "M",
  birth_date: "1980-05-01",
  age_display: "46 Y",
  clinician_name: "นพ. ผู้ส่งตรวจ",
  collect_at: "2026-08-01T09:30:00",
  clinical_diagnosis: "R/O adenocarcinoma",
  clinical_history: null,
  specimen_type: null,
  collection_site: null,
  hospital_name: "Test Hospital",
  department_name: "Surgery",
  consult_reason: "Second opinion",
  blocks: [
    {
      id: 1,
      block_code: "A1",
      specimen_label: "A",
      specimen_name: "Colon",
      tissue_count: 2,
      status: "consult",
      slides: [
        { id: 11, slide_label: "A1", slide_no: 1, test_name: "H&E", test_category: "Routine", status: "stained", is_recut: false },
        { id: 12, slide_label: "A1", slide_no: 2, test_name: "PAS", test_category: "Special Stain", status: "pending", is_recut: false },
      ],
    },
  ],
  slides: [],
  block_count: 1,
  slide_count: 2,
  ...overrides,
});

const gyneInfo = () => ({
  ...surgicalInfo(),
  case_type: "gyne",
  accession_no: "C26-00003",
  specimen_type: "Conventional",
  collection_site: "Cervical/Endocervical",
  clinical_history: "Routine screening",
  blocks: [],
  block_count: 0,
  slides: [
    { id: 21, slide_label: "C26-00003", slide_no: 1, test_name: "Pap stain", test_category: "Cytology", status: "stained", is_recut: false },
  ],
  slide_count: 1,
});

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

describe("OutlabRegistrationModal", () => {
  it("shows the patient, request and block/slide details of a surgical case", async () => {
    mockGetRegistrationInfo.mockResolvedValue(surgicalInfo());

    render(<OutlabRegistrationModal open caseType="surgical" caseId={7} accessionNo="S26-00012" onClose={vi.fn()} />);

    await screen.findByText("นาย");
    expect(mockGetRegistrationInfo).toHaveBeenCalledWith("surgical", 7);

    // Patient parts are shown separately — the destination lab's form has one
    // field per part.
    expect(screen.getByText("สมชาย")).toBeInTheDocument();
    expect(screen.getByText("ใจดี")).toBeInTheDocument();
    expect(screen.getByText("1234567890123")).toBeInTheDocument();
    expect(screen.getByText("HN-9001")).toBeInTheDocument();

    expect(screen.getByText("นพ. ผู้ส่งตรวจ")).toBeInTheDocument();
    expect(screen.getByText("01/08/2026 09:30")).toBeInTheDocument();
    expect(screen.getByText("R/O adenocarcinoma")).toBeInTheDocument();

    const table = document.querySelector(".ant-table") as HTMLElement;
    expect(within(table).getByText("A1")).toBeInTheDocument();
    expect(within(table).getByText("A. Colon")).toBeInTheDocument();
    expect(within(table).getByText("H&E")).toBeInTheDocument();
    expect(within(table).getByText("PAS")).toBeInTheDocument();
  });

  it("copies a single field when its copy button is clicked", async () => {
    mockGetRegistrationInfo.mockResolvedValue(surgicalInfo());

    render(<OutlabRegistrationModal open caseType="surgical" caseId={7} onClose={vi.fn()} />);
    await screen.findByText("1234567890123");

    // getByLabelText, not getByRole({name}): computing accessible names for
    // every button in the open modal takes seconds here (jsdom re-resolving
    // pseudo-element styles per button) and blew the CI test timeout.
    fireEvent.click(screen.getByLabelText("Copy 1234567890123"));

    expect(writeText).toHaveBeenCalledWith("1234567890123");
  });

  it("copies every field as labelled lines via Copy All", async () => {
    mockGetRegistrationInfo.mockResolvedValue(surgicalInfo());

    render(<OutlabRegistrationModal open caseType="surgical" caseId={7} onClose={vi.fn()} />);
    await screen.findByText("สมชาย");

    fireEvent.click(screen.getByRole("button", { name: /Copy All/ }));

    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("Accession No.: S26-00012");
    expect(copied).toContain("คำนำหน้า / Title: นาย");
    expect(copied).toContain("ชื่อ / First name: สมชาย");
    expect(copied).toContain("นามสกุล / Last name: ใจดี");
    expect(copied).toContain("CID: 1234567890123");
    expect(copied).toContain("แพทย์ผู้ส่งตรวจ / Referring doctor: นพ. ผู้ส่งตรวจ");
    expect(copied).toContain("วันที่เก็บสิ่งส่งตรวจ / Collected at: 01/08/2026 09:30");
    expect(copied).toContain("Clinical diagnosis: R/O adenocarcinoma");
    expect(copied).toContain("Blocks (1): A1 (Colon)");
    expect(copied).toContain("Slides (2): A1 H&E; A1 PAS");
    // Empty fields are dropped rather than pasted as blanks.
    expect(copied).not.toContain("Clinical history");
  });

  it("lists case-level slides for a cytology case, with no block table", async () => {
    mockGetRegistrationInfo.mockResolvedValue(gyneInfo());

    render(<OutlabRegistrationModal open caseType="gyne" caseId={9} onClose={vi.fn()} />);
    await screen.findByText("Pap stain");

    expect(screen.getByText(/Slides \/ สไลด์ \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Blocks & Slides/)).not.toBeInTheDocument();
    expect(screen.getByText("Conventional")).toBeInTheDocument();
    expect(screen.getByText("Routine screening")).toBeInTheDocument();
  });

  it("does not fetch until it is opened", () => {
    render(<OutlabRegistrationModal open={false} caseType="surgical" caseId={7} onClose={vi.fn()} />);
    expect(mockGetRegistrationInfo).not.toHaveBeenCalled();
  });
});
