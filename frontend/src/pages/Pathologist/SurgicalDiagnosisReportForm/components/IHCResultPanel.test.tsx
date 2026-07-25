import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Form } from "antd";
import type { FormInstance } from "antd";
import IHCResultPanel from "./IHCResultPanel";
import { IHCService, IHCMarkerWithResult } from "../../../../services/ihcService";
import UserService from "../../../../services/userService";

vi.mock("../../../../services/ihcService", () => ({
  IHCService: {
    getPanel: vi.fn(),
    upsertResult: vi.fn(),
    upsertExtraValue: vi.fn(),
  },
}));
vi.mock("../../../../services/userService", () => ({
  default: { updateMyPreferences: vi.fn() },
}));
vi.mock("../../../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { preferences: {} }, updateUser: vi.fn() }),
}));

const mockGetPanel = IHCService.getPanel as ReturnType<typeof vi.fn>;
const mockUpsertResult = IHCService.upsertResult as ReturnType<typeof vi.fn>;
const mockUpsertExtraValue = IHCService.upsertExtraValue as ReturnType<typeof vi.fn>;

const makeOption = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  ap_test_id: 10,
  option_label: "Positive",
  option_value: "positive",
  display_order: 0,
  has_numeric: null,
  numeric_unit: null,
  ...overrides,
});

const makeExtraFieldOption = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  field_id: 1,
  option_label: "3+ (Strong)",
  option_value: "3+",
  display_order: 0,
  ...overrides,
});

const makeExtraField = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  ap_test_id: 10,
  field_key: "intensity",
  label: "Intensity",
  field_type: "select" as const,
  numeric_unit: null,
  display_order: 0,
  options: [],
  value: null,
  ...overrides,
});

const makeMarker = (overrides: Record<string, unknown> = {}): IHCMarkerWithResult => ({
  ap_test_id: 10,
  marker_name: "ER",
  options: [],
  result: null,
  extra_fields: [],
  ...overrides,
});

/**
 * IHCResultPanel reads the report form via Form.useFormInstance(), so every
 * test renders it inside a real <Form>. `formRef` exposes that instance so
 * assertions can read the values the panel wrote, instead of spying on a
 * hand-rolled fake.
 */
let formRef: FormInstance;

const renderPanel = (
  props: { specimenId: number; isLocked: boolean },
  initialValues: Record<string, unknown> = {},
) => {
  const Wrapper = () => {
    const [form] = Form.useForm();
    formRef = form;
    return (
      <Form form={form} initialValues={initialValues}>
        <IHCResultPanel {...props} />
      </Form>
    );
  };
  return render(<Wrapper />);
};

describe("IHCResultPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockUpsertResult.mockImplementation((payload) =>
      Promise.resolve({ id: 1, updated_at: "2026-01-01T00:00:00Z", ...payload }),
    );
    mockUpsertExtraValue.mockResolvedValue({ id: 1, ihc_result_id: 1, field_id: 1, value: null, updated_at: "2026-01-01T00:00:00Z" });
    (UserService.updateMyPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing while loading resolves to an empty panel", async () => {
    mockGetPanel.mockResolvedValue([]);
    const { container } = renderPanel({ specimenId: 5, isLocked: false });
    await act(async () => {
      await Promise.resolve();
    });
    // The wrapping <form> is the harness, not the panel — it must stay empty.
    expect(container.querySelector("form")).toBeEmptyDOMElement();
  });

  it("renders the marker name and primary options", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    renderPanel({ specimenId: 5, isLocked: false });
    expect(await screen.findByText("ER")).toBeInTheDocument();
    expect(screen.getByText("Positive")).toBeInTheDocument();
  });

  it("auto-marks the case pending when markers exist but none have results yet", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    renderPanel({ specimenId: 5, isLocked: false });
    await waitFor(() => expect(formRef.getFieldValue("is_pending")).toBe(true));
    expect(formRef.getFieldValue("pending_reason")).toBe("Waiting for IHC results");
  });

  it("leaves an already-pending case alone instead of stamping its own reason", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    // is_pending already true with no reason yet: the auto-mark must not fire,
    // so pending_reason stays empty rather than becoming the IHC boilerplate.
    renderPanel({ specimenId: 5, isLocked: false }, { is_pending: true });
    await screen.findByText("Positive");
    expect(formRef.getFieldValue("pending_reason")).toBeUndefined();
  });

  it("clicking a primary option saves selected_option, clicking again clears it", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    renderPanel({ specimenId: 5, isLocked: false });
    await screen.findByText("Positive");

    fireEvent.click(screen.getByText("Positive"));
    await waitFor(() =>
      expect(mockUpsertResult).toHaveBeenCalledWith(
        expect.objectContaining({ surgical_specimen_id: 5, ap_test_id: 10, selected_option: "positive" }),
      ),
    );

    fireEvent.click(screen.getByText("Positive"));
    await waitFor(() =>
      expect(mockUpsertResult).toHaveBeenLastCalledWith(
        expect.objectContaining({ selected_option: null }),
      ),
    );
  });

  it("regression: typing a percentage range like 31-40 is saved verbatim, not truncated", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({
        options: [makeOption({ has_numeric: "%", numeric_unit: "%" })],
        result: {
          id: 1,
          surgical_specimen_id: 5,
          ap_test_id: 10,
          selected_option: "positive",
          numeric_value: null,
          note: null,
          updated_at: "2026-01-01T00:00:00Z",
        },
      }),
    ]);
    renderPanel({ specimenId: 5, isLocked: false });
    const input = await screen.findByPlaceholderText(/31-40/);

    fireEvent.change(input, { target: { value: "31-40" } });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() =>
      expect(mockUpsertResult).toHaveBeenCalledWith(
        expect.objectContaining({ numeric_value: "31-40" }),
      ),
    );
  });

  it("does not show a numeric input for options without has_numeric", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({
        options: [makeOption({ has_numeric: null })],
        result: { id: 1, surgical_specimen_id: 5, ap_test_id: 10, selected_option: "positive", numeric_value: null, note: null, updated_at: "" },
      }),
    ]);
    renderPanel({ specimenId: 5, isLocked: false });
    await screen.findByText("Positive");
    expect(screen.queryByPlaceholderText("value")).not.toBeInTheDocument();
  });

  it("clicking an extra select-field tag saves the value, and toggles it off on re-click", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({
        extra_fields: [makeExtraField({ options: [makeExtraFieldOption()] })],
      }),
    ]);
    renderPanel({ specimenId: 5, isLocked: false });
    const tag = await screen.findByText("3+ (Strong)");

    fireEvent.click(tag);
    await waitFor(() =>
      expect(mockUpsertExtraValue).toHaveBeenCalledWith({
        surgical_specimen_id: 5,
        field_id: 1,
        value: "3+",
      }),
    );

    fireEvent.click(tag);
    await waitFor(() =>
      expect(mockUpsertExtraValue).toHaveBeenLastCalledWith({
        surgical_specimen_id: 5,
        field_id: 1,
        value: null,
      }),
    );
  });

  it("regression: an extra numeric field also accepts a range like 31-40 (uses a text Input, not InputNumber)", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({
        extra_fields: [makeExtraField({ field_type: "numeric", numeric_unit: "%" })],
      }),
    ]);
    renderPanel({ specimenId: 5, isLocked: false });
    const input = await screen.findByPlaceholderText(/31-40/);

    fireEvent.change(input, { target: { value: "31-40" } });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() =>
      expect(mockUpsertExtraValue).toHaveBeenCalledWith({
        surgical_specimen_id: 5,
        field_id: 1,
        value: "31-40",
      }),
    );
  });

  it("does not save on every keystroke — extra text field saves only debounce once typing settles", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({ extra_fields: [makeExtraField({ field_type: "text" })] }),
    ]);
    renderPanel({ specimenId: 5, isLocked: false });
    const input = await screen.findByDisplayValue("");

    fireEvent.change(input, { target: { value: "n" } });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.change(input, { target: { value: "nuclear" } });
    act(() => { vi.advanceTimersByTime(600); });

    await waitFor(() => expect(mockUpsertExtraValue).toHaveBeenCalledTimes(1));
    expect(mockUpsertExtraValue).toHaveBeenCalledWith({
      surgical_specimen_id: 5,
      field_id: 1,
      value: "nuclear",
    });
  });

  it("composes primary result + extra fields into the inserted report text", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({
        options: [makeOption({ has_numeric: "%", numeric_unit: "%" })],
        result: {
          id: 1,
          surgical_specimen_id: 5,
          ap_test_id: 10,
          selected_option: "positive",
          numeric_value: "91-100",
          note: null,
          updated_at: "",
        },
        extra_fields: [
          makeExtraField({ value: "3+", options: [makeExtraFieldOption()] }),
        ],
      }),
    ]);
    renderPanel({ specimenId: 5, isLocked: false });
    await screen.findByText("ER");

    fireEvent.click(screen.getByText("Insert → Diagnosis"));

    const html = formRef.getFieldValue(["diagnoses", 5, "diagnosis"]);
    expect(html).toContain("ER");
    expect(html).toContain("Positive, 91-100%, 3+ (Strong)");
  });

  it("appends to the diagnosis field rather than replacing what is already there", async () => {
    mockGetPanel.mockResolvedValue([
      makeMarker({
        options: [makeOption()],
        result: {
          id: 1,
          surgical_specimen_id: 5,
          ap_test_id: 10,
          selected_option: "positive",
          numeric_value: null,
          note: null,
          updated_at: "",
        },
      }),
    ]);
    renderPanel(
      { specimenId: 5, isLocked: false },
      { diagnoses: { 5: { diagnosis: "<p>Existing text</p>" } } },
    );
    await screen.findByText("ER");

    fireEvent.click(screen.getByText("Insert → Diagnosis"));

    const html = formRef.getFieldValue(["diagnoses", 5, "diagnosis"]);
    expect(html).toContain("Existing text");
    expect(html.indexOf("Existing text")).toBeLessThan(html.indexOf("ER"));
  });

  it("shows a warning and does not touch the form when there is nothing to insert", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    renderPanel({ specimenId: 5, isLocked: false });
    await screen.findByText("Positive");

    fireEvent.click(screen.getByText("Insert → Diagnosis"));

    expect(await screen.findByText("No IHC results to insert")).toBeInTheDocument();
    expect(formRef.getFieldValue(["diagnoses", 5, "diagnosis"])).toBeUndefined();
  });

  it("locks interaction when isLocked is true: no drag hint and no insert buttons", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    renderPanel({ specimenId: 5, isLocked: true });
    await screen.findByText("Positive");

    expect(screen.queryByText(/to reorder/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Insert → Diagnosis")).not.toBeInTheDocument();
  });

  it("locked options are not clickable", async () => {
    mockGetPanel.mockResolvedValue([makeMarker({ options: [makeOption()] })]);
    renderPanel({ specimenId: 5, isLocked: true });
    const tag = await screen.findByText("Positive");

    fireEvent.click(tag);

    expect(mockUpsertResult).not.toHaveBeenCalled();
  });
});
