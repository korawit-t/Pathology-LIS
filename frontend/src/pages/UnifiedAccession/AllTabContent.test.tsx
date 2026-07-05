import { render, screen } from "@testing-library/react";
import AllTabContent from "./AllTabContent";
import { UnifiedRow } from "./types";

vi.mock("../../components/AccessionTag", () => ({
  default: ({ value }: { value: string }) => <span data-testid="accession-tag">{value}</span>,
  CASE_TYPE_COLOR: { surgical: "#000", gyne: "#000", nongyne: "#000" },
}));

const makeRow = (overrides: Partial<UnifiedRow> = {}): UnifiedRow => ({
  _key: `s-${overrides.id ?? 1}`,
  type: "surgical",
  id: 1,
  accession_no: "S26-00001",
  hn: "HN001",
  patient_name: "Test Patient",
  specimen: "Breast",
  status: "registered",
  registered_at: "2026-01-01T10:00:00",
  ...overrides,
});

const baseProps = {
  loading: false,
  searchText: "",
  onSearchChange: vi.fn(),
  onRowClick: vi.fn(),
  onEdit: vi.fn(),
  onPrint: vi.fn(),
  printLoadingKey: null,
  settings: null,
  holidays: [] as string[],
  current: 1,
  pageSize: 20,
  onPageChange: vi.fn(),
};

describe("AllTabContent", () => {
  it("renders all rows of a server-fetched page beyond page 1 (regression: pageSize must match backend page size)", () => {
    // Simulates the aggregated endpoint's real pagination shape: 20 records
    // per backend page, total 90, viewing page 3. If pagination.pageSize
    // doesn't match the 20-item page it was given, AntD re-slices this
    // already-paginated array and renders "No data" instead of the rows.
    const page3Rows = Array.from({ length: 20 }, (_, i) =>
      makeRow({ id: i + 41, accession_no: `S26-000${i + 41}`, hn: `HN${i + 41}` }),
    );
    render(<AllTabContent {...baseProps} rows={page3Rows} total={90} current={3} />);
    expect(screen.getAllByTestId("accession-tag")).toHaveLength(20);
  });

  it("forwards total/current to the underlying Table's pagination footer", () => {
    render(<AllTabContent {...baseProps} rows={[makeRow()]} total={45} current={2} />);
    expect(screen.getByText("Total 45 cases")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // active page item in ant-pagination
  });

  it("renders an empty table without crashing when there are no rows", () => {
    render(<AllTabContent {...baseProps} rows={[]} total={0} current={1} />);
    expect(screen.queryAllByTestId("accession-tag")).toHaveLength(0);
  });
});
