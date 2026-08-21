import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import StepUpGate from "./StepUpGate";
import AuthService from "../../services/authService";
import { requestStepUp } from "../../services/stepUpBroker";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../services/authService");

const mockedStepUp = AuthService.stepUp as unknown as ReturnType<typeof vi.fn>;

const renderGate = () =>
  render(
    <ThemeProvider>
      <StepUpGate />
    </ThemeProvider>,
  );

const confirm = (value: string) => {
  fireEvent.change(screen.getByPlaceholderText("Code or password"), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
};

describe("StepUpGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays out of the way until a request asks for it", () => {
    renderGate();

    expect(screen.queryByText("Confirm it is you")).not.toBeInTheDocument();
  });

  it("prompts on request and resolves so the caller can retry", async () => {
    // This is what turns a raw "step_up_required" error mid-sign-out into a
    // code prompt and a retried request.
    mockedStepUp.mockResolvedValue({});
    renderGate();

    const pending = requestStepUp("sign out this report");
    const resolved = vi.fn();
    pending.then(resolved);

    expect(
      await screen.findByText(/You are about to sign out this report/),
    ).toBeInTheDocument();

    confirm("123456");

    await waitFor(() => expect(mockedStepUp).toHaveBeenCalledWith("123456"));
    await pending;
    expect(resolved).toHaveBeenCalled();
  });

  it("rejects when dismissed, so the caller reports its own failure", async () => {
    renderGate();

    const pending = requestStepUp("sign out this report");
    await screen.findByText(/You are about to sign out this report/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(pending).rejects.toThrow(/cancelled/i);
  });

  it("asks once for requests that fail together", async () => {
    // A sign-out that fires several guarded calls should cost the user one
    // code, not one per call.
    mockedStepUp.mockResolvedValue({});
    renderGate();

    const first = requestStepUp("publish this report");
    const second = requestStepUp("publish this report");
    expect(second).toBe(first);

    await screen.findByText(/You are about to publish this report/);
    confirm("123456");

    await Promise.all([first, second]);
    expect(mockedStepUp).toHaveBeenCalledTimes(1);
  });

  it("lets a later request prompt again", async () => {
    // The grant is short-lived; a sign-out an hour later has to be able to ask.
    mockedStepUp.mockResolvedValue({});
    renderGate();

    const first = requestStepUp("sign out this report");
    await screen.findByText(/You are about to sign out this report/);
    confirm("123456");
    await first;

    const second = requestStepUp("change security settings");
    expect(second).not.toBe(first);
    expect(
      await screen.findByText(/You are about to change security settings/),
    ).toBeInTheDocument();
    confirm("123456");
    await second;
  });
});
