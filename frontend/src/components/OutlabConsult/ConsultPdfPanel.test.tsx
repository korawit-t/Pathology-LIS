import type React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConsultPdfPanel from "./ConsultPdfPanel";
import { ThemeProvider } from "../../contexts/ThemeContext";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

const renderPanel = (props: React.ComponentProps<typeof ConsultPdfPanel>) =>
  render(
    <ThemeProvider>
      <ConsultPdfPanel {...props} />
    </ThemeProvider>,
  );

const baseProps = {
  caseId: 1,
  onUpload: vi.fn(),
  onDelete: vi.fn(),
  onGetBlob: vi.fn(),
  onRefresh: vi.fn(),
};

describe("ConsultPdfPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not flagged for out-lab consult", () => {
    const { container } = renderPanel({ ...baseProps, isOutLabConsult: false, consultPdfPath: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the upload UI when flagged but no PDF uploaded yet", () => {
    renderPanel({ ...baseProps, isOutLabConsult: true, consultPdfPath: null });
    expect(screen.getByText("Out-Lab Consult PDF")).toBeInTheDocument();
    expect(screen.getByText("Click or drag PDF to upload")).toBeInTheDocument();
    expect(screen.queryByText("Delete PDF")).not.toBeInTheDocument();
  });

  it("shows the inline preview and delete button when a PDF is already uploaded", async () => {
    const onGetBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    renderPanel({
      ...baseProps,
      onGetBlob,
      isOutLabConsult: true,
      consultPdfPath: "/uploads/consults/consult_gyne_1.pdf",
    });

    await waitFor(() => expect(onGetBlob).toHaveBeenCalledWith(1));
    expect(screen.getByText("Consult report PDF received.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete PDF/i })).toBeInTheDocument();
    expect(screen.queryByText("Click or drag PDF to upload")).not.toBeInTheDocument();
  });

  it("calls onDelete and onRefresh after confirming deletion", async () => {
    const onGetBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onRefresh = vi.fn();
    renderPanel({
      ...baseProps,
      onGetBlob,
      onDelete,
      onRefresh,
      isOutLabConsult: true,
      consultPdfPath: "/uploads/consults/consult_gyne_1.pdf",
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /Delete PDF/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Delete PDF/i }));

    const confirmButton = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
