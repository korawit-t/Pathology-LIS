import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProcessorMachineManager from "./ProcessorMachineManager";
import TissueProcessingService from "../services/tissueProcessingService";

vi.mock("../services/tissueProcessingService", () => ({
  default: {
    getMachines: vi.fn(),
    createMachine: vi.fn(),
    updateMachine: vi.fn(),
    deleteMachine: vi.fn(),
  },
}));

const machine = (overrides = {}) => ({ id: 1, name: "Peloris 1", is_active: true, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProcessorMachineManager", () => {
  it("loads and displays machines with Active rendered as Yes/No", async () => {
    TissueProcessingService.getMachines.mockResolvedValue([
      machine({ id: 1, name: "Peloris 1", is_active: true }),
      machine({ id: 2, name: "Peloris 2", is_active: false }),
    ]);
    render(<ProcessorMachineManager />);

    await waitFor(() => expect(screen.getByText("Peloris 1")).toBeInTheDocument());
    expect(screen.getByText("Peloris 2")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("creates a new machine and refetches the list", async () => {
    TissueProcessingService.getMachines.mockResolvedValueOnce([]).mockResolvedValueOnce([machine()]);
    TissueProcessingService.createMachine.mockResolvedValue(machine());
    render(<ProcessorMachineManager />);
    await waitFor(() => expect(TissueProcessingService.getMachines).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Machine/i }));
    fireEvent.change(await screen.findByLabelText("Machine Name"), { target: { value: "Peloris 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(TissueProcessingService.createMachine).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Peloris 1", is_active: true }),
      ),
    );
    expect(TissueProcessingService.updateMachine).not.toHaveBeenCalled();
    await waitFor(() => expect(TissueProcessingService.getMachines).toHaveBeenCalledTimes(2));
  });

  it("edits an existing machine via updateMachine, pre-filled from the record", async () => {
    TissueProcessingService.getMachines.mockResolvedValue([machine()]);
    TissueProcessingService.updateMachine.mockResolvedValue(machine({ is_active: false }));
    const { container } = render(<ProcessorMachineManager />);
    await waitFor(() => expect(screen.getByText("Peloris 1")).toBeInTheDocument());

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    const nameInput = await screen.findByLabelText("Machine Name");
    expect(nameInput).toHaveValue("Peloris 1");
    fireEvent.click(screen.getByRole("switch")); // toggle Active off
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(TissueProcessingService.updateMachine).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Peloris 1", is_active: false }),
      ),
    );
    expect(TissueProcessingService.createMachine).not.toHaveBeenCalled();
  });

  it("deletes a machine after confirming", async () => {
    TissueProcessingService.getMachines.mockResolvedValue([machine()]);
    TissueProcessingService.deleteMachine.mockResolvedValue({});
    const { container } = render(<ProcessorMachineManager />);
    await waitFor(() => expect(screen.getByText("Peloris 1")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "ใช่" }));

    await waitFor(() => expect(TissueProcessingService.deleteMachine).toHaveBeenCalledWith(1));
  });

  it("shows an error message when loading machines fails", async () => {
    TissueProcessingService.getMachines.mockRejectedValue(new Error("network error"));
    render(<ProcessorMachineManager />);

    expect(await screen.findByText("โหลดข้อมูลเครื่องเข้าเนื้อล้มเหลว")).toBeInTheDocument();
  });
});
