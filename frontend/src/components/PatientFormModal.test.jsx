import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PatientFormModal from "./PatientFormModal";
import api from "../services/httpClient";

vi.mock("../services/httpClient", () => ({
  default: { post: vi.fn() },
}));

const titles = [{ id: 1, title: "Mr." }, { id: 2, title: "Mrs." }];
const hospitals = [{ id: 10, name: "Main Hospital" }];
const schemes = [{ id: 100, name: "บัตรทอง" }];

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  titles,
  hospitals,
  schemes,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PatientFormModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<PatientFormModal {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("submits with cid and birth_date defaulted to null when left blank", async () => {
    api.post.mockResolvedValue({ data: { name: "Somchai" } });
    render(<PatientFormModal {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("ชื่อ"), { target: { value: "Somchai" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/patients",
        expect.objectContaining({ name: "Somchai", cid: null, birth_date: null }),
      ),
    );
  });

  it("calls onClose and onSuccess with the created patient on success", async () => {
    const created = { id: 5, name: "Somchai" };
    api.post.mockResolvedValue({ data: created });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<PatientFormModal {...baseProps} onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText("ชื่อ"), { target: { value: "Somchai" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server-provided detail message on a duplicate HN/CID error", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "CID already exists" } } });
    render(<PatientFormModal {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("ชื่อ"), { target: { value: "Somchai" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    expect(await screen.findByText("CID already exists")).toBeInTheDocument();
  });

  it("falls back to a generic error message when the server gives no detail", async () => {
    api.post.mockRejectedValue(new Error("network down"));
    render(<PatientFormModal {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText("ชื่อ"), { target: { value: "Somchai" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    expect(await screen.findByText("เกิดข้อผิดพลาดในการบันทึกข้อมูล (HN/CID อาจซ้ำ)")).toBeInTheDocument();
  });

  it("requires a first name before submitting", async () => {
    render(<PatientFormModal {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    expect(await screen.findByText("กรุณากรอกชื่อ")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
