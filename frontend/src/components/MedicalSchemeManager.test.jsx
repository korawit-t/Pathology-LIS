import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MedicalSchemeManager from "./MedicalSchemeManager";
import MedicalSchemeService from "../services/medicalSchemeService";

vi.mock("../services/medicalSchemeService", () => ({
  default: {
    getSchemes: vi.fn(),
    createScheme: vi.fn(),
    updateScheme: vi.fn(),
    deleteScheme: vi.fn(),
  },
}));

const scheme = (overrides = {}) => ({ id: 1, name: "บัตรทอง", code: "UCS", ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MedicalSchemeManager", () => {
  it("loads and displays schemes sorted by id, rendering a Tag for code and a dash when absent", async () => {
    MedicalSchemeService.getSchemes.mockResolvedValue([
      scheme({ id: 2, name: "ประกันสังคม", code: "SSS" }),
      scheme({ id: 1, name: "บัตรทอง", code: null }),
    ]);
    render(<MedicalSchemeManager />);

    await waitFor(() => expect(screen.getByText("บัตรทอง")).toBeInTheDocument());
    const names = screen.getAllByText(/บัตรทอง|ประกันสังคม/).map((el) => el.textContent);
    expect(names).toEqual(["บัตรทอง", "ประกันสังคม"]);
    expect(screen.getByText("SSS")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("creates a new scheme and refetches the list", async () => {
    MedicalSchemeService.getSchemes.mockResolvedValueOnce([]).mockResolvedValueOnce([scheme()]);
    MedicalSchemeService.createScheme.mockResolvedValue(scheme());
    render(<MedicalSchemeManager />);
    await waitFor(() => expect(MedicalSchemeService.getSchemes).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Scheme/i }));
    fireEvent.change(await screen.findByLabelText("Scheme Name"), { target: { value: "บัตรทอง" } });
    fireEvent.change(screen.getByLabelText("Code (HIS Mapping)"), { target: { value: "UCS" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(MedicalSchemeService.createScheme).toHaveBeenCalledWith(
        expect.objectContaining({ name: "บัตรทอง", code: "UCS" }),
      ),
    );
    expect(MedicalSchemeService.updateScheme).not.toHaveBeenCalled();
    await waitFor(() => expect(MedicalSchemeService.getSchemes).toHaveBeenCalledTimes(2));
  });

  it("edits an existing scheme via updateScheme, pre-filled from the record", async () => {
    MedicalSchemeService.getSchemes.mockResolvedValue([scheme()]);
    MedicalSchemeService.updateScheme.mockResolvedValue(scheme({ name: "บัตรทอง (แก้ไข)" }));
    const { container } = render(<MedicalSchemeManager />);
    await waitFor(() => expect(screen.getByText("บัตรทอง")).toBeInTheDocument());

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    const nameInput = await screen.findByLabelText("Scheme Name");
    expect(nameInput).toHaveValue("บัตรทอง");
    fireEvent.change(nameInput, { target: { value: "บัตรทอง (แก้ไข)" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(MedicalSchemeService.updateScheme).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "บัตรทอง (แก้ไข)" }),
      ),
    );
    expect(MedicalSchemeService.createScheme).not.toHaveBeenCalled();
  });

  it("deletes a scheme after confirming", async () => {
    MedicalSchemeService.getSchemes.mockResolvedValue([scheme()]);
    MedicalSchemeService.deleteScheme.mockResolvedValue({});
    const { container } = render(<MedicalSchemeManager />);
    await waitFor(() => expect(screen.getByText("บัตรทอง")).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(MedicalSchemeService.deleteScheme).toHaveBeenCalledWith(1));
  });

  it("shows an error message when loading schemes fails", async () => {
    MedicalSchemeService.getSchemes.mockRejectedValue(new Error("network error"));
    render(<MedicalSchemeManager />);

    expect(await screen.findByText("โหลดข้อมูลไม่สำเร็จ")).toBeInTheDocument();
  });
});
