import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Form } from "antd";
import CaseFlagManager from "./CaseFlagManager";

type Props = React.ComponentProps<typeof CaseFlagManager>;

vi.mock("../../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

// Rendered only when reportId/caseId are set; stubbed so their service imports
// stay out of this test's way.
vi.mock("../../../../components/InternalConsult/ConsultRequestModal", () => ({
  default: () => <div data-testid="mock-consult-request" />,
}));
vi.mock("../../../../components/InternalConsult/ConsultHistorySection", () => ({
  default: () => <div data-testid="mock-consult-history" />,
}));
vi.mock("./TumorRegistryModal", () => ({
  default: () => <div data-testid="mock-tumor-registry" />,
}));

// CaseFlagManager reads the form via Form.useFormInstance(), so it must be
// rendered as a descendant of a real <Form> rather than handed a form prop.
const renderInForm = (
  initialValues: Record<string, unknown> = {},
  props: Partial<Props> = {},
) => {
  const Wrapper = () => {
    const [form] = Form.useForm();
    return (
      <Form form={form} initialValues={initialValues}>
        <CaseFlagManager {...props} />
      </Form>
    );
  };
  return render(<Wrapper />);
};

describe("CaseFlagManager", () => {
  it("hides the pending-reason field when is_pending is false", () => {
    renderInForm({ is_pending: false });
    expect(screen.getByText("Provisional")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Reason for pending/i),
    ).not.toBeInTheDocument();
  });

  it("shows the pending-reason field when is_pending is already true", () => {
    renderInForm({ is_pending: true });
    const reason = screen.getByPlaceholderText(/Reason for pending/i);
    expect(reason).toBeInTheDocument();
    // A saved provisional case must not pull focus away from the report editor.
    expect(reason).not.toHaveFocus();
  });

  it("opens the reason box inside the Provisional row, focused, when toggled on", async () => {
    renderInForm(
      { is_pending: false },
      { caseId: 1, reportId: 1, onRequestOutLabConsult: vi.fn() },
    );
    const row = screen.getByTestId("provisional-row");
    fireEvent.click(within(row).getByRole("switch"));

    const reason = within(row).getByPlaceholderText(/Reason for pending/i);
    // Next to the toggle, not after the Internal / Out-Lab Consult rows.
    expect(
      screen
        .getByText("Out-Lab Consult")
        .compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    await waitFor(() => expect(reason).toHaveFocus());
  });
});

describe("CaseFlagManager — Out-Lab Consult", () => {
  it("hides the row entirely when no request handler is wired up", () => {
    renderInForm({}, { caseId: 1 });
    expect(screen.queryByText("Out-Lab Consult")).not.toBeInTheDocument();
  });

  it("requests a consult with the typed reason, without signing off", async () => {
    const onRequestOutLabConsult = vi.fn().mockResolvedValue(undefined);
    renderInForm({}, { caseId: 1, onRequestOutLabConsult });

    fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/Reason for Out-Lab Consult/i),
      { target: { value: "Need subspecialty" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Send to Consult Queue/i }));

    await waitFor(() =>
      expect(onRequestOutLabConsult).toHaveBeenCalledWith("Need subspecialty"),
    );
  });

  it("does not submit an empty reason", async () => {
    const onRequestOutLabConsult = vi.fn().mockResolvedValue(undefined);
    renderInForm({}, { caseId: 1, onRequestOutLabConsult });

    fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    fireEvent.click(screen.getByRole("button", { name: /Send to Consult Queue/i }));

    await waitFor(() =>
      expect(screen.getByText(/Please enter a reason/i)).toBeInTheDocument(),
    );
    expect(onRequestOutLabConsult).not.toHaveBeenCalled();
  });

  it("offers Cancel while the consult is still queued", async () => {
    const onCancelOutLabConsult = vi.fn().mockResolvedValue(undefined);
    renderInForm(
      {},
      {
        caseId: 1,
        isOutLabConsult: true,
        consultStatus: "pending",
        consultReason: "Complex case",
        onRequestOutLabConsult: vi.fn(),
        onCancelOutLabConsult,
      },
    );

    expect(screen.getByText("Queued for dispatch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Remove$/i }));

    await waitFor(() => expect(onCancelOutLabConsult).toHaveBeenCalled());
  });

  it("locks the row once the case has been dispatched", () => {
    renderInForm(
      {},
      {
        caseId: 1,
        isOutLabConsult: true,
        consultStatus: "processing",
        onRequestOutLabConsult: vi.fn(),
        onCancelOutLabConsult: vi.fn(),
      },
    );

    expect(screen.getByText("Sent to lab")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDisabled();
  });

  it("says how many rounds the case has had and jumps to them", () => {
    const onShowConsultRounds = vi.fn();
    renderInForm(
      {},
      {
        caseId: 1,
        isOutLabConsult: true,
        consultStatus: "processing",
        consultReason: "Second opinion",
        consultNo: "S26-02890-C3",
        consultRoundCount: 2,
        onShowConsultRounds,
        onRequestOutLabConsult: vi.fn(),
        onCancelOutLabConsult: vi.fn(),
      },
    );

    expect(screen.getByText("C3")).toBeInTheDocument();
    expect(screen.getByText("Second opinion")).toBeInTheDocument();
    fireEvent.click(screen.getByText("2 rounds"));
    expect(onShowConsultRounds).toHaveBeenCalledTimes(1);
  });

  it("says 1 round, as plain text when there is nowhere to jump", () => {
    renderInForm(
      {},
      {
        caseId: 1,
        isOutLabConsult: true,
        consultStatus: "pending",
        consultNo: "S26-02890-C1",
        consultRoundCount: 1,
        onRequestOutLabConsult: vi.fn(),
        onCancelOutLabConsult: vi.fn(),
      },
    );

    expect(screen.getByText("1 round").closest("a")).toBeNull();
  });

  it("shows no count before the case has been sent", () => {
    renderInForm({}, { caseId: 1, consultRoundCount: 0, onRequestOutLabConsult: vi.fn() });
    expect(screen.queryByText(/^\d+ rounds?$/)).not.toBeInTheDocument();
  });

  it("offers a new round once the latest one is released, with an empty reason", async () => {
    const onRequestOutLabConsult = vi.fn().mockResolvedValue(undefined);
    renderInForm(
      {},
      {
        caseId: 1,
        isOutLabConsult: true,
        consultStatus: "received",
        consultReason: "First opinion",
        consultNo: "S26-02890-C1",
        onRequestOutLabConsult,
        onCancelOutLabConsult: vi.fn(),
      },
    );

    expect(screen.getByText("C1")).toBeInTheDocument();
    const again = screen.getByRole("button", { name: /Send again/i });
    expect(again).toBeEnabled();
    fireEvent.click(again);

    const dialog = await screen.findByRole("dialog");
    const reason = within(dialog).getByRole("textbox");
    expect(reason).toHaveValue("");
    fireEvent.change(reason, { target: { value: "Second opinion" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Send to Consult Queue/i }));

    await waitFor(() => expect(onRequestOutLabConsult).toHaveBeenCalledWith("Second opinion"));
  });
});
