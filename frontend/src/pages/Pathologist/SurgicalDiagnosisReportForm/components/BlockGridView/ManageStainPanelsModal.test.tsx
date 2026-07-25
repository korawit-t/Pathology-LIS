import React, { useState } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ManageStainPanelsModal from "./ManageStainPanelsModal";
import StainPanelService, { StainPanel } from "../../../../../services/stainPanelService";
import type { AnatomicalPathologyTest } from "../../../../../services/anatomicalTestService";

vi.mock("../../../../../services/stainPanelService", () => ({
  default: { createPanel: vi.fn(), updatePanel: vi.fn(), deletePanel: vi.fn() },
}));

const mockCreatePanel = StainPanelService.createPanel as ReturnType<typeof vi.fn>;
const mockUpdatePanel = StainPanelService.updatePanel as ReturnType<typeof vi.fn>;
const mockDeletePanel = StainPanelService.deletePanel as ReturnType<typeof vi.fn>;

const makeTest = (overrides: Partial<AnatomicalPathologyTest> = {}): AnatomicalPathologyTest => ({
  id: 1,
  name: "CK7",
  category: "IHC",
  price_tier_1: 100,
  ...overrides,
});

const makePanel = (overrides: Partial<StainPanel> = {}): StainPanel =>
  ({
    id: 1,
    name: "Lymphoma Panel",
    category: "Lymphoma",
    is_active: true,
    items: [{ id: 1, test_id: 1, sort_order: 0, test: makeTest() }],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as StainPanel;

const stainOrderTests = [
  makeTest({ id: 1, name: "CK7", category: "IHC" }),
  makeTest({ id: 2, name: "PAS", category: "Special Stain" }),
];

/** Real state so setPanels calls behave like they do under the real parent. */
const Harness: React.FC<{
  initialPanels: StainPanel[];
  open: boolean;
  onClose?: () => void;
}> = ({ initialPanels, open, onClose = vi.fn() }) => {
  const [panels, setPanels] = useState(initialPanels);
  return (
    <ManageStainPanelsModal
      open={open}
      onClose={onClose}
      panels={panels}
      setPanels={setPanels}
      stainOrderTests={stainOrderTests}
    />
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ManageStainPanelsModal", () => {
  it("shows the blank placeholder until a panel is selected or created", () => {
    render(<Harness initialPanels={[makePanel()]} open />);
    expect(screen.getByText("Select a panel to edit, or create a new one.")).toBeInTheDocument();
  });

  it("lists existing panels with their test count", () => {
    render(<Harness initialPanels={[makePanel()]} open />);
    expect(screen.getByText("Lymphoma Panel")).toBeInTheDocument();
    expect(screen.getByText("1 tests")).toBeInTheDocument();
  });

  it("creates a new panel from the New Panel form", async () => {
    mockCreatePanel.mockResolvedValue(makePanel({ id: 2, name: "Breast Panel" }));
    render(<Harness initialPanels={[]} open />);

    fireEvent.click(screen.getByText("New Panel"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Lymphoma Panel"), {
      target: { value: "Breast Panel" },
    });
    fireEvent.click(screen.getByText("CK7"));
    fireEvent.click(screen.getByText("Save Panel"));

    await waitFor(() =>
      expect(mockCreatePanel).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Breast Panel", test_ids: [1] }),
      ),
    );
    expect(await screen.findByText("Panel saved.")).toBeInTheDocument();
  });

  it("requires a name before saving a new panel", () => {
    render(<Harness initialPanels={[]} open />);
    fireEvent.click(screen.getByText("New Panel"));
    fireEvent.click(screen.getByText("Save Panel"));

    expect(screen.getByText("Panel name is required.")).toBeInTheDocument();
    expect(mockCreatePanel).not.toHaveBeenCalled();
  });

  it("pre-fills the form when editing an existing panel", () => {
    render(<Harness initialPanels={[makePanel()]} open />);
    fireEvent.click(screen.getByRole("button", { name: "edit" }));

    expect(screen.getByDisplayValue("Lymphoma Panel")).toBeInTheDocument();
    expect(screen.getByText("Edit Panel")).toBeInTheDocument();
  });

  it("saves edits to an existing panel via updatePanel", async () => {
    mockUpdatePanel.mockResolvedValue(makePanel({ name: "Lymphoma Panel (v2)" }));
    render(<Harness initialPanels={[makePanel()]} open />);
    fireEvent.click(screen.getByRole("button", { name: "edit" }));

    fireEvent.change(screen.getByDisplayValue("Lymphoma Panel"), {
      target: { value: "Lymphoma Panel (v2)" },
    });
    fireEvent.click(screen.getByText("Save Panel"));

    await waitFor(() =>
      expect(mockUpdatePanel).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Lymphoma Panel (v2)" }),
      ),
    );
  });

  it("deletes a panel only after the confirm dialog is accepted", async () => {
    mockDeletePanel.mockResolvedValue(undefined);
    render(<Harness initialPanels={[makePanel()]} open />);
    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    const dialog = await waitFor(() => {
      const el = document.body.querySelector<HTMLElement>(".ant-popconfirm");
      if (!el) throw new Error("popconfirm not open");
      return el;
    });
    expect(mockDeletePanel).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByText("Delete"));
    await waitFor(() => expect(mockDeletePanel).toHaveBeenCalledWith(1));
    expect(await screen.findByText("No panels yet.")).toBeInTheDocument();
  });

  it("filters the test picker by search", () => {
    render(<Harness initialPanels={[]} open />);
    fireEvent.click(screen.getByText("New Panel"));
    fireEvent.change(screen.getByPlaceholderText("Search tests..."), {
      target: { value: "pas" },
    });

    expect(screen.getByText("PAS")).toBeInTheDocument();
    expect(screen.queryByText("CK7")).not.toBeInTheDocument();
  });

  it("resets to the blank view every time it reopens", () => {
    const { rerender } = render(<Harness initialPanels={[makePanel()]} open={false} />);
    rerender(<Harness initialPanels={[makePanel()]} open />);
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.getByText("Edit Panel")).toBeInTheDocument();

    rerender(<Harness initialPanels={[makePanel()]} open={false} />);
    rerender(<Harness initialPanels={[makePanel()]} open />);

    expect(screen.getByText("Select a panel to edit, or create a new one.")).toBeInTheDocument();
  });
});
