import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StepUpModal, { isStepUpRequired } from "./StepUpModal";
import AuthService from "../../services/authService";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../services/authService");

const mockedStepUp = AuthService.stepUp as unknown as ReturnType<typeof vi.fn>;

const renderModal = (props: Partial<React.ComponentProps<typeof StepUpModal>> = {}) => {
  const onVerified = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider>
      <StepUpModal open onCancel={onCancel} onVerified={onVerified} {...props} />
    </ThemeProvider>,
  );
  return { onVerified, onCancel };
};

const submit = (value: string) => {
  fireEvent.change(screen.getByPlaceholderText("Code or password"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
};

describe("isStepUpRequired", () => {
  it("recognises the server's marker", () => {
    // A bare 403 means "you may not do this" and must not put up a prompt.
    expect(
      isStepUpRequired({ response: { status: 403, data: { detail: "step_up_required" } } }),
    ).toBe(true);
    expect(isStepUpRequired({ response: { status: 403, data: { detail: "Forbidden" } } })).toBe(
      false,
    );
    expect(isStepUpRequired({ response: { status: 401 } })).toBe(false);
    expect(isStepUpRequired(new Error("network"))).toBe(false);
  });
});

describe("StepUpModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says what the user is about to do", async () => {
    // Re-authenticating without being told what for is how people confirm
    // things they did not mean to.
    renderModal({ action: "reset Dr Smith's second factor" });

    expect(
      await screen.findByText(/You are about to reset Dr Smith's second factor/),
    ).toBeInTheDocument();
  });

  it("verifies and hands control back to the caller", async () => {
    mockedStepUp.mockResolvedValue({});
    const { onVerified } = renderModal();

    submit("123456");

    await waitFor(() => expect(mockedStepUp).toHaveBeenCalledWith("123456"));
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
  });

  it("accepts the password too", async () => {
    // The same prompt has to serve users with no second factor.
    mockedStepUp.mockResolvedValue({});
    renderModal();

    submit("my-password");

    await waitFor(() => expect(mockedStepUp).toHaveBeenCalledWith("my-password"));
  });

  it("does not proceed when the answer is wrong", async () => {
    mockedStepUp.mockRejectedValue({ response: { status: 401 } });
    const { onVerified } = renderModal();

    submit("000000");

    expect(
      await screen.findByText("That code or password is not valid."),
    ).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("reports throttling separately from a wrong answer", async () => {
    mockedStepUp.mockRejectedValue({ response: { status: 429 } });
    renderModal();

    submit("000000");

    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
  });

  it("requires an answer before submitting", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Please enter a code or your password."),
    ).toBeInTheDocument();
    expect(mockedStepUp).not.toHaveBeenCalled();
  });
});
