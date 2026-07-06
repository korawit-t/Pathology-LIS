import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DepartmentManager from "./DepartmentManager";
import DepartmentService from "../services/departmentService";

vi.mock("../services/departmentService", () => ({
  default: {
    getDepartments: vi.fn(),
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
  },
}));

const dept = (overrides = {}) => ({ id: 1, name: "Surgery", is_active: true, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DepartmentManager", () => {
  it("loads all departments (including inactive) and renders Active/Inactive tags", async () => {
    DepartmentService.getDepartments.mockResolvedValue([
      dept({ id: 1, name: "Surgery", is_active: true }),
      dept({ id: 2, name: "Old Ward", is_active: false }),
    ]);
    render(<DepartmentManager />);

    await waitFor(() => expect(screen.getByText("Surgery")).toBeInTheDocument());
    expect(DepartmentService.getDepartments).toHaveBeenCalledWith(false);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("filters the table by search text", async () => {
    DepartmentService.getDepartments.mockResolvedValue([
      dept({ id: 1, name: "Surgery" }),
      dept({ id: 2, name: "Cardiology" }),
    ]);
    render(<DepartmentManager />);
    await waitFor(() => expect(screen.getByText("Surgery")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search department..."), { target: { value: "surg" } });

    await waitFor(() => expect(screen.queryByText("Cardiology")).not.toBeInTheDocument());
    expect(screen.getByText("Surgery")).toBeInTheDocument();
  });

  it("creates a new department, defaulting Active status to true", async () => {
    DepartmentService.getDepartments.mockResolvedValueOnce([]).mockResolvedValueOnce([dept()]);
    DepartmentService.createDepartment.mockResolvedValue(dept());
    render(<DepartmentManager />);
    await waitFor(() => expect(DepartmentService.getDepartments).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Department Name" }), { target: { value: "Surgery" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(DepartmentService.createDepartment).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Surgery", is_active: true }),
      ),
    );
    expect(DepartmentService.updateDepartment).not.toHaveBeenCalled();
  });

  it("edits an existing department via updateDepartment, pre-filled from the record", async () => {
    DepartmentService.getDepartments.mockResolvedValue([dept()]);
    DepartmentService.updateDepartment.mockResolvedValue(dept({ is_active: false }));
    const { container } = render(<DepartmentManager />);
    await waitFor(() => expect(screen.getByText("Surgery")).toBeInTheDocument());

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    const nameInput = await screen.findByRole("textbox", { name: "Department Name" });
    expect(nameInput).toHaveValue("Surgery");
    fireEvent.click(screen.getByRole("switch")); // toggle Active off
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(DepartmentService.updateDepartment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Surgery", is_active: false }),
      ),
    );
    expect(DepartmentService.createDepartment).not.toHaveBeenCalled();
  });

  it("shows a server error detail when saving fails", async () => {
    DepartmentService.getDepartments.mockResolvedValue([]);
    DepartmentService.createDepartment.mockRejectedValue({ response: { data: { detail: "Duplicate name" } } });
    render(<DepartmentManager />);
    await waitFor(() => expect(DepartmentService.getDepartments).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Department Name" }), { target: { value: "Surgery" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Duplicate name")).toBeInTheDocument();
  });

  it("disables delete for an active department", async () => {
    DepartmentService.getDepartments.mockResolvedValue([dept({ is_active: true })]);
    const { container } = render(<DepartmentManager />);
    await waitFor(() => expect(screen.getByText("Surgery")).toBeInTheDocument());

    expect(container.querySelector(".ant-btn-dangerous")).toBeDisabled();
  });

  it("deletes an inactive department after confirming", async () => {
    DepartmentService.getDepartments.mockResolvedValue([dept({ is_active: false })]);
    DepartmentService.deleteDepartment.mockResolvedValue({});
    const { container } = render(<DepartmentManager />);
    await waitFor(() => expect(screen.getByText("Surgery")).toBeInTheDocument());

    const deleteBtn = container.querySelector(".ant-btn-dangerous");
    expect(deleteBtn).not.toBeDisabled();
    fireEvent.click(deleteBtn);
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(DepartmentService.deleteDepartment).toHaveBeenCalledWith(1));
  });

  it("shows a specific error message when delete fails", async () => {
    DepartmentService.getDepartments.mockResolvedValue([dept({ is_active: false })]);
    DepartmentService.deleteDepartment.mockRejectedValue(new Error("in use"));
    const { container } = render(<DepartmentManager />);
    await waitFor(() => expect(screen.getByText("Surgery")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(await screen.findByText("ไม่สามารถลบได้ เนื่องจากมีการใช้งานอยู่ในระบบ")).toBeInTheDocument();
  });

  it("shows an error message when loading departments fails", async () => {
    DepartmentService.getDepartments.mockRejectedValue(new Error("network error"));
    render(<DepartmentManager />);

    expect(await screen.findByText("ไม่สามารถโหลดข้อมูลแผนกได้")).toBeInTheDocument();
  });
});
