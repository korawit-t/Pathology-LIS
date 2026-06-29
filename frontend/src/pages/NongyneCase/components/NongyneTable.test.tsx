import { render, screen, fireEvent } from "@testing-library/react";
import NongyneTable from "./NongyneTable";
import { NongyneCytologyCase } from "../../../types/nongyne";

vi.mock("../../../components/AccessionTag", () => ({
  default: ({ value }: { value: string }) => <span data-testid="accession-tag">{value}</span>,
}));
vi.mock("../../../constants/lab.constants", () => ({
  STATUS_OPTIONS: [
    { value: "registered", label: "Registered" },
    { value: "published", label: "Published" },
  ],
}));

const makeCase = (overrides: Partial<NongyneCytologyCase> = {}): NongyneCytologyCase =>
  ({
    id: 1,
    accession_no: "N26-00001",
    patient_id: 1,
    hn: "HN001",
    registered_at: "2026-01-01T10:00:00",
    status: "registered",
    screened_at: null,
    reported_at: null,
    specimen_type: "Sputum",
    collection_site: "Lung",
    ...overrides,
  } as unknown as NongyneCytologyCase);

const baseProps = {
  dataSource: [] as NongyneCytologyCase[],
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

describe("NongyneTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing with empty data", () => {
    render(<NongyneTable {...baseProps} />);
    expect(document.querySelector(".ant-table")).toBeInTheDocument();
  });

  it("renders accession number for each row", () => {
    render(<NongyneTable {...baseProps} dataSource={[makeCase()]} total={1} />);
    expect(screen.getByText("N26-00001")).toBeInTheDocument();
  });

  describe("renderStatus", () => {
    const renderWithStatus = (status: string) =>
      render(<NongyneTable {...baseProps} dataSource={[makeCase({ status })]} total={1} />);

    it("renders Registered for registered status", () => {
      renderWithStatus("registered");
      expect(screen.getByText("Registered")).toBeInTheDocument();
    });

    it("renders Screening for screened status", () => {
      renderWithStatus("screened");
      expect(screen.getByText("Screening")).toBeInTheDocument();
    });

    it("renders Screening for screening status", () => {
      renderWithStatus("screening");
      expect(screen.getByText("Screening")).toBeInTheDocument();
    });

    it("renders Stained for stained status", () => {
      renderWithStatus("stained");
      expect(screen.getByText("Stained")).toBeInTheDocument();
    });

    it("renders Revised for revised status", () => {
      renderWithStatus("revised");
      expect(screen.getByText("Revised")).toBeInTheDocument();
    });

    it("renders Pending Approval for pending_approval status", () => {
      renderWithStatus("pending_approval");
      expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    });

    it("renders Completed for reported status", () => {
      renderWithStatus("reported");
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("renders Published for published status", () => {
      renderWithStatus("published");
      expect(screen.getByText("Published")).toBeInTheDocument();
    });

    it("renders Cancelled for cancelled status", () => {
      renderWithStatus("cancelled");
      expect(screen.getByText("Cancelled")).toBeInTheDocument();
    });

    it("handles uppercase status via normalization", () => {
      renderWithStatus("REGISTERED");
      expect(screen.getByText("Registered")).toBeInTheDocument();
    });
  });

  describe("Workflow tags", () => {
    it("Screened tag is blue when screened_at has a value", () => {
      const { container } = render(
        <NongyneTable
          {...baseProps}
          dataSource={[makeCase({ screened_at: "2026-01-02T10:00:00" })]}
          total={1}
        />,
      );
      const tag = Array.from(container.querySelectorAll(".ant-tag")).find(
        (el) => el.textContent === "Screened",
      );
      expect(tag?.className).toContain("ant-tag-blue");
    });

    it("Screened tag is default when screened_at is null", () => {
      const { container } = render(
        <NongyneTable {...baseProps} dataSource={[makeCase({ screened_at: null })]} total={1} />,
      );
      const tag = Array.from(container.querySelectorAll(".ant-tag")).find(
        (el) => el.textContent === "Screened",
      );
      expect(tag?.className).not.toContain("ant-tag-blue");
    });

    it("Reported tag is green when reported_at has a value", () => {
      const { container } = render(
        <NongyneTable
          {...baseProps}
          dataSource={[makeCase({ reported_at: "2026-01-03T10:00:00" })]}
          total={1}
        />,
      );
      const tag = Array.from(container.querySelectorAll(".ant-tag")).find(
        (el) => el.textContent === "Reported",
      );
      expect(tag?.className).toContain("ant-tag-green");
    });
  });

  it("shows PDF button only when status is published and onViewPdf is provided", () => {
    const onViewPdf = vi.fn();
    render(
      <NongyneTable
        {...baseProps}
        dataSource={[makeCase({ status: "published" })]}
        total={1}
        onViewPdf={onViewPdf}
      />,
    );
    expect(screen.getByRole("button", { name: /^file-search$/i })).toBeInTheDocument();
  });

  it("does not show PDF button when status is not published", () => {
    const onViewPdf = vi.fn();
    render(
      <NongyneTable
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
      <NongyneTable {...baseProps} dataSource={[makeCase()]} total={1} onEdit={onEdit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("shows dash when specimen_type is empty", () => {
    render(
      <NongyneTable
        {...baseProps}
        dataSource={[makeCase({ specimen_type: "" })]}
        total={1}
      />,
    );
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });
});
