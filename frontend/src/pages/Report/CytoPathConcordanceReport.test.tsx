/**
 * The QC report has one job that is easy to get quietly wrong: it must never
 * flatter a screener. A concordance rate is a number someone's competence gets
 * judged by, so anything the backend could not grade has to read as ungraded,
 * not as agreement — on the tiles, in the per-person table, and in the export.
 *
 * The second thing worth pinning is the wording hint. For non-gyne the
 * diagnosis is free text, so "the pathologist retyped it" is all a machine can
 * honestly say; it must not be presented as a verdict.
 */

import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { App as AntdApp } from "antd";

import CytoPathConcordanceReport from "./CytoPathConcordanceReport";
import CytoPathCorrelationService from "../../services/cytoPathCorrelationService";
import UserService from "../../services/userService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

let mockRoles: string[] = ["senior_pathologist"];
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, full_name: "Dr Test", roles: mockRoles } }),
}));

vi.mock("../../services/cytoPathCorrelationService", () => ({
  default: { getAll: vi.fn(), getSummary: vi.fn(), setVerdict: vi.fn() },
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn() },
}));

// recharts needs a real layout box; jsdom reports 0x0 and renders nothing.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const bucket = (over: Partial<Record<string, number | null>> = {}) => ({
  total: 0,
  concordant: 0,
  minor_discrepancy: 0,
  major_discrepancy: 0,
  not_applicable: 0,
  pending: 0,
  graded: 0,
  concordance_rate: null,
  major_rate: null,
  discrepancy_rate: null,
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 10,
  case_type: "nongyne",
  gyne_case_id: null,
  nongyne_case_id: 5,
  case_id: 5,
  accession_no: "N26-00042",
  cytotechnologist: { id: 7, full_name: "Somsri Jaidee" },
  screening_diagnosis: "<p>Negative for malignancy.</p>",
  screening_summary: "Negative for malignancy.",
  screening_flags: null,
  screened_at: "2026-08-01T09:00:00",
  pathologist: { id: 1, full_name: "Dr Test" },
  final_diagnosis: "<p>Adenocarcinoma.</p>",
  final_summary: "Adenocarcinoma.",
  final_flags: null,
  signed_out_at: "2026-08-02T09:00:00",
  version_no: 1,
  auto_result: "changed",
  result: null,
  status: "pending_review",
  discrepancy_category: null,
  comment: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-08-01T09:00:00",
  updated_at: null,
  ...over,
});

const getSummary = () => CytoPathCorrelationService.getSummary as ReturnType<typeof vi.fn>;
const getAll = () => CytoPathCorrelationService.getAll as ReturnType<typeof vi.fn>;
const setVerdict = () => CytoPathCorrelationService.setVerdict as ReturnType<typeof vi.fn>;

const renderPage = () =>
  render(
    <AntdApp>
      <CytoPathConcordanceReport />
    </AntdApp>,
  );

/** antd keeps both tab panes mounted once visited, and several labels repeat
 *  across them (a tile title is also a table column heading), so every query
 *  below is scoped to one region rather than the whole document. */
const panel = (key: "overview" | "worklist") =>
  within(document.querySelector<HTMLElement>(`[id$="-panel-${key}"]`)!);

/** One summary tile, found by its title — "Concordance" is also a column. */
const tile = (title: string) => {
  const el = Array.from(document.querySelectorAll<HTMLElement>(".ant-statistic")).find(
    (n) => n.querySelector(".ant-statistic-title")?.textContent === title,
  );
  if (!el) throw new Error(`no summary tile titled "${title}"`);
  return within(el);
};

const caseRow = () => within(screen.getByText("N26-00042").closest("tr")!);

const openWorklist = async () => {
  fireEvent.click(within(screen.getByRole("tablist")).getByText(/รายการเคส/));
  await waitFor(() => expect(screen.getByText("N26-00042")).toBeInTheDocument());
};

const openDrawer = async () => {
  fireEvent.click(caseRow().getByRole("button"));
  return within(await screen.findByRole("dialog"));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRoles = ["senior_pathologist"];
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 7, full_name: "Somsri Jaidee", roles: ["cytotechnologist"] },
  ]);
  getSummary().mockResolvedValue({
    overall: bucket({ total: 3, pending: 3 }),
    by_cytotechnologist: [],
    monthly: [],
  });
  getAll().mockResolvedValue({ items: [row()], total: 1 });
});

describe("ungraded cases are never counted as agreement", () => {
  it("shows a dash, not 100%, when nothing has been graded yet", async () => {
    renderPage();

    await waitFor(() => expect(getSummary()).toHaveBeenCalled());

    expect(tile("Concordance").getByText("—")).toBeInTheDocument();
    expect(tile("Concordance").queryByText(/100/)).not.toBeInTheDocument();
  });

  it("explains why the rate is blank instead of leaving it unexplained", async () => {
    renderPage();

    expect(await screen.findByText("ยังไม่มีเคสไหนถูกตัดสิน")).toBeInTheDocument();
  });

  it("counts pending cases separately from the graded ones", async () => {
    getSummary().mockResolvedValue({
      overall: bucket({ total: 3, graded: 2, concordant: 1, major_discrepancy: 1, pending: 1, concordance_rate: 50, major_rate: 50 }),
      by_cytotechnologist: [],
      monthly: [],
    });
    renderPage();

    await waitFor(() => expect(getSummary()).toHaveBeenCalled());

    expect(tile("รอตัดสิน").getByText("1")).toBeInTheDocument();
    expect(tile("Concordance").getByText("50%")).toBeInTheDocument();
  });
});

describe("the wording hint is not a verdict", () => {
  it("labels a rewritten diagnosis as a text change, not a discrepancy", async () => {
    renderPage();
    await openWorklist();

    expect(caseRow().getByText("ข้อความเปลี่ยน")).toBeInTheDocument();
    // The verdict column on the same row still reads as ungraded.
    expect(caseRow().getByText("รอตัดสิน")).toBeInTheDocument();
  });
});

describe("grading a case", () => {
  it("sends the verdict and refreshes both the list and the summary", async () => {
    setVerdict().mockResolvedValue(row({ result: "major_discrepancy", status: "reviewed" }));
    renderPage();
    await openWorklist();
    const summaryCallsBefore = getSummary().mock.calls.length;

    const drawer = await openDrawer();
    fireEvent.click(drawer.getByText("ต่างอย่างมีนัยสำคัญ"));
    fireEvent.click(drawer.getByRole("button", { name: "บันทึกผลการตัดสิน" }));

    await waitFor(() =>
      expect(setVerdict()).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ result: "major_discrepancy" }),
      ),
    );
    await waitFor(() =>
      expect(getSummary().mock.calls.length).toBeGreaterThan(summaryCallsBefore),
    );
  });

  it("shows both diagnoses side by side so the grader can see what moved", async () => {
    renderPage();
    await openWorklist();

    const drawer = await openDrawer();

    expect(drawer.getByText("Negative for malignancy.")).toBeInTheDocument();
    expect(drawer.getByText("Adenocarcinoma.")).toBeInTheDocument();
  });

  it("gives a cytotechnologist a read-only drawer", async () => {
    mockRoles = ["cytotechnologist"];
    renderPage();
    await openWorklist();

    const drawer = await openDrawer();

    expect(drawer.getByText("ผล cytotechnologist (ตอนส่งเคส)")).toBeInTheDocument();
    expect(
      drawer.queryByRole("button", { name: "บันทึกผลการตัดสิน" }),
    ).not.toBeInTheDocument();
  });

  it("warns that a case with no screening side is outside the statistics", async () => {
    getAll().mockResolvedValue({
      items: [row({ status: "no_screening_data", screening_diagnosis: null, screening_summary: null, auto_result: null })],
      total: 1,
    });
    renderPage();
    await openWorklist();

    const drawer = await openDrawer();

    expect(drawer.getByText("เคสนี้ไม่มีผลฝั่ง cytotech")).toBeInTheDocument();
  });
});

describe("filters", () => {
  it("asks the backend for pending cases first, since that is the actual worklist", async () => {
    renderPage();
    await openWorklist();

    expect(getAll()).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_review" }),
    );
  });

  it("switches the query to a severity when the grader picks one", async () => {
    renderPage();
    await openWorklist();

    fireEvent.click(
      within(
        panel("worklist").getByRole("radiogroup"),
      ).getByText("ต่างอย่างมีนัยสำคัญ"),
    );

    await waitFor(() =>
      expect(getAll()).toHaveBeenCalledWith(
        expect.objectContaining({ result: "major_discrepancy", skip: 0 }),
      ),
    );
  });
});
