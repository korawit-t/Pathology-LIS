/**
 * Two things on this page are worth pinning down.
 *
 * The count is the answer someone puts in a report: `total` is the real match
 * count from the server, while the table only holds as many rows as the API
 * cap allows, so the tile must never fall back to `rows.length` and quietly
 * under-report a large query.
 *
 * The export must describe the result it is exported from. It is built
 * server-side (CSV cannot mark HN as a text cell, so Excel eats the leading
 * zeros), which means the endpoint re-runs the query — so it has to be handed
 * the params that produced the rows on screen, not whatever the form says by
 * the time the button is clicked.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App as AntdApp } from "antd";

import DiagnosisSearchPage from "./DiagnosisSearchPage";
import DiagnosisSearchService from "../../services/diagnosisSearchService";
import HospitalService from "../../services/hospitalService";
import type {
  DiagnosisSearchResponse,
  DiagnosisSearchRow,
} from "../../types/diagnosisSearch";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/diagnosisSearchService", () => ({
  default: { search: vi.fn(), downloadXlsx: vi.fn() },
}));
vi.mock("../../services/hospitalService", () => ({
  default: { getHospitals: vi.fn() },
}));

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
  vi.mocked(DiagnosisSearchService.downloadXlsx).mockResolvedValue(
    new Blob(["x"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  // jsdom has no object-URL plumbing; the component revokes what it creates.
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
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

describe("the term inputs", () => {
  // rc-select renders the placeholder while `!searchValue || !triggerOpen`.
  // Forcing open={false} pinned triggerOpen false, so the placeholder sat on
  // top of the term being typed until the first chip existed.
  const placeholders = () =>
    Array.from(document.querySelectorAll("[class*=placeholder]")).filter(
      (el) => getComputedStyle(el as HTMLElement).visibility !== "hidden",
    );

  it("shows the placeholder before anything is typed", () => {
    renderPage();

    expect(placeholders().length).toBeGreaterThan(0);
  });

  it("hides the placeholder as soon as a term is being typed", () => {
    renderPage();
    const before = placeholders().length;

    const inputs = screen.getAllByRole("combobox");
    fireEvent.change(inputs[0], { target: { value: "colon" } });

    expect(placeholders().length).toBe(before - 1);
  });

  it("keeps the placeholder hidden once a chip exists", () => {
    renderPage();
    const before = placeholders().length;

    addTerm(0, "colon");

    expect(placeholders().length).toBe(before - 1);
  });
});

describe("exporting", () => {
  it("stays disabled until there are rows", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /Export Excel/ })).toBeDisabled();
  });

  it("requests the xlsx for the params that produced the rows on screen", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    renderPage();
    await searchFor("colon", "adenocarcinoma");
    await screen.findByText("S26-00001");

    // Change the form *after* the search. The rows on screen are still the old
    // ones, so the file must be the old query — not this edited one.
    fireEvent.click(screen.getByText("คำใดคำหนึ่ง (OR)"));
    fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));

    await waitFor(() =>
      expect(DiagnosisSearchService.downloadXlsx).toHaveBeenCalledWith(
        expect.objectContaining({
          specimen_terms: ["colon"],
          diagnosis_terms: ["adenocarcinoma"],
          match_mode: "all",
        }),
      ),
    );
  });

  it("surfaces a failed export instead of failing silently", async () => {
    vi.mocked(DiagnosisSearchService.search).mockResolvedValue(response());
    vi.mocked(DiagnosisSearchService.downloadXlsx).mockRejectedValue(new Error("boom"));
    renderPage();
    await searchFor("colon");
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));

    expect(await screen.findByText(/สร้างไฟล์ Excel ไม่สำเร็จ/)).toBeInTheDocument();
  });
});
