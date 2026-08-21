/**
 * Bridges the axios layer to the step-up prompt.
 *
 * The server refuses irreversible actions with 403 step_up_required (see
 * backend/app/dependencies/step_up.py), and signing out a report is one of
 * them. That refusal can come back from any request on any page, so the prompt
 * cannot live with the caller — every sign-out button would need its own copy,
 * and the ones that never got one show the raw "step_up_required" detail to a
 * pathologist in the middle of releasing a result.
 *
 * StepUpGate registers the real prompt here once, at the root; the response
 * interceptor in httpClient asks for it and retries the request once it
 * resolves.
 */

declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * What the user is about to do, e.g. "sign out this report" — shown in the
     * prompt so the confirmation says what it is confirming.
     */
    stepUpAction?: string;
  }
}

type StepUpPrompt = (action?: string) => Promise<void>;

let prompt: StepUpPrompt | null = null;
let inflight: Promise<void> | null = null;

export const registerStepUpPrompt = (fn: StepUpPrompt | null): void => {
  prompt = fn;
};

/**
 * Resolves once the factor has been re-checked, rejects if the user dismisses
 * the prompt.
 *
 * Concurrent callers share one prompt: a page that fires several guarded
 * requests at once should ask for a code once, not once per request.
 */
export const requestStepUp = (action?: string): Promise<void> => {
  if (inflight) return inflight;
  if (!prompt) {
    return Promise.reject(new Error("Step-up prompt is not mounted"));
  }
  const pending = prompt(action);
  inflight = pending;
  const clear = () => {
    if (inflight === pending) inflight = null;
  };
  pending.then(clear, clear);
  return pending;
};
