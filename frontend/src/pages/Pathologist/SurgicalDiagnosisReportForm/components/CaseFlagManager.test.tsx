import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Form } from "antd";
import CaseFlagManager from "./CaseFlagManager";

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
const renderInForm = (initialValues: Record<string, unknown> = {}) => {
  const Wrapper = () => {
    const [form] = Form.useForm();
    return (
      <Form form={form} initialValues={initialValues}>
        <CaseFlagManager />
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
