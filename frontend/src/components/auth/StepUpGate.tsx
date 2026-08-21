import React, { useCallback, useEffect, useRef, useState } from "react";

import StepUpModal from "./StepUpModal";
import { registerStepUpPrompt } from "../../services/stepUpBroker";

/**
 * Hosts the one step-up prompt for the whole app.
 *
 * Mounted once at the root so any request the server refuses with
 * step_up_required can put the prompt up and then be retried, instead of every
 * page having to catch that refusal itself — see services/stepUpBroker.ts.
 */
const StepUpGate: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string | undefined>(undefined);
  const pending = useRef<{
    resolve: () => void;
    reject: (reason: unknown) => void;
  } | null>(null);

  useEffect(() => {
    registerStepUpPrompt(
      (nextAction) =>
        new Promise<void>((resolve, reject) => {
          pending.current = { resolve, reject };
          setAction(nextAction);
          setOpen(true);
        }),
    );
    return () => registerStepUpPrompt(null);
  }, []);

  const settle = useCallback((verified: boolean) => {
    const waiting = pending.current;
    pending.current = null;
    setOpen(false);
    if (!waiting) return;
    if (verified) waiting.resolve();
    else waiting.reject(new Error("Step-up cancelled"));
  }, []);

  return (
    <StepUpModal
      open={open}
      action={action}
      onCancel={() => settle(false)}
      onVerified={() => settle(true)}
    />
  );
};

export default StepUpGate;
