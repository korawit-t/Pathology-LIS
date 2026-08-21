import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FinalizeReportPage from "./FinalizeReportPage";
import { ThemeProvider } from "../../../../contexts/ThemeContext";

vi.mock("../../../../services/surgicalReportService", () => ({
  default: { previewReportPdf: vi.fn().mockResolvedValue(new Blob()) },
}));
vi.mock("../../../../services/surgicalBlockStainService", () => ({
  default: { getStainOrdersByAccession: vi.fn().mockResolvedValue([]), updateStain: vi.fn() },
}));
vi.mock("../../../../services/notificationRuleService", () => ({
  default: { triggerEvent: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../../../components/CriticalNotificationSection", () => ({ default: () => null }));

/**
 * Mimics the real parent (index.tsx:1121): `initialData` built inline, so a new
 * object every render, and `loading` driven by the sign-out request.
 */
const Harness: React.FC<{ onConfirm: () => Promise<void> }> = ({ onConfirm }) => {
  const [loading, setLoading] = useState(false);
  return (
    <FinalizeReportPage
      open
      onCancel={() => {}}
      onConfirm={async () => {
        setLoading(true);
        await onConfirm();
        setLoading(false);
      }}
      loading={loading}
      caseId={1}
      accessionNo="S26-0001"
      initialData={{
        stain_quality: undefined,
        tissue_quality: undefined,
        slide_quality: undefined,
        quality_comment: undefined,
        is_pending: false,
        pending_reason: "",
      }}
    />
  );
};

/**
 * Quality picks live in component state and gate the sign-off button. Re-seeding
 * that state from `initialData` while the panel is open wipes them, and since
 * the caller builds `initialData` inline, "while the panel is open" means every
 * parent render — including the one `loading` causes on the very click being
 * made. The button then disables itself mid-request and stays that way, which
 * is what a pathologist sees as "Confirm & Sign Off does nothing any more".
 *
 * Asserted on the button rather than the radios: antd gives every Radio.Group
 * here the same `name="test-id"`, so the DOM treats all nine as one group and
 * only the last click reads as checked. React state is unaffected.
 */
it("keeps Confirm & Sign Off enabled across the in-flight sign-out", async () => {
  let release: () => void = () => {};
  const inflight = new Promise<void>((r) => { release = r; });

  render(
    <ThemeProvider>
      <Harness onConfirm={() => inflight} />
    </ThemeProvider>,
  );

  const goods = await screen.findAllByRole("radio", { name: "Good" });
  expect(goods).toHaveLength(3);
  goods.forEach((r) => fireEvent.click(r));

  const btn = screen.getByRole("button", { name: /Confirm & Sign Off/ });
  await waitFor(() => expect(btn).toBeEnabled());

  fireEvent.click(btn);
  await waitFor(() => expect(btn).toHaveClass("ant-btn-loading"));

  // Still in flight — this is where the step-up prompt sits.
  expect(btn, "in flight").toBeEnabled();

  // User answers the prompt / dismisses it: the request settles.
  release();
  await inflight;
  await waitFor(() => expect(btn).not.toHaveClass("ant-btn-loading"));

  expect(btn, "after the request settles").toBeEnabled();
});
