import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StainManagementPage from "./StainManagementPage";
import AnatomicalPathologyTestService, { AnatomicalPathologyTest } from "../../../../../services/anatomicalTestService";
import SurgicalBlockStainService from "../../../../../services/surgicalBlockStainService";
import StainPanelService, { StainPanel } from "../../../../../services/stainPanelService";
import { BlockTimelineService } from "../../../../../services/blockTimelineService";
import { MolecularCaseService } from "../../../../../services/molecularCaseService";
import NotificationRuleService from "../../../../../services/notificationRuleService";
import type { SurgicalBlock } from "../../../../../types/surgical";

vi.mock("../../../../../services/anatomicalTestService", () => ({
  default: { getAllTests: vi.fn() },
}));
vi.mock("../../../../../services/surgicalBlockStainService", () => ({
  default: { createStain: vi.fn(), deleteStain: vi.fn(), getOutlabRuns: vi.fn() },
}));
vi.mock("../../../../../services/stainPanelService", () => ({
  default: { getPanels: vi.fn() },
}));
vi.mock("../../../../../services/blockTimelineService", () => ({
  BlockTimelineService: { getTimeline: vi.fn() },
}));
vi.mock("../../../../../services/molecularCaseService", () => ({
  MolecularCaseService: { getAll: vi.fn() },
}));
vi.mock("../../../../../services/notificationRuleService", () => ({
  default: { triggerEvent: vi.fn() },
}));

// Covered on its own in ManageStainPanelsModal.test.tsx; treat as a black box here.
vi.mock("./ManageStainPanelsModal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-manage-panels-modal" /> : null,
}));

const mockGetAllTests = AnatomicalPathologyTestService.getAllTests as ReturnType<typeof vi.fn>;
const mockCreateStain = SurgicalBlockStainService.createStain as ReturnType<typeof vi.fn>;
const mockDeleteStain = SurgicalBlockStainService.deleteStain as ReturnType<typeof vi.fn>;
const mockGetOutlabRuns = SurgicalBlockStainService.getOutlabRuns as ReturnType<typeof vi.fn>;
const mockGetPanels = StainPanelService.getPanels as ReturnType<typeof vi.fn>;
const mockGetTimeline = BlockTimelineService.getTimeline as ReturnType<typeof vi.fn>;
const mockMolecularGetAll = MolecularCaseService.getAll as ReturnType<typeof vi.fn>;
const mockTriggerEvent = NotificationRuleService.triggerEvent as ReturnType<typeof vi.fn>;

const makeTest = (overrides: Partial<AnatomicalPathologyTest> = {}): AnatomicalPathologyTest => ({
  id: 1,
  name: "H&E",
  category: "Surgical Pathology",
  price_tier_1: 100,
  is_external: false,
  ...overrides,
});

const makePanel = (overrides: Partial<StainPanel> = {}): StainPanel =>
  ({
    id: 1,
    name: "Lymphoma Panel",
    category: "Lymphoma",
    is_active: true,
    items: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as StainPanel;

const selectedBlock = { id: 10, block_no: "1", stains: [] } as unknown as SurgicalBlock;

const baseProps = {
  open: true,
  onCancel: vi.fn(),
  selectedBlock,
  defaultLabel: "A",
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllTests.mockResolvedValue({
    data: [
      makeTest({ id: 1, name: "H&E", category: "Surgical Pathology" }),
      makeTest({ id: 2, name: "CK7", category: "IHC" }),
      makeTest({ id: 3, name: "PAS", category: "Special Stain" }),
    ],
  });
  mockGetOutlabRuns.mockResolvedValue([]);
  mockGetPanels.mockResolvedValue([]);
  mockGetTimeline.mockResolvedValue([]);
  mockCreateStain.mockImplementation((payload) =>
    Promise.resolve({ id: 100 + payload.test_id, ...payload }),
  );
  mockDeleteStain.mockResolvedValue(undefined);
  mockMolecularGetAll.mockResolvedValue([]);
  mockTriggerEvent.mockResolvedValue({ success: true, detail: "ok" });
});

describe("StainManagementPage", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<StainManagementPage {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists tests in the All tab once loaded", async () => {
    render(<StainManagementPage {...baseProps} />);
    expect(await screen.findByText("CK7")).toBeInTheDocument();
    expect(screen.getByText("PAS")).toBeInTheDocument();
  });

  it("stages a test on click and moves it into To Order", async () => {
    render(<StainManagementPage {...baseProps} />);
    fireEvent.click(await screen.findByText("CK7"));
    expect(await screen.findByText(/Confirm Order — 1 Test/)).toBeInTheDocument();
  });

  it("filters the active tab's list via its own search box", async () => {
    render(<StainManagementPage {...baseProps} />);
    await screen.findByText("CK7");
    fireEvent.change(screen.getByPlaceholderText("Search all tests..."), {
      target: { value: "pas" },
    });
    expect(screen.getByText("PAS")).toBeInTheDocument();
    expect(screen.queryByText("CK7")).not.toBeInTheDocument();
  });

  it("switching tabs shows that category's tests with an independent search", async () => {
    render(<StainManagementPage {...baseProps} />);
    await screen.findByText("CK7");

    fireEvent.click(screen.getByText(/^IHC/));
    expect(screen.getByText("CK7")).toBeInTheDocument();
    expect(screen.queryByText("PAS")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search IHC...")).toHaveValue("");
  });

  it("orders staged tests, calling createStain per item and reporting success", async () => {
    render(<StainManagementPage {...baseProps} />);
    fireEvent.click(await screen.findByText("CK7"));
    fireEvent.click(screen.getByText(/Confirm Order/));

    await waitFor(() => expect(mockCreateStain).toHaveBeenCalledTimes(1));
    expect(mockCreateStain).toHaveBeenCalledWith(
      expect.objectContaining({ block_id: 10, test_id: 2, slide_no: 1 }),
    );
    await waitFor(() => expect(baseProps.onSuccess).toHaveBeenCalled());
    expect(await screen.findByText("Ordered 1 stain(s) successfully.")).toBeInTheDocument();
  });

  it("fires the IHC notification when an IHC test is ordered", async () => {
    render(<StainManagementPage {...baseProps} />);
    fireEvent.click(await screen.findByText("CK7"));
    fireEvent.click(screen.getByText(/Confirm Order/));

    await waitFor(() =>
      expect(mockTriggerEvent).toHaveBeenCalledWith(
        "stain_order_ihc",
        expect.objectContaining({ tests: "CK7", count: "1" }),
      ),
    );
  });

  it("deletes a stain only after the confirm dialog is accepted", async () => {
    mockGetAllTests.mockResolvedValue({ data: [] });
    const blockWithStain = {
      ...selectedBlock,
      stains: [{ id: 5, slide_no: 1, status: "pending", test: { id: 2, name: "CK7", category: "IHC" } }],
    } as unknown as SurgicalBlock;
    render(<StainManagementPage {...baseProps} selectedBlock={blockWithStain} />);

    const removeBtn = await screen.findByRole("button", { name: "delete" });
    fireEvent.click(removeBtn);

    const dialog = await waitFor(() => {
      const el = document.body.querySelector<HTMLElement>(".ant-popconfirm");
      if (!el) throw new Error("popconfirm not open");
      return el;
    });
    expect(mockDeleteStain).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByText("Remove"));

    await waitFor(() => expect(mockDeleteStain).toHaveBeenCalledWith(5));
  });

  it("applies a panel's tests to the staged list", async () => {
    mockGetPanels.mockResolvedValue([
      makePanel({
        items: [{ id: 1, test_id: 2, sort_order: 0, test: makeTest({ id: 2, name: "CK7", category: "IHC" }) }] as StainPanel["items"],
      }),
    ]);
    render(<StainManagementPage {...baseProps} />);
    await screen.findByText("CK7");

    fireEvent.click(screen.getByText(/^Panels/));
    fireEvent.click(await screen.findByText("Lymphoma Panel"));

    expect(await screen.findByText(/Confirm Order — 1 Test/)).toBeInTheDocument();
  });

  it("opens the Manage Panels modal", async () => {
    render(<StainManagementPage {...baseProps} />);
    await screen.findByText("CK7");
    fireEvent.click(screen.getByText(/^Panels/));
    fireEvent.click(screen.getByText("Manage Panels"));
    expect(screen.getByTestId("mock-manage-panels-modal")).toBeInTheDocument();
  });

  it("shows block history entries once fetched", async () => {
    mockGetTimeline.mockResolvedValue([
      { event_type: "GROSSED", label: "Block grossed", event_at: "2026-01-01T10:00:00Z" },
    ]);
    render(<StainManagementPage {...baseProps} />);
    fireEvent.click(await screen.findByText("Block History"));
    expect(await screen.findByText("Block grossed")).toBeInTheDocument();
  });
});
