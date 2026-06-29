import { render, screen, fireEvent } from "@testing-library/react";
import SurgicalTable from "./index";
import { SurgicalCase } from "../../../../types/surgical";

vi.mock("../../../../components/AccessionTag", () => ({
  default: ({ value }: { value: string }) => <span data-testid="accession-tag">{value}</span>,
}));
vi.mock("../../../../components/SurgicalWorkflowProgress", () => ({
  SurgicalWorkflowProgress: () => <span data-testid="workflow" />,
}));
vi.mock("../../../../constants/lab.constants", () => ({
  STATUS_OPTIONS: [
    { value: "registered", label: "Registered", color: "blue" },
    { value: "published", label: "Published", color: "purple" },
  ],
}));

const makeCase = (overrides: Partial<SurgicalCase> = {}): SurgicalCase =>
  ({
    id: 1,
    accession_no: "S26-00001",
    patient_id: 1,
    registered_at: "2026-01-01T10:00:00",
    is_express: false,
    status: "registered",
    registrar_id: 1,
    is_extended_fix: false,
    is_grossed: false,
    is_processed: false,
    is_slide_prepped: false,
    is_reported: false,
    is_out_lab_consult: false,
    consult_status: "none",
    has_critical: false,
    is_pending: false,
    is_cancelled: false,
    ...overrides,
  } as unknown as SurgicalCase);

const baseProps = {
  dataSource: [] as SurgicalCase[],
  loading: false,
  departments: [],
  onEdit: vi.fn(),
  total: 0,
  current: 1,
  onChangePage: vi.fn(),
  hospitals: [],
  schemes: [],
  onFilterChange: vi.fn(),
};

describe("SurgicalTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing with empty data", () => {
    render(<SurgicalTable {...baseProps} />);
    expect(screen.getByText("No cases found")).toBeInTheDocument();
  });

  it("renders accession number for each row", () => {
    render(<SurgicalTable {...baseProps} dataSource={[makeCase()]} total={1} />);
    expect(screen.getByText("S26-00001")).toBeInTheDocument();
  });

  it("shows URG tag when is_express is true", () => {
    render(
      <SurgicalTable {...baseProps} dataSource={[makeCase({ is_express: true })]} total={1} />,
    );
    expect(screen.getByText("URG")).toBeInTheDocument();
  });

  it("does not show URG tag when is_express is false", () => {
    render(
      <SurgicalTable {...baseProps} dataSource={[makeCase({ is_express: false })]} total={1} />,
    );
    expect(screen.queryByText("URG")).not.toBeInTheDocument();
  });

  it("shows PDF button only when status is published and onViewPdf is provided", () => {
    const onViewPdf = vi.fn();
    render(
      <SurgicalTable
        {...baseProps}
        dataSource={[makeCase({ status: "published" })]}
        total={1}
        onViewPdf={onViewPdf}
      />,
    );
    // Icon-only buttons use the icon's aria-label as accessible name
    expect(screen.getByRole("button", { name: /^file-search$/i })).toBeInTheDocument();
  });

  it("does not show PDF button when status is not published", () => {
    const onViewPdf = vi.fn();
    render(
      <SurgicalTable
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
    const record = makeCase();
    render(<SurgicalTable {...baseProps} dataSource={[record]} total={1} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("calls onPrint when Print button is clicked", () => {
    const onPrint = vi.fn();
    const record = makeCase();
    render(
      <SurgicalTable {...baseProps} dataSource={[record]} total={1} onPrint={onPrint} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^printer$/i }));
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("does not render Print button when onPrint is not provided", () => {
    render(<SurgicalTable {...baseProps} dataSource={[makeCase()]} total={1} />);
    expect(screen.queryByRole("button", { name: /^printer$/i })).not.toBeInTheDocument();
  });

  it("applies row-express class to express cases", () => {
    const { container } = render(
      <SurgicalTable {...baseProps} dataSource={[makeCase({ is_express: true })]} total={1} />,
    );
    expect(container.querySelector("tr.row-express")).toBeInTheDocument();
  });

  it("does not apply row-express class to normal cases", () => {
    const { container } = render(
      <SurgicalTable {...baseProps} dataSource={[makeCase({ is_express: false })]} total={1} />,
    );
    expect(container.querySelector("tr.row-express")).not.toBeInTheDocument();
  });
});
