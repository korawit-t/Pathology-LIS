import { render, screen } from "@testing-library/react";
import MolecularCaseTable from "./MolecularCaseTable";
import type { MolecularCaseResponse } from "../../services/molecularCaseService";

vi.mock("../../components/AccessionTag", () => ({
  default: ({ value }: { value: string }) => <span>{value}</span>,
}));

const makeCase = (overrides: Partial<MolecularCaseResponse> = {}): MolecularCaseResponse => ({
  id: 1,
  accession_no: "M26-00001",
  ap_test_id: 1,
  test_name: "EGFR Mutation Analysis",
  status: "pending",
  display_status: "pending",
  is_outlab: true,
  registrar_id: 1,
  registered_at: "2026-11-01T09:00:00",
  is_print: false,
  is_cancelled: false,
  ...overrides,
} as MolecularCaseResponse);

describe("MolecularCaseTable status column", () => {
  it("shows PDF Received for an out-lab case whose PDF is in but not finalized", () => {
    render(
      <MolecularCaseTable
        dataSource={[makeCase({ display_status: "pdf_received", outlab_pdf_path: "uploads/molecular/x.pdf" })]}
        onSelectCase={vi.fn()}
      />,
    );
    expect(screen.getByText("PDF Received")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("renders from display_status, not the raw status column", () => {
    // status stays "pending" until Finalize; only display_status splits the
    // PDF-received cases out and folds cancellation in.
    render(
      <MolecularCaseTable
        dataSource={[
          makeCase({ id: 1, accession_no: "M26-00001", display_status: "pending" }),
          makeCase({ id: 2, accession_no: "M26-00002", status: "reported", display_status: "reported" }),
          makeCase({ id: 3, accession_no: "M26-00003", is_cancelled: true, display_status: "cancelled" }),
        ]}
        onSelectCase={vi.fn()}
      />,
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Reported")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});
