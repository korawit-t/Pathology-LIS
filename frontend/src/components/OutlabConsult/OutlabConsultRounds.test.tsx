import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import OutlabConsultRounds from "./OutlabConsultRounds";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { OutlabConsultService } from "../../services/outlabConsultService";

vi.mock("../../services/outlabConsultService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/outlabConsultService")>();
  return {
    ...actual,
    OutlabConsultService: {
      listForCase: vi.fn(),
      request: vi.fn(),
      updateDetails: vi.fn(),
      getResultPdfBlob: vi.fn(),
    },
  };
});

vi.mock("../../services/externalLabService", () => ({
  default: { getExternalLabs: vi.fn().mockResolvedValue([{ id: 1, name: "Siriraj" }]) },
}));

const round = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  case_type: "gyne",
  case_id: 9,
  seq: 1,
  consult_no: "C26-00010-C1",
  status: "reported",
  has_result_pdf: true,
  destination_lab: "Siriraj",
  approved_by_name: "Dr. Somchai",
  ...overrides,
});

const renderRounds = (props: Partial<React.ComponentProps<typeof OutlabConsultRounds>> = {}) =>
  render(
    <ThemeProvider>
      <OutlabConsultRounds caseType="gyne" caseId={9} {...props} />
    </ThemeProvider>,
  );

describe("OutlabConsultRounds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing for a case without rounds", async () => {
    vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([]);
    const { container } = renderRounds();
    await waitFor(() => expect(OutlabConsultService.listForCase).toHaveBeenCalledWith("gyne", 9));
    expect(container.querySelector(".ant-card")).toBeNull();
  });

  it("lists every round and offers another once none is open", async () => {
    vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([
      round(),
      round({ id: 2, seq: 2, consult_no: "C26-00010-C2", status: "cancelled", has_result_pdf: false }),
    ] as never);
    vi.mocked(OutlabConsultService.request).mockResolvedValue(
      round({ id: 3, seq: 3, consult_no: "C26-00010-C3", status: "requested" }) as never,
    );
    const onChanged = vi.fn();
    renderRounds({ onChanged });

    expect(await screen.findByText("C1")).toBeInTheDocument();
    expect(screen.getByText("C2")).toBeInTheDocument();
    expect(screen.getByText("Released on report")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Request another consult/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Second opinion" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Queue for dispatch/i }));

    await waitFor(() =>
      expect(OutlabConsultService.request).toHaveBeenCalledWith("gyne", 9, "Second opinion", undefined),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("counts the rounds in its title, cancelled ones apart, and hands them to the page", async () => {
    const rounds = [
      round(),
      round({ id: 2, seq: 2, consult_no: "C26-00010-C2", status: "cancelled", has_result_pdf: false }),
      round({ id: 3, seq: 3, consult_no: "C26-00010-C3", status: "sent", has_result_pdf: false }),
    ];
    vi.mocked(OutlabConsultService.listForCase).mockResolvedValue(rounds as never);
    const onRoundsLoaded = vi.fn();
    const { container } = renderRounds({ onRoundsLoaded, id: "rounds-anchor" });

    expect(await screen.findByText("C3")).toBeInTheDocument();
    const head = container.querySelector(".ant-card-head") as HTMLElement;
    // C3 is the latest number, but only two rounds went out.
    expect(head.querySelector(".ant-badge-count")).toHaveTextContent("2");
    expect(within(head).getByText("1 cancelled")).toBeInTheDocument();
    expect(container.querySelector("#rounds-anchor")).not.toBeNull();
    expect(onRoundsLoaded).toHaveBeenLastCalledWith(rounds);
  });

  it("does not offer another round while one is still open", async () => {
    vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([
      round(),
      round({ id: 2, seq: 2, consult_no: "C26-00010-C2", status: "sent", has_result_pdf: false }),
    ] as never);
    renderRounds();

    expect(await screen.findByText("Sent to lab")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request another consult/i })).not.toBeInTheDocument();
  });

  it("leaves the request to Case Actions when asked to", async () => {
    vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([round()] as never);
    renderRounds({ canRequestAnother: false });

    expect(await screen.findByText("C1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request another consult/i })).not.toBeInTheDocument();
  });

  it("records only the concordance on a released round", async () => {
    vi.mocked(OutlabConsultService.listForCase).mockResolvedValue([
      round({ external_ref: "SI-123", external_pathologist: "Dr. A" }),
    ] as never);
    vi.mocked(OutlabConsultService.updateDetails).mockResolvedValue(round() as never);
    renderRounds();

    fireEvent.click(await screen.findByRole("button", { name: /Edit C26-00010-C1 details/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("SI-123")).toBeDisabled();

    fireEvent.mouseDown(within(dialog).getByRole("combobox"));
    fireEvent.click(await screen.findByText("Minor discordance"));
    fireEvent.click(within(dialog).getByRole("button", { name: /Save/i }));

    await waitFor(() =>
      expect(OutlabConsultService.updateDetails).toHaveBeenCalledWith(1, { concordance: "minor_discordant" }),
    );
  });
});
