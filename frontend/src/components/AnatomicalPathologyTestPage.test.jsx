import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AnatomicalPathologyTestPage from "./AnatomicalPathologyTestPage";
import AnatomicalPathologyTestService from "../services/anatomicalTestService";
import ExternalLabService from "../services/externalLabService";
import { IHCService } from "../services/ihcService";

vi.mock("../services/anatomicalTestService", () => ({
  default: {
    getAllTests: vi.fn(),
    createTest: vi.fn(),
    updateTest: vi.fn(),
    deleteTest: vi.fn(),
  },
}));
vi.mock("../services/externalLabService", () => ({
  default: { getExternalLabs: vi.fn() },
}));
vi.mock("../services/ihcService", () => ({
  IHCService: {
    getOptions: vi.fn(),
    createOption: vi.fn(),
    updateOption: vi.fn(),
    deleteOption: vi.fn(),
    getExtraFields: vi.fn(),
    createExtraField: vi.fn(),
    updateExtraField: vi.fn(),
    deleteExtraField: vi.fn(),
    createExtraFieldOption: vi.fn(),
    updateExtraFieldOption: vi.fn(),
    deleteExtraFieldOption: vi.fn(),
  },
}));

// AntD's real Modal uses rc-dialog's focus-trap, which retries indefinitely in
// jsdom when two Modals are open at once (this component intentionally keeps
// the IHC Options modal open while opening the nested Extra Field Options
// modal on top of it) — a jsdom limitation, not an app bug. Swap in a plain
// div so the real business logic (open/close state, handlers, form wiring)
// is still fully exercised without fighting rc-dialog's animation/focus code.
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const Modal = ({ open, title, children, footer, onOk, onCancel }) =>
    open ? (
      <div role="dialog">
        <div>{title}</div>
        <div>{children}</div>
        {footer !== null && (
          <div>
            <button onClick={onOk}>OK</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        )}
      </div>
    ) : null;
  return { ...actual, Modal };
});

const mockGetAllTests = AnatomicalPathologyTestService.getAllTests;
const mockCreateTest = AnatomicalPathologyTestService.createTest;
const mockUpdateTest = AnatomicalPathologyTestService.updateTest;
const mockDeleteTest = AnatomicalPathologyTestService.deleteTest;
const mockGetExternalLabs = ExternalLabService.getExternalLabs;

const makeTestItem = (overrides = {}) => ({
  id: 1,
  code: "ER1",
  name: "ER",
  category: "IHC",
  description: "",
  specimen_complexity: null,
  is_external: false,
  outlab: null,
  price_tier_1: 100,
  price_tier_2: 200,
  price_tier_3: 300,
  ...overrides,
});

const makeIHCOption = (overrides = {}) => ({
  id: 1,
  ap_test_id: 1,
  option_label: "Positive",
  option_value: "positive",
  display_order: 0,
  has_numeric: null,
  numeric_unit: null,
  ...overrides,
});

const makeExtraField = (overrides = {}) => ({
  id: 1,
  ap_test_id: 1,
  field_key: "intensity",
  label: "Intensity",
  field_type: "select",
  numeric_unit: null,
  display_order: 0,
  options: [],
  ...overrides,
});

// The mocked Modal renders as a plain <div role="dialog"> for every open modal
// simultaneously, so helpers below pick out the one whose title matches.
const findDialogByTitle = async (titlePattern) => {
  const dialogs = await screen.findAllByRole("dialog");
  const match = dialogs.find((d) => within(d).queryByText(titlePattern));
  if (!match) throw new Error(`No open dialog matched ${titlePattern}`);
  return match;
};

describe("AnatomicalPathologyTestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTests.mockResolvedValue({ data: [makeTestItem()] });
    mockGetExternalLabs.mockResolvedValue([]);
    IHCService.getOptions.mockResolvedValue([]);
    IHCService.getExtraFields.mockResolvedValue([]);
  });

  it("loads and renders test items", async () => {
    render(<AnatomicalPathologyTestPage />);
    expect(await screen.findByText("ER")).toBeInTheDocument();
    expect(mockGetAllTests).toHaveBeenCalled();
  });

  it("filters rows by the search box", async () => {
    mockGetAllTests.mockResolvedValue({
      data: [makeTestItem({ id: 1, name: "ER" }), makeTestItem({ id: 2, name: "PR", code: "PR1" })],
    });
    render(<AnatomicalPathologyTestPage />);
    await screen.findByText("ER");
    expect(screen.getByText("PR")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: "PR" } });

    expect(screen.queryByText("ER")).not.toBeInTheDocument();
    expect(screen.getByText("PR")).toBeInTheDocument();
  });

  it("deletes a test item after confirming", async () => {
    mockDeleteTest.mockResolvedValue({});
    render(<AnatomicalPathologyTestPage />);
    await screen.findByText("ER");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm|ok|yes/i }));

    await waitFor(() => expect(mockDeleteTest).toHaveBeenCalledWith(1));
  });

  it("opens the create modal with an empty form (no editingId)", async () => {
    render(<AnatomicalPathologyTestPage />);
    await screen.findByText("ER");

    fireEvent.click(screen.getByText("+ เพิ่มรายการตรวจ"));

    const dialog = await findDialogByTitle("เพิ่มรายการตรวจ");
    expect(within(dialog).queryByDisplayValue("ER")).not.toBeInTheDocument();
  });

  it("opens the edit modal pre-filled, and submitting calls updateTest (not createTest)", async () => {
    mockUpdateTest.mockResolvedValue({});
    render(<AnatomicalPathologyTestPage />);
    await screen.findByText("ER");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await findDialogByTitle("Edit Test Item");
    expect(within(dialog).getByDisplayValue("ER")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "OK" }));

    await waitFor(() => expect(mockUpdateTest).toHaveBeenCalledWith(1, expect.objectContaining({ name: "ER" })));
    expect(mockCreateTest).not.toHaveBeenCalled();
  });

  describe("IHC Options modal", () => {
    it("loads options and extra fields when Options is clicked on an IHC row", async () => {
      IHCService.getOptions.mockResolvedValue([makeIHCOption()]);
      IHCService.getExtraFields.mockResolvedValue([makeExtraField()]);
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");

      fireEvent.click(screen.getByRole("button", { name: /Options/ }));

      const dialog = await findDialogByTitle(/IHC Options — ER/);
      expect(IHCService.getOptions).toHaveBeenCalledWith(1);
      expect(IHCService.getExtraFields).toHaveBeenCalledWith(1);
      expect(within(dialog).getAllByText("Positive").length).toBeGreaterThan(0); // table row + preview tag
      expect(within(dialog).getByText("Intensity:")).toBeInTheDocument();
    });

    it("adds a new primary option", async () => {
      IHCService.createOption.mockResolvedValue({});
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);

      fireEvent.click(within(dialog).getByText("เพิ่ม Option"));
      fireEvent.change(within(dialog).getByPlaceholderText("e.g. Positive"), { target: { value: "Negative" } });
      fireEvent.change(within(dialog).getByPlaceholderText("e.g. positive"), { target: { value: "negative" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

      await waitFor(() =>
        expect(IHCService.createOption).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ option_label: "Negative", option_value: "negative", ap_test_id: 1 }),
        ),
      );
    });

    it("edits an existing primary option (calls updateOption, not createOption)", async () => {
      IHCService.getOptions.mockResolvedValue([makeIHCOption()]);
      IHCService.updateOption.mockResolvedValue({});
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);

      fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
      const labelInput = within(dialog).getByDisplayValue("Positive");
      fireEvent.change(labelInput, { target: { value: "Positive (strong)" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

      await waitFor(() =>
        expect(IHCService.updateOption).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ option_label: "Positive (strong)" }),
        ),
      );
      expect(IHCService.createOption).not.toHaveBeenCalled();
    });

    it("deletes a primary option after confirming", async () => {
      IHCService.getOptions.mockResolvedValue([makeIHCOption()]);
      IHCService.deleteOption.mockResolvedValue({});
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);

      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      fireEvent.click(await screen.findByRole("button", { name: /confirm|ok|yes/i }));

      await waitFor(() => expect(IHCService.deleteOption).toHaveBeenCalledWith(1));
    });

    it("adds a new Extra Field", async () => {
      IHCService.createExtraField.mockResolvedValue({});
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);

      fireEvent.click(within(dialog).getByText("เพิ่ม Extra Field"));
      fireEvent.change(within(dialog).getByPlaceholderText("e.g. Intensity"), { target: { value: "Intensity" } });
      fireEvent.change(within(dialog).getByPlaceholderText("e.g. intensity"), { target: { value: "intensity" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

      await waitFor(() =>
        expect(IHCService.createExtraField).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ label: "Intensity", field_key: "intensity", field_type: "select", ap_test_id: 1 }),
        ),
      );
    });

    it("edits an existing Extra Field (calls updateExtraField, not createExtraField)", async () => {
      IHCService.getExtraFields.mockResolvedValue([makeExtraField()]);
      IHCService.updateExtraField.mockResolvedValue({});
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);
      within(dialog).getByText("Intensity");

      fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
      const labelInput = within(dialog).getByDisplayValue("Intensity");
      fireEvent.change(labelInput, { target: { value: "Staining Intensity" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

      await waitFor(() =>
        expect(IHCService.updateExtraField).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ label: "Staining Intensity" }),
        ),
      );
      expect(IHCService.createExtraField).not.toHaveBeenCalled();
    });

    it("deletes an Extra Field after confirming", async () => {
      IHCService.getExtraFields.mockResolvedValue([makeExtraField()]);
      IHCService.deleteExtraField.mockResolvedValue({});
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);
      within(dialog).getByText("Intensity");

      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      fireEvent.click(await screen.findByRole("button", { name: /confirm|ok|yes/i }));

      await waitFor(() => expect(IHCService.deleteExtraField).toHaveBeenCalledWith(1));
    });

    describe("nested Extra Field Options modal", () => {
      it("adds an option to a select-type Extra Field", async () => {
        IHCService.getExtraFields.mockResolvedValue([makeExtraField()]);
        IHCService.createExtraFieldOption.mockResolvedValue({});
        render(<AnatomicalPathologyTestPage />);
        await screen.findByText("ER");
        fireEvent.click(screen.getByRole("button", { name: /Options/ }));
        const ihcDialog = await findDialogByTitle(/IHC Options/);

        fireEvent.click(within(ihcDialog).getByRole("button", { name: /Options \(0\)/ }));
        const nestedDialog = await findDialogByTitle(/Extra Field Options/);

        fireEvent.click(within(nestedDialog).getByText("เพิ่ม Option"));
        fireEvent.change(within(nestedDialog).getByPlaceholderText("e.g. 3+ (Strong)"), { target: { value: "3+ (Strong)" } });
        fireEvent.change(within(nestedDialog).getByPlaceholderText("e.g. 3+"), { target: { value: "3+" } });
        fireEvent.click(within(nestedDialog).getByRole("button", { name: "บันทึก" }));

        await waitFor(() =>
          expect(IHCService.createExtraFieldOption).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ option_label: "3+ (Strong)", option_value: "3+" }),
          ),
        );
      });

      it("edits an existing Extra Field option (calls updateExtraFieldOption, not create)", async () => {
        IHCService.getExtraFields.mockResolvedValue([
          makeExtraField({ options: [{ id: 5, field_id: 1, option_label: "3+", option_value: "three-plus", display_order: 0 }] }),
        ]);
        IHCService.updateExtraFieldOption.mockResolvedValue({});
        render(<AnatomicalPathologyTestPage />);
        await screen.findByText("ER");
        fireEvent.click(screen.getByRole("button", { name: /Options/ }));
        const ihcDialog = await findDialogByTitle(/IHC Options/);

        fireEvent.click(within(ihcDialog).getByRole("button", { name: /Options \(1\)/ }));
        const nestedDialog = await findDialogByTitle(/Extra Field Options/);

        fireEvent.click(within(nestedDialog).getByRole("button", { name: "Edit" }));
        const labelInput = within(nestedDialog).getByDisplayValue("3+");
        fireEvent.change(labelInput, { target: { value: "3+ (Strong)" } });
        fireEvent.click(within(nestedDialog).getByRole("button", { name: "Save Changes" }));

        await waitFor(() =>
          expect(IHCService.updateExtraFieldOption).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ option_label: "3+ (Strong)" }),
          ),
        );
        expect(IHCService.createExtraFieldOption).not.toHaveBeenCalled();
      });

      it("deletes an Extra Field option after confirming", async () => {
        IHCService.getExtraFields.mockResolvedValue([
          makeExtraField({ options: [{ id: 5, field_id: 1, option_label: "3+", option_value: "3+", display_order: 0 }] }),
        ]);
        IHCService.deleteExtraFieldOption.mockResolvedValue({});
        render(<AnatomicalPathologyTestPage />);
        await screen.findByText("ER");
        fireEvent.click(screen.getByRole("button", { name: /Options/ }));
        const ihcDialog = await findDialogByTitle(/IHC Options/);

        fireEvent.click(within(ihcDialog).getByRole("button", { name: /Options \(1\)/ }));
        const nestedDialog = await findDialogByTitle(/Extra Field Options/);

        fireEvent.click(within(nestedDialog).getByRole("button", { name: "Delete" }));
        fireEvent.click(await screen.findByRole("button", { name: /confirm|ok|yes/i }));

        await waitFor(() => expect(IHCService.deleteExtraFieldOption).toHaveBeenCalledWith(5));
      });
    });
  });

  describe("Preview panel", () => {
    it("toggles selection locally without calling any backend service", async () => {
      IHCService.getOptions.mockResolvedValue([makeIHCOption()]);
      render(<AnatomicalPathologyTestPage />);
      await screen.findByText("ER");
      fireEvent.click(screen.getByRole("button", { name: /Options/ }));
      const dialog = await findDialogByTitle(/IHC Options/);
      const [, previewTag] = within(dialog).getAllByText("Positive");

      fireEvent.click(previewTag);

      // Purely local preview state — no service call should ever fire from this interaction.
      expect(IHCService.createOption).not.toHaveBeenCalled();
      expect(IHCService.updateOption).not.toHaveBeenCalled();
    });
  });
});
