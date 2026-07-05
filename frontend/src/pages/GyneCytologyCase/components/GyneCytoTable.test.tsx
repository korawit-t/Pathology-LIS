import { render, screen, fireEvent } from "@testing-library/react";
import GyneCytoTable from "./GyneCytoTable";
import { GyneCytologyCase } from "../../../types/gyne-cytology";

vi.mock("../../../components/AccessionTag", () => ({
  default: ({ value }: { value: string }) => <span data-testid="accession-tag">{value}</span>,
}));

const makeCase = (overrides: Partial<GyneCytologyCase> = {}): GyneCytologyCase =>
  ({
    id: 1,
    accession_no: "G26-00001",
    patient_id: 1,
    hn: "HN001",
    registered_at: "2026-01-01T10:00:00",
    status: "registered",
    is_postmenopausal: false,
    is_out_lab: false,
    is_out_lab_consult: false,
    specimen_type: "Conventional",
    consult_status: "none",
    ...overrides,
  } as unknown as GyneCytologyCase);

const baseProps = {
  dataSource: [] as GyneCytologyCase[],
  loading: false,
  onEdit: vi.fn(),
  total: 0,
  current: 1,
  pageSize: 20,
  onChangePage: vi.fn(),
  hospitals: [],
  onFilterChange: vi.fn(),
};

describe("GyneCytoTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing with empty data", () => {
    render(<GyneCytoTable {...baseProps} />);
    expect(document.querySelector(".ant-table")).toBeInTheDocument();
  });

  it("renders accession number for each row", () => {
    render(<GyneCytoTable {...baseProps} dataSource={[makeCase()]} total={1} />);
    expect(screen.getByText("G26-00001")).toBeInTheDocument();
  });

  it("shows Post-Menopause tag when is_postmenopausal is true", () => {
    render(
      <GyneCytoTable {...baseProps} dataSource={[makeCase({ is_postmenopausal: true })]} total={1} />,
    );
    expect(screen.getByText("Post-Menopause")).toBeInTheDocument();
  });

  it("does not show Post-Menopause tag when is_postmenopausal is false", () => {
    render(
      <GyneCytoTable {...baseProps} dataSource={[makeCase({ is_postmenopausal: false })]} total={1} />,
    );
    expect(screen.queryByText("Post-Menopause")).not.toBeInTheDocument();
  });

  it("shows External Consult tag when is_out_lab_consult is true", () => {
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={[makeCase({ is_out_lab_consult: true })]}
        total={1}
      />,
    );
    expect(screen.getByText("External Consult")).toBeInTheDocument();
  });

  it("shows Sent Out tag when is_out_lab is true", () => {
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={[makeCase({ is_out_lab: true })]}
        total={1}
      />,
    );
    expect(screen.getByText("Sent Out")).toBeInTheDocument();
  });

  it("shows PDF button only when status is reported and onViewPdf is provided", () => {
    const onViewPdf = vi.fn();
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={[makeCase({ status: "reported" })]}
        total={1}
        onViewPdf={onViewPdf}
      />,
    );
    expect(screen.getByRole("button", { name: /^file-search$/i })).toBeInTheDocument();
  });

  it("does not show PDF button when status is not reported", () => {
    const onViewPdf = vi.fn();
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={[makeCase({ status: "registered" })]}
        total={1}
        onViewPdf={onViewPdf}
      />,
    );
    expect(screen.queryByRole("button", { name: /^file-search$/i })).not.toBeInTheDocument();
  });

  it("calls onEdit when Edit button is clicked", () => {
    const onEdit = vi.fn();
    render(
      <GyneCytoTable {...baseProps} dataSource={[makeCase()]} total={1} onEdit={onEdit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("calls onPrint when Print button is clicked", () => {
    const onPrint = vi.fn();
    render(
      <GyneCytoTable {...baseProps} dataSource={[makeCase()]} total={1} onPrint={onPrint} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^printer$/i }));
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("renders all rows of a server-fetched page beyond page 1 (regression: pageSize must match backend page size)", () => {
    // Simulates the hook's real pagination shape: 20 records per backend page,
    // total 90, viewing page 3. If the Table's pagination.pageSize doesn't
    // match the 20-item page it was given, AntD re-slices this already-paginated
    // array and renders "No data" instead of the rows.
    const page3Cases = Array.from({ length: 20 }, (_, i) =>
      makeCase({ id: i + 41, accession_no: `G26-000${i + 41}`, hn: `HN${i + 41}` }),
    );
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={page3Cases}
        total={90}
        current={3}
        pageSize={20}
      />,
    );
    expect(screen.getAllByTestId("accession-tag")).toHaveLength(20);
  });

  it("shows dash when LMP is null", () => {
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={[makeCase({ last_menstrual_period: null } as any)]}
        total={1}
      />,
    );
    // LMP column renders "-" for null values
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("renders status tag text in uppercase", () => {
    render(
      <GyneCytoTable
        {...baseProps}
        dataSource={[makeCase({ status: "screened" })]}
        total={1}
      />,
    );
    expect(screen.getByText("SCREENED")).toBeInTheDocument();
  });
});
