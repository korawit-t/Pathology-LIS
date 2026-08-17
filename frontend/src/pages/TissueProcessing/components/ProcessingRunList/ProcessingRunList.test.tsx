/**
 * The run detail modal used to carry a separate "Tissue Count" column holding
 * the case total. It now prints each cassette's own count beside its block
 * label instead — A1(1), A2(2), B1(TNTC) — so a tech reading the modal can see
 * which cassette the pieces are in, not just how many the case has.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App as AntdApp } from "antd";
import ProcessingRunList from "./index";
import TissueProcessingService from "../../../../services/tissueProcessingService";

vi.mock("../../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../../../services/tissueProcessingService", () => ({
  default: { getRuns: vi.fn(), getRunById: vi.fn() },
}));
vi.mock("../TissueProcessingOutModal/TissueProcessingOutModal", () => ({
  default: () => <div data-testid="mock-out-modal" />,
}));
vi.mock("./EditProcessingRunModal", () => ({
  default: () => <div data-testid="mock-edit-modal" />,
}));

const makeItem = (id: number, specimenLabel: string, blockNo: number, block: object) => ({
  id,
  status: "completed",
  block: {
    accession_no: "S26-00001",
    specimen_label: specimenLabel,
    block_no: blockNo,
    ...block,
  },
});

const openRunDetail = async () => {
  render(
    <AntdApp>
      <ProcessingRunList />
    </AntdApp>,
  );
  await waitFor(() => expect(screen.getByText("R-1")).toBeInTheDocument());
  fireEvent.click(screen.getByText("R-1"));
  await waitFor(() => expect(screen.getByText(/Blocks in this Case/)).toBeInTheDocument());
};

beforeEach(() => {
  vi.clearAllMocks();
  (TissueProcessingService.getRuns as ReturnType<typeof vi.fn>).mockResolvedValue([
    {
      id: 1,
      run_number: "R-1",
      status: "completed",
      start_at: "2026-08-17T09:00:00",
      completed_at: "2026-08-17T12:00:00",
      block_in_total: 5,
      block_out_total: 5,
      items: [
        makeItem(1, "A", 1, { tissue_count: 1 }),
        makeItem(2, "A", 2, { tissue_count: 2 }),
        makeItem(3, "A", 3, { tissue_count: 0 }),
        makeItem(4, "B", 1, { is_tissue_uncountable: true, tissue_count: null }),
        makeItem(5, "B", 2, { tissue_count: null }),
      ],
    },
  ]);
});

describe("ProcessingRunList run detail", () => {
  it("prints each cassette's tissue count beside its block label", async () => {
    await openRunDetail();

    expect(screen.getByText("A1(1)")).toBeInTheDocument();
    expect(screen.getByText("A2(2)")).toBeInTheDocument();
  });

  it("shows a recorded zero rather than hiding it", async () => {
    await openRunDetail();

    expect(screen.getByText("A3(0)")).toBeInTheDocument();
  });

  it("marks an uncountable cassette TNTC", async () => {
    await openRunDetail();

    expect(screen.getByText("B1(TNTC)")).toBeInTheDocument();
  });

  it("leaves the label bare when no count was ever recorded", async () => {
    /* Runs from before the count was captured have null on every block; those
       must not read as "(null)" or "(-)". */
    await openRunDetail();

    expect(screen.getByText("B2")).toBeInTheDocument();
  });

  it("no longer carries a separate case-total column", async () => {
    await openRunDetail();

    expect(screen.queryByText("Tissue Count")).not.toBeInTheDocument();
  });
});
