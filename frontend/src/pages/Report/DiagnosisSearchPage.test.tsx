/**
 * Two things on this page are worth pinning down.
 *
 * The count is the answer someone puts in a report: `total` is the real match
 * count from the server, while the table only holds as many rows as the API
 * cap allows, so the tile must never fall back to `rows.length` and quietly
 * under-report a large query.
 *
 * The export must describe the result it actually contains. The criteria block
 * written above the rows comes from the response, not from the form — editing
 * the form after a search must not relabel a file built from the old result.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App as AntdApp } from "antd";

import DiagnosisSearchPage from "./DiagnosisSearchPage";
import DiagnosisSearchService from "../../services/diagnosisSearchService";
import HospitalService from "../../services/hospitalService";
import { exportToCsv } from "../../utils/exportCsv";
import type {
  DiagnosisSearchResponse,
  DiagnosisSearchRow,
} from "../../types/diagnosisSearch";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/diagnosisSearchService", () => ({
  default: { search: vi.fn() },
}));
vi.mock("../../services/hospitalService", () => ({
  default: { getHospitals: vi.fn() },
}));
vi.mock("../../utils/exportCsv", () => ({ exportToCsv: vi.fn() }));

const row = (over: Partial<DiagnosisSearchRow> = {}): DiagnosisSearchRow => ({
  case_id: 1,
  accession_no: "S26-00001",
  hn: "123456",
  patient_name: "นาย สมชาย ใจดี",
  gender: "M",
  hospital_name: "Test Hospital",
  registered_at: "2026-03-01T09:00:00",
  report_at: "2026-03-04T09:00:00",
  status: "reported",
  is_reported: true,
  has_malignancy: true,
  pathologist_name: "Dr Test",
  matched_specimens: ["A: Colon, biopsy"],
  matched_diagnoses: ["Adenocarcinoma, moderately differentiated"],
  ...over,
});

const response = (over: Partial<DiagnosisSearchResponse> = {}): DiagnosisSearchResponse => ({
  total: 1,
  malignant_count: 1,
  items: [row()],
  criteria: {
    specimen_terms: ["colon", "biopsy"],
    diagnosis_terms: ["adenocarcinoma"],
    match_mode: "all",
    include_gross: false,
    include_microscopic: false,
    date_field: "registered",
    date_from: "2026-01-01",
    date_to: "2026-03-31",
    hospital_id: undefined,
    hospital_name: null,
    only_reported: true,
  },
  ...over,
});

const renderPage = () =>
  render(
    <AntdApp>
      <DiagnosisSearchPage />
    </AntdApp>,
  );

/** antd tags-mode Select: type into its combobox and commit with Enter. */
const addTerm = (index: number, value: string) => {
  const inputs = screen.getAllByRole("combobox");
  fireEvent.change(inputs[index], { target: { value } });
  fireEvent.keyDown(inputs[index], { key: "Enter", code: "Enter", keyCode: 13 });
  fireEvent.keyUp(inputs[index], { key: "Enter", code: "Enter", keyCode: 13 });
};

const searchFor = async (specimen: string, diagnosis?: string) => {
  addTerm(0, specimen);
  if (diagnosis) addTerm(1, diagnosis);
  fireEvent.click(screen.getByRole("button", { name: /ค้นหา/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(HospitalService.getHospitals).mockResolvedValue([]);
});

describe("searching", () => {
  it("sends the typed terms to the API", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    renderPage();

    await searchFor("colon", "adenocarcinoma");

    await waitFor(() =>
      expect(DiagnosisSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          specimen_terms: ["colon"],
          diagnosis_terms: ["adenocarcinoma"],
          match_mode: "all",
          only_reported: true,
        }),
      ),
    );
  });

  it("splits a comma-separated paste into separate terms", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    renderPage();

    // One keystroke run, not two Enters: tokenSeparators has to do the split,
    // otherwise "colon, biopsy" goes to the API as a single literal phrase and
    // matches nothing a registrar actually typed.
    const inputs = screen.getAllByRole("combobox");
    fireEvent.change(inputs[0], { target: { value: "colon,biopsy," } });
    fireEvent.click(screen.getByRole("button", { name: /ค้นหา/ }));

    await waitFor(() =>
      expect(DiagnosisSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ specimen_terms: ["colon", "biopsy"] }),
      ),
    );
  });

  it("keeps a multi-word term intact", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    renderPage();

    // Space must NOT separate: "lymph node" is one specimen, not two terms.
    await searchFor("lymph node");

    await waitFor(() =>
      expect(DiagnosisSearchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ specimen_terms: ["lymph node"] }),
      ),
    );
  });

  it("will not search with no terms", async () => {
    renderPage();

    const button = screen.getByRole("button", { name: /ค้นหา/ });
    fireEvent.click(button);

    expect(DiagnosisSearchService.search).not.toHaveBeenCalled();
  });

  it("reports the server's total, not the number of rows it got back", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(
      response({ total: 2500, malignant_count: 1800, items: [row()] }),
    );
    renderPage();

    await searchFor("colon");

    expect(await screen.findByText("2,500")).toBeInTheDocument();
    expect(screen.getByText("1,800")).toBeInTheDocument();
    // …and says so, rather than letting a truncated list read as the whole set.
    expect(screen.getByText(/จากทั้งหมด 2500 เคส/)).toBeInTheDocument();
  });

  it("does not warn about truncation when every match is listed", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    renderPage();

    await searchFor("colon");

    expect(await screen.findByText("S26-00001")).toBeInTheDocument();
    expect(screen.queryByText(/จากทั้งหมด/)).not.toBeInTheDocument();
  });
});

describe("exporting", () => {
  it("stays disabled until there are rows", async () => {
    renderPage();

    expect(screen.getByRole("button", { name: /Export Excel \/ CSV/ })).toBeDisabled();
  });

  it("writes the matched specimen and diagnosis into flattened cells", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(
      response({
        items: [
          row({
            matched_specimens: ["A: Colon, biopsy", "B: Rectum, biopsy"],
            matched_diagnoses: ["Adenocarcinoma", "Invasive to submucosa"],
          }),
        ],
      }),
    );
    renderPage();
    await searchFor("colon");
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByRole("button", { name: /Export Excel \/ CSV/ }));

    const [, rows] = vi.mocked(exportToCsv).mock.calls[0];
    expect(rows[0]).toMatchObject({
      no: 1,
      accession_no: "S26-00001",
      matched_specimens: "A: Colon, biopsy; B: Rectum, biopsy",
      matched_diagnoses: "Adenocarcinoma | Invasive to submucosa",
      has_malignancy: "Yes",
    });
  });

  it("labels the file with the criteria the rows came from, not the edited form", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    renderPage();
    await searchFor("colon", "adenocarcinoma");
    await screen.findByText("S26-00001");

    // Change the form *after* the search; the rows on screen are still the old ones.
    fireEvent.click(screen.getByText("คำใดคำหนึ่ง (OR)"));
    fireEvent.click(screen.getByRole("button", { name: /Export Excel \/ CSV/ }));

    const [, , , options] = vi.mocked(exportToCsv).mock.calls[0];
    const preamble = (options?.preamble ?? []).map((cells) => cells.join(" | "));
    expect(preamble.join("\n")).toContain("colon และ biopsy");
    expect(preamble.join("\n")).toContain("ครบทุกคำ (AND)");
  });

  it("flags a truncated export inside the file", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(
      response({ total: 2500, items: [row()] }),
    );
    renderPage();
    await searchFor("colon");
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByRole("button", { name: /Export Excel \/ CSV/ }));

    const [, , , options] = vi.mocked(exportToCsv).mock.calls[0];
    const preamble = (options?.preamble ?? []).map((cells) => cells.join(" | ")).join("\n");
    expect(preamble).toContain("1 เคสแรกจากทั้งหมด 2500 เคส");
  });
});
