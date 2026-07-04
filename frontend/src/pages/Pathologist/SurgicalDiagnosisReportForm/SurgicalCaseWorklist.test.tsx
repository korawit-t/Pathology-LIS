import { render, screen } from "@testing-library/react";
import SurgicalCaseWorklist, { WorklistRow } from "./SurgicalCaseWorklist";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

const makeRow = (overrides: Partial<WorklistRow> = {}): WorklistRow => ({
  id: 1,
  accession_no: "S26-00001",
  status: "signed out",
  registered_at: "2026-01-01T10:00:00",
  ...overrides,
});

const baseProps = {
  dataSource: [] as WorklistRow[],
  loading: false,
  total: 0,
  pagination: { current: 1, pageSize: 20 },
  setPagination: vi.fn(),
  selectedStatus: "ALL",
  setSelectedStatus: vi.fn(),
  onSearch: vi.fn(),
  onSelectCase: vi.fn(),
  holidays: [] as string[],
};

describe("SurgicalCaseWorklist consult/IHC badges", () => {
  it("shows no consult or IHC badge for a plain case", () => {
    render(
      <SurgicalCaseWorklist {...baseProps} dataSource={[makeRow()]} total={1} />,
    );
    expect(screen.queryByText(/CONSULT:/)).not.toBeInTheDocument();
    expect(screen.queryByText("IHC")).not.toBeInTheDocument();
  });

  it("shows PENDING DISPATCH when flagged but not yet dispatched", () => {
    render(
      <SurgicalCaseWorklist
        {...baseProps}
        dataSource={[makeRow({ is_out_lab_consult: true, consult_status: "pending" })]}
        total={1}
      />,
    );
    expect(screen.getByText("CONSULT: PENDING DISPATCH")).toBeInTheDocument();
  });

  it("shows SENT when dispatched with no PDF yet", () => {
    render(
      <SurgicalCaseWorklist
        {...baseProps}
        dataSource={[makeRow({ is_out_lab_consult: true, consult_status: "processing" })]}
        total={1}
      />,
    );
    expect(screen.getByText("CONSULT: SENT")).toBeInTheDocument();
  });

  it("shows READY TO SIGN when dispatched with a PDF uploaded", () => {
    render(
      <SurgicalCaseWorklist
        {...baseProps}
        dataSource={[
          makeRow({
            is_out_lab_consult: true,
            consult_status: "processing",
            consult_pdf_path: "/uploads/consults/consult.pdf",
          }),
        ]}
        total={1}
      />,
    );
    expect(screen.getByText("CONSULT: READY TO SIGN")).toBeInTheDocument();
  });

  it("shows no consult badge once the round is received (already resolved)", () => {
    render(
      <SurgicalCaseWorklist
        {...baseProps}
        dataSource={[makeRow({ is_out_lab_consult: true, consult_status: "received" })]}
        total={1}
      />,
    );
    expect(screen.queryByText(/CONSULT:/)).not.toBeInTheDocument();
  });

  it("shows an IHC tag when has_ihc is true", () => {
    render(
      <SurgicalCaseWorklist {...baseProps} dataSource={[makeRow({ has_ihc: true })]} total={1} />,
    );
    expect(screen.getByText("IHC")).toBeInTheDocument();
  });
});
