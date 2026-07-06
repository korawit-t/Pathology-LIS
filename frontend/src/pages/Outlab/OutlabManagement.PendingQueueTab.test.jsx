import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PendingQueueTab } from "./OutlabManagement";
import SurgicalBlockService from "../../services/surgicalBlockService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import api from "../../services/httpClient";

vi.mock("../../services/surgicalBlockService", () => ({ default: { getBlocks: vi.fn() } }));
vi.mock("../../services/surgicalCaseService", () => ({ default: { getCases: vi.fn() } }));
vi.mock("../../services/surgicalBlockStainService", () => ({ default: { createOutlabRun: vi.fn() } }));
vi.mock("../../services/httpClient", () => ({ default: { get: vi.fn() } }));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user: { full_name: "Dr. Test" } }) }));

const externalPendingStain = (overrides = {}) => ({
  id: 1,
  status: "pending",
  test: { is_external: true, name: "HPV DNA", category: "Molecular" },
  ...overrides,
});

const makeBlock = (overrides = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  specimen_label: "A",
  block_no: 1,
  stains: [externalPendingStain()],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [{ id: 1, name: "Reference Lab A" }] });
  SurgicalCaseService.getCases.mockResolvedValue({ items: [] });
});

describe("PendingQueueTab", () => {
  it("only shows blocks with at least one external+pending stain", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        makeBlock({ id: 1, accession_no: "S26-00001" }),
        makeBlock({
          id: 2,
          accession_no: "S26-00002",
          stains: [{ id: 2, status: "pending", test: { is_external: false, name: "H&E" } }],
        }),
        makeBlock({
          id: 3,
          accession_no: "S26-00003",
          stains: [{ id: 3, status: "stained", test: { is_external: true, name: "IHC" } }],
        }),
      ],
    });

    render(<PendingQueueTab onSent={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    expect(screen.queryByText("S26-00002")).not.toBeInTheDocument();
    expect(screen.queryByText("S26-00003")).not.toBeInTheDocument();
  });

  it("disables Send button until at least one block is selected", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [makeBlock()] });
    render(<PendingQueueTab onSent={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /Send Outlab \(0\)/i })).toBeDisabled();

    fireEvent.click(screen.getAllByRole("checkbox")[1]); // [0] is select-all header
    expect(screen.getByRole("button", { name: /Send Outlab \(1\)/i })).not.toBeDisabled();
  });

  it("shows the logged-in user's full_name as Operator in the dispatch modal", async () => {
    // Regression: this used to read user?.first_name / user?.last_name, neither
    // of which exists on the User type (only full_name does) — so "Operator:"
    // always rendered blank.
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [makeBlock()] });
    render(<PendingQueueTab onSent={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Send Outlab \(1\)/i }));

    const dialog = await screen.findByRole("dialog");
    // "Operator:" is a <strong> sibling of the name text, both inside one
    // antd <Text> span — assert on that containing span, not the <strong> alone.
    expect(within(dialog).getByText(/Operator:/).closest("span")).toHaveTextContent("Operator: Dr. Test");
  });

  it("warns instead of submitting when no destination lab is chosen", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({ items: [makeBlock()] });
    render(<PendingQueueTab onSent={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Send Outlab \(1\)/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Send" }));

    await waitFor(() => expect(SurgicalBlockStainService.createOutlabRun).not.toHaveBeenCalled());
  });

  it("submits only the external+pending stain ids for selected blocks and resets on success", async () => {
    SurgicalBlockService.getBlocks.mockResolvedValue({
      items: [
        makeBlock({
          id: 1,
          accession_no: "S26-00001",
          stains: [
            externalPendingStain({ id: 10 }),
            { id: 11, status: "stained", test: { is_external: true, name: "Already sent" } },
          ],
        }),
      ],
    });
    SurgicalBlockStainService.createOutlabRun.mockResolvedValue({});
    const onSent = vi.fn();
    render(<PendingQueueTab onSent={onSent} />);
    await waitFor(() => expect(screen.getByText("S26-00001")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Send Outlab \(1\)/i }));

    const dialog = await screen.findByRole("dialog");
    // Select destination lab (antd Select renders its placeholder as text, not an <input placeholder>)
    fireEvent.mouseDown(within(dialog).getByText("Select destination lab"));
    fireEvent.click(await screen.findByTitle("Reference Lab A"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Send" }));

    await waitFor(() =>
      expect(SurgicalBlockStainService.createOutlabRun).toHaveBeenCalledWith({
        destination_lab: "Reference Lab A",
        stain_ids: [10], // only the pending one, not the already-stained id 11
        tracking_number: undefined,
      }),
    );
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });
});
