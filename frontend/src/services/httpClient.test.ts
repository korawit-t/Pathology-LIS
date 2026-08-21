import type { InternalAxiosRequestConfig } from "axios";
import { message } from "antd";

import api from "./httpClient";
import { registerStepUpPrompt } from "./stepUpBroker";

const stepUpRefusal = (config: InternalAxiosRequestConfig) =>
  Object.assign(new Error("Request failed with status code 403"), {
    config,
    response: { status: 403, data: { detail: "step_up_required" } },
  });

describe("httpClient step-up handling", () => {
  afterEach(() => {
    registerStepUpPrompt(null);
    delete api.defaults.adapter;
  });

  it("prompts and retries the request that was refused", async () => {
    // Without this the pathologist sees the raw "step_up_required" detail as
    // an error message instead of a code prompt.
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      if (attempts === 1) throw stepUpRefusal(config as InternalAxiosRequestConfig);
      return { status: 200, statusText: "OK", data: { id: 1 }, headers: {}, config };
    };
    const prompt = vi.fn().mockResolvedValue(undefined);
    registerStepUpPrompt(prompt);

    const res = await api.post("/surgical-reports/1/finalize-snapshot", {}, {
      stepUpAction: "sign out this report",
    });

    expect(prompt).toHaveBeenCalledWith("sign out this report");
    expect(attempts).toBe(2);
    expect(res.data).toEqual({ id: 1 });
  });

  it("gives up rather than looping when the retry is refused too", async () => {
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      throw stepUpRefusal(config as InternalAxiosRequestConfig);
    };
    registerStepUpPrompt(vi.fn().mockResolvedValue(undefined));

    await expect(api.post("/system-settings/update", {})).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(attempts).toBe(2);
  });

  it("explains an overdue enrolment instead of echoing the marker", async () => {
    // A grace period that runs out mid-session lands here; ProtectedRoute only
    // checks it at login.
    api.defaults.adapter = async (config) => {
      throw Object.assign(new Error("Request failed with status code 403"), {
        config,
        response: { status: 403, data: { detail: "mfa_setup_required" } },
      });
    };
    const warn = vi.spyOn(message, "warning");

    await expect(
      api.post("/surgical-reports/1/finalize-snapshot", {}),
    ).rejects.toMatchObject({ __stepUpHandled: true });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("two-factor authentication"),
      4,
    );
    warn.mockRestore();
  });

  it("marks the error when the prompt is dismissed", async () => {
    // The marker is what stops a page-level handler putting a second prompt up
    // on top of the one the user just closed.
    api.defaults.adapter = async (config) => {
      throw stepUpRefusal(config as InternalAxiosRequestConfig);
    };
    registerStepUpPrompt(vi.fn().mockRejectedValue(new Error("Step-up cancelled")));

    await expect(api.post("/users/1/mfa/reset")).rejects.toMatchObject({
      __stepUpHandled: true,
    });
  });
});
