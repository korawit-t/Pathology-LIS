import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProcessingProgramManager from "./ProcessingProgramManager";
import TissueProcessingService from "../services/tissueProcessingService";

vi.mock("../services/tissueProcessingService", () => ({
  default: {
    getPrograms: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    deleteProgram: vi.fn(),
  },
}));

const program = (overrides = {}) => ({ id: 1, name: "Overnight", duration_hours: 12, is_active: true, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProcessingProgramManager", () => {
  it("loads and displays programs with duration and Active rendered as Yes/No", async () => {
    TissueProcessingService.getPrograms.mockResolvedValue([
      program({ id: 1, name: "Overnight", is_active: true }),
      program({ id: 2, name: "Rapid", duration_hours: 4, is_active: false }),
    ]);
    render(<ProcessingProgramManager />);

    await waitFor(() => expect(screen.getByText("Overnight")).toBeInTheDocument());
    expect(screen.getByText("Rapid")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("creates a new program and refetches the list", async () => {
    TissueProcessingService.getPrograms.mockResolvedValueOnce([]).mockResolvedValueOnce([program()]);
    TissueProcessingService.createProgram.mockResolvedValue(program());
    render(<ProcessingProgramManager />);
    await waitFor(() => expect(TissueProcessingService.getPrograms).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Program/i }));
    fireEvent.change(await screen.findByLabelText("Program Name"), { target: { value: "Overnight" } });
    fireEvent.change(screen.getByLabelText("Duration (Hours)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(TissueProcessingService.createProgram).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Overnight", duration_hours: 12, is_active: true }),
      ),
    );
    expect(TissueProcessingService.updateProgram).not.toHaveBeenCalled();
    await waitFor(() => expect(TissueProcessingService.getPrograms).toHaveBeenCalledTimes(2));
  });

  it("edits an existing program via updateProgram, pre-filled from the record", async () => {
    TissueProcessingService.getPrograms.mockResolvedValue([program()]);
    TissueProcessingService.updateProgram.mockResolvedValue(program({ duration_hours: 6 }));
    const { container } = render(<ProcessingProgramManager />);
    await waitFor(() => expect(screen.getByText("Overnight")).toBeInTheDocument());

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    const nameInput = await screen.findByLabelText("Program Name");
    expect(nameInput).toHaveValue("Overnight");
    expect(screen.getByLabelText("Duration (Hours)")).toHaveValue("12");
    fireEvent.change(screen.getByLabelText("Duration (Hours)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(TissueProcessingService.updateProgram).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Overnight", duration_hours: 6 }),
      ),
    );
    expect(TissueProcessingService.createProgram).not.toHaveBeenCalled();
  });

  it("deletes a program after confirming", async () => {
    TissueProcessingService.getPrograms.mockResolvedValue([program()]);
    TissueProcessingService.deleteProgram.mockResolvedValue({});
    const { container } = render(<ProcessingProgramManager />);
    await waitFor(() => expect(screen.getByText("Overnight")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "ใช่" }));

    await waitFor(() => expect(TissueProcessingService.deleteProgram).toHaveBeenCalledWith(1));
  });

  it("shows an error message when loading programs fails", async () => {
    TissueProcessingService.getPrograms.mockRejectedValue(new Error("network error"));
    render(<ProcessingProgramManager />);

    expect(await screen.findByText("โหลดข้อมูลโปรแกรมล้มเหลว")).toBeInTheDocument();
  });
});
