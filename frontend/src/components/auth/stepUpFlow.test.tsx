import type { InternalAxiosRequestConfig } from "axios";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import StepUpGate from "./StepUpGate";
import api from "../../services/httpClient";
import AuthService from "../../services/authService";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../services/authService");

const mockedStepUp = AuthService.stepUp as unknown as ReturnType<typeof vi.fn>;

/**
 * The two halves wired together, with nothing between them stubbed: an
 * interceptor that never reaches a mounted prompt is exactly the failure that
 * put "step_up_required" on a pathologist's screen in the first place.
 */
describe("step-up, end to end through the real client", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete api.defaults.adapter;
  });

  it("turns a refused sign-out into a prompt and a signed-out report", async () => {
    let stepUpDone = false;
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      if (!stepUpDone) {
        throw Object.assign(new Error("Request failed with status code 403"), {
          config: config as InternalAxiosRequestConfig,
          response: { status: 403, data: { detail: "step_up_required" } },
        });
      }
      return {
        status: 200,
        statusText: "OK",
        data: { id: 7, status: "published" },
        headers: {},
        config,
      };
    };
    // Standing in for the server setting the step_up cookie.
    mockedStepUp.mockImplementation(async () => {
      stepUpDone = true;
      return {};
    });

    render(
      <ThemeProvider>
        <StepUpGate />
      </ThemeProvider>,
    );

    const signOut = api.post(
      "/surgical-reports/1/finalize-snapshot",
      { diagnoses: [] },
      { stepUpAction: "sign out this report" },
    );

    expect(
      await screen.findByText(/You are about to sign out this report/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Code or password"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const res = await signOut;
    expect(res.data).toEqual({ id: 7, status: "published" });
    expect(attempts).toBe(2);
    // antd keeps the node around for the close transition, so "gone" here
    // means hidden, not unmounted.
    await waitFor(() =>
      expect(screen.getByText("Confirm it is you")).not.toBeVisible(),
    );
    expect(mockedStepUp).toHaveBeenCalledTimes(1);
  });
});
