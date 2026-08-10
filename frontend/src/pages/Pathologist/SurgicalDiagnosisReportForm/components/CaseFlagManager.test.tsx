import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    expect(
      screen.getByPlaceholderText(/Reason for pending/i),
    ).toBeInTheDocument();
  });

  it("reveals the pending-reason field when the Provisional switch is toggled on", () => {
    const { container } = renderInForm({ is_pending: false });
    const switches = container.querySelectorAll<HTMLElement>("button.ant-switch");
    // Order matches the card: Malignancy, Critical Case, Provisional
    fireEvent.click(switches[2]);
    expect(
      screen.getByPlaceholderText(/Reason for pending/i),
    ).toBeInTheDocument();
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
});
