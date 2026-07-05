import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyReadyStains from "./MyReadyStains";
import api from "../../../services/httpClient";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";

vi.mock("../../../services/httpClient", () => ({
  default: { get: vi.fn() },
}));
vi.mock("../../../services/surgicalBlockStainService", () => ({
  default: { updateStain: vi.fn() },
}));

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockUpdateStain = SurgicalBlockStainService.updateStain as ReturnType<typeof vi.fn>;

const makeStain = (overrides: Record<string, unknown> = {}) => ({
  stain_id: 1,
  block_code: "A1",
  test_name: "CK7",
  category: "IHC",
  status: "stained",
  is_external: false,
  ...overrides,
});

const makeCase = (overrides: Record<string, unknown> = {}) => ({
  case_id: 100,
  accession_no: "S26-00100",
  patient_name: "John",
  patient_ln: "Doe",
  case_status: "pending immuno",
  stains: [makeStain()],
  ihc_interpreted: null,
  ...overrides,
});

describe("MyReadyStains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: [] });
    mockUpdateStain.mockResolvedValue({});
  });

  it("fetches with pathologist_id param when provided", async () => {
    render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/surgical-block-stains/ready-additional", {
        params: { pathologist_id: 7 },
      }),
    );
  });

  it("fetches with no params when pathologistId is not provided", async () => {
    render(<MyReadyStains onSelectCase={vi.fn()} />);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/surgical-block-stains/ready-additional", {
        params: undefined,
      }),
    );
  });

  it("refetches when pathologistId prop changes (regression: stale closure on mount)", async () => {
    const { rerender } = render(
      <MyReadyStains onSelectCase={vi.fn()} pathologistId={undefined} />,
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    rerender(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith("/surgical-block-stains/ready-additional", {
      params: { pathologist_id: 7 },
    });
  });

  it("renders accession number and patient name", async () => {
    mockGet.mockResolvedValue({ data: [makeCase()] });
    render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
    await waitFor(() => expect(screen.getByText("S26-00100")).toBeInTheDocument());
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no cases", async () => {
    render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
    await waitFor(() =>
      expect(screen.getByText("No IHC / Special Stain orders found")).toBeInTheDocument(),
    );
  });

  describe("Interpreted column", () => {
    it("shows a dash when ihc_interpreted is null (no IHC stains ordered)", async () => {
      mockGet.mockResolvedValue({ data: [makeCase({ ihc_interpreted: null })] });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText("S26-00100")).toBeInTheDocument());
      expect(screen.getByText("-")).toBeInTheDocument();
    });

    it("shows an Interpreted tag when true", async () => {
      mockGet.mockResolvedValue({ data: [makeCase({ ihc_interpreted: true })] });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText("Interpreted")).toBeInTheDocument());
    });

    it("shows a Not Interpreted tag when false", async () => {
      mockGet.mockResolvedValue({ data: [makeCase({ ihc_interpreted: false })] });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText("Not Interpreted")).toBeInTheDocument());
    });
  });

  describe("Status column", () => {
    it("shows the All Stained tag when every stain is stained or completed", async () => {
      mockGet.mockResolvedValue({
        data: [
          makeCase({
            stains: [
              makeStain({ stain_id: 1, status: "stained" }),
              makeStain({ stain_id: 2, status: "completed" }),
            ],
          }),
        ],
      });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText("All Stained")).toBeInTheDocument());
    });

    it("does not show the All Stained tag while a stain is still pending or sent", async () => {
      mockGet.mockResolvedValue({
        data: [makeCase({ stains: [makeStain({ status: "pending" })] })],
      });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText("S26-00100")).toBeInTheDocument());
      expect(screen.queryByText("All Stained")).not.toBeInTheDocument();
    });
  });

  describe("Mark Reviewed", () => {
    it("only shows the Mark Reviewed button when at least one stain is awaiting review", async () => {
      mockGet.mockResolvedValue({
        data: [makeCase({ stains: [makeStain({ status: "completed" })] })],
      });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText("S26-00100")).toBeInTheDocument());
      expect(screen.queryByText(/Mark Reviewed/)).not.toBeInTheDocument();
    });

    it("marks only the stained stains as completed and refetches on success", async () => {
      mockGet.mockResolvedValue({
        data: [
          makeCase({
            stains: [
              makeStain({ stain_id: 1, status: "stained" }),
              makeStain({ stain_id: 2, status: "completed" }),
            ],
          }),
        ],
      });
      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText(/Mark Reviewed \(1\)/)).toBeInTheDocument());

      fireEvent.click(screen.getByText(/Mark Reviewed \(1\)/));
      fireEvent.click(await screen.findByText("Confirm"));

      await waitFor(() =>
        expect(mockUpdateStain).toHaveBeenCalledWith(1, { status: "completed" }),
      );
      expect(mockUpdateStain).not.toHaveBeenCalledWith(2, expect.anything());
      // initial load + refetch triggered after a successful mark-reviewed
      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    });

    it("refetches even when marking as reviewed partially fails (regression: stale table on error)", async () => {
      mockGet.mockResolvedValue({
        data: [
          makeCase({
            stains: [
              makeStain({ stain_id: 1, status: "stained" }),
              makeStain({ stain_id: 2, status: "stained" }),
            ],
          }),
        ],
      });
      mockUpdateStain.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("network error"));

      render(<MyReadyStains onSelectCase={vi.fn()} pathologistId={7} />);
      await waitFor(() => expect(screen.getByText(/Mark Reviewed \(2\)/)).toBeInTheDocument());

      fireEvent.click(screen.getByText(/Mark Reviewed \(2\)/));
      fireEvent.click(await screen.findByText("Confirm"));

      // initial load + refetch, even though one of the two updateStain calls rejected
      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    });
  });

  it("calls onSelectCase with the case id when Open Case is clicked", async () => {
    mockGet.mockResolvedValue({ data: [makeCase()] });
    const onSelectCase = vi.fn();
    render(<MyReadyStains onSelectCase={onSelectCase} pathologistId={7} />);
    await waitFor(() => expect(screen.getByText("S26-00100")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Open Case"));
    expect(onSelectCase).toHaveBeenCalledWith(100);
  });
});
