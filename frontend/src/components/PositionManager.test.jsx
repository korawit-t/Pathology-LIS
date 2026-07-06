import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PositionManager from "./PositionManager";
import PositionService from "../services/positionService";

vi.mock("../services/positionService", () => ({
  default: {
    getPositions: vi.fn(),
    createPosition: vi.fn(),
    updatePosition: vi.fn(),
    deletePosition: vi.fn(),
  },
}));

const position = (overrides = {}) => ({ id: 1, name: "Pathologist", description: "Signs out reports", ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PositionManager", () => {
  it("loads and displays positions sorted by id", async () => {
    PositionService.getPositions.mockResolvedValue([position({ id: 2, name: "Nurse" }), position({ id: 1, name: "Doctor" })]);
    render(<PositionManager />);

    await waitFor(() => expect(screen.getByText("Doctor")).toBeInTheDocument());
    const names = screen.getAllByText(/Doctor|Nurse/).map((el) => el.textContent);
    expect(names).toEqual(["Doctor", "Nurse"]);
  });

  it("creates a new position and refetches the list", async () => {
    // Regression: handleSubmit used to call a bare `createPosition(values)`
    // that was never imported/defined (only PositionService was) — this
    // threw ReferenceError on every submit, silently swallowed by the
    // catch block, so no position was ever actually created.
    PositionService.getPositions.mockResolvedValueOnce([]).mockResolvedValueOnce([position()]);
    PositionService.createPosition.mockResolvedValue(position());
    render(<PositionManager />);
    await waitFor(() => expect(PositionService.getPositions).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Position/i }));
    fireEvent.change(await screen.findByLabelText("Position Name"), { target: { value: "Pathologist" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Position" }));

    await waitFor(() =>
      expect(PositionService.createPosition).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Pathologist" }),
      ),
    );
    expect(PositionService.updatePosition).not.toHaveBeenCalled();
    await waitFor(() => expect(PositionService.getPositions).toHaveBeenCalledTimes(2)); // refetched
  });

  it("edits an existing position via updatePosition, not createPosition", async () => {
    // Same regression class as create: bare `updatePosition(...)` was undefined.
    PositionService.getPositions.mockResolvedValue([position()]);
    PositionService.updatePosition.mockResolvedValue(position({ name: "Senior Pathologist" }));
    const { container } = render(<PositionManager />);
    await waitFor(() => expect(screen.getByText("Pathologist")).toBeInTheDocument());

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    const nameInput = await screen.findByLabelText("Position Name");
    expect(nameInput).toHaveValue("Pathologist"); // pre-filled from the record
    fireEvent.change(nameInput, { target: { value: "Senior Pathologist" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Position" }));

    await waitFor(() =>
      expect(PositionService.updatePosition).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Senior Pathologist" })),
    );
    expect(PositionService.createPosition).not.toHaveBeenCalled();
  });

  it("deletes a position after confirming", async () => {
    // Same regression class: bare `deletePosition(id)` was undefined.
    PositionService.getPositions.mockResolvedValue([position()]);
    PositionService.deletePosition.mockResolvedValue({});
    const { container } = render(<PositionManager />);
    await waitFor(() => expect(screen.getByText("Pathologist")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(PositionService.deletePosition).toHaveBeenCalledWith(1));
  });

  it("shows an error message when loading positions fails", async () => {
    PositionService.getPositions.mockRejectedValue(new Error("network error"));
    render(<PositionManager />);

    expect(await screen.findByText("โหลดข้อมูลตำแหน่งล้มเหลว")).toBeInTheDocument();
  });
});
