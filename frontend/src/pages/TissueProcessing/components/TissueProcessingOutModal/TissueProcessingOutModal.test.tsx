/**
 * The modal used to send `block_out_total` but never `confirmed_block_ids`, so
 * the backend fell back to "every block in the run came out" and marked blocks
 * nobody had verified as "processed" — which is how blocks that never left the
 * processor showed up in the Embedding pending list.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App as AntdApp } from "antd";
import ProcessOutModal from "./TissueProcessingOutModal";
import TissueProcessingService from "../../../../services/tissueProcessingService";

vi.mock("../../../../services/tissueProcessingService", () => ({
  default: { getRunById: vi.fn(), updateRunStatus: vi.fn() },
}));

const updateRunStatus = () =>
  TissueProcessingService.updateRunStatus as ReturnType<typeof vi.fn>;

const renderModal = async () => {
  render(
    <AntdApp>
      <ProcessOutModal runId={1} open onClose={vi.fn()} onSuccess={vi.fn()} />
    </AntdApp>,
  );
  await screen.findByText(/Block: A1/);
};

const confirmButton = () =>
  screen.getByRole("button", { name: /Confirm Process Out/i });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("user", JSON.stringify({ id: 7 }));
  (TissueProcessingService.getRunById as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 1,
    run_number: "PR-20260817-01",
    block_in_total: 2,
    items: [
      { id: 10, block_id: 101, block: { id: 101, specimen_label: "A", block_no: 1 } },
      { id: 11, block_id: 102, block: { id: 102, specimen_label: "A", block_no: 2 } },
    ],
  });
  updateRunStatus().mockResolvedValue({});
});

describe("ProcessOutModal", () => {
  it("sends the verified blocks so unscanned ones aren't marked processed", async () => {
    await renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Select All/i }));
    fireEvent.click(confirmButton());

    await waitFor(() => expect(updateRunStatus()).toHaveBeenCalled());
    expect(updateRunStatus()).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "completed",
        confirmed_block_ids: [101, 102],
        block_out_total: 2,
      }),
    );
  });

  it("only confirms the blocks actually verified", async () => {
    await renderModal();

    fireEvent.click(screen.getByText(/Block: A1/));
    fireEvent.click(confirmButton());

    // Partial process-out warns first — the unverified block stays behind.
    fireEvent.click(await screen.findByRole("button", { name: /Confirm anyway/i }));

    await waitFor(() => expect(updateRunStatus()).toHaveBeenCalled());
    expect(updateRunStatus()).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ confirmed_block_ids: [101] }),
    );
  });

  it("blocks a confirm with nothing verified, which would revert the whole run", async () => {
    await renderModal();

    expect(confirmButton()).toBeDisabled();
  });
});
