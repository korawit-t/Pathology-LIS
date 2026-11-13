import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import BlockTableForm from "./index";
import SurgicalBlockService from "../../../../services/surgicalBlockService";

vi.mock("../../../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin" } }),
}));
vi.mock("../../../../services/surgicalBlockService", () => ({
  default: {
    getBlocks: vi.fn(),
    deleteBlock: vi.fn(),
    createBlock: vi.fn(),
    updateBlock: vi.fn(),
  },
}));
vi.mock("../DecalFormModal", () => ({ default: () => null }));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const block = (id: number, no: number, status: string) => ({
  id,
  specimen_id: 11,
  specimen_label: "A",
  block_no: String(no),
  block_code: `A${no}`,
  case_block_seq: null,
  status,
  is_fixing: false,
  is_decal: false,
});

const renderTable = () =>
  render(
    <AntdApp>
      <BlockTableForm specimenId={11} defaultLabel="A" />
    </AntdApp>,
  );

describe("BlockTableForm — blocks past the gross room", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked(SurgicalBlockService.getBlocks).mockResolvedValue([
      block(101, 1, "grossed"),
      block(102, 2, "embedded"),
    ]);
  });

  it("shows where the block has gone and locks its delete button", async () => {
    renderTable();

    expect(await screen.findByText("Embedded")).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", { name: /Delete block/ });
    expect(deleteButtons).toHaveLength(2);
    // row order: A1 (grossed) then A2 (embedded)
    expect(deleteButtons[0]).toBeEnabled();
    expect(deleteButtons[1]).toBeDisabled();
    expect(deleteButtons[1]).toHaveAccessibleName("Delete block (locked)");
  });

  it("capitalises a stage it has no tag for", async () => {
    mocked(SurgicalBlockService.getBlocks).mockResolvedValue([block(103, 1, "in_review")]);
    renderTable();

    expect(await screen.findByText("In Review")).toBeInTheDocument();
    expect(screen.queryByText("in_review")).not.toBeInTheDocument();
  });

  it("still deletes a grossed block after confirming", async () => {
    mocked(SurgicalBlockService.deleteBlock).mockResolvedValue({});
    renderTable();
    await screen.findByText("Embedded");

    fireEvent.click(screen.getByRole("button", { name: "Delete block" }));
    fireEvent.click((await screen.findByText("OK")).closest("button") as Element);

    await waitFor(() => expect(SurgicalBlockService.deleteBlock).toHaveBeenCalledWith(101));
  });

  it("shows the backend's reason when it refuses", async () => {
    mocked(SurgicalBlockService.deleteBlock).mockRejectedValue({
      response: { status: 400, data: { detail: "A slide sticker for block A1 has been printed, so it can't be deleted." } },
    });
    renderTable();
    await screen.findByText("Embedded");

    fireEvent.click(screen.getByRole("button", { name: "Delete block" }));
    fireEvent.click((await screen.findByText("OK")).closest("button") as Element);

    expect(
      await screen.findByText("A slide sticker for block A1 has been printed, so it can't be deleted."),
    ).toBeInTheDocument();
  });
});
