import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FinalizeReportPage from "./FinalizeReportPage";
import { ThemeProvider } from "../../../../contexts/ThemeContext";
import SurgicalBlockStainService from "../../../../services/surgicalBlockStainService";
import type { SignOffStain } from "../../../../types/stains";

vi.mock("../../../../services/surgicalReportService", () => ({
  default: { previewReportPdf: vi.fn().mockResolvedValue(new Blob()) },
}));
vi.mock("../../../../services/surgicalBlockStainService", () => ({
  default: { getSignOffStains: vi.fn().mockResolvedValue([]), updateStain: vi.fn().mockResolvedValue({}) },
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

/**
 * Sign-off is the "result is out" cut-off for additional stains: signed as
 * complete, the backend records every slide listed here as reported; signed
 * "No, Pending", only the reviewed ones. The warning has to say which way the
 * switch will count them, since nothing else on the page does.
 */
const stain = (over: Partial<SignOffStain>): SignOffStain => ({
  stain_id: 1,
  block_code: "A1",
  test_name: "CD20",
  category: "IHC",
  status: "stained",
  is_external: true,
  reported_at: null,
  ...over,
});

const renderWithStains = (stains: SignOffStain[]) => {
  vi.mocked(SurgicalBlockStainService.getSignOffStains).mockResolvedValueOnce(stains);
  render(
    <ThemeProvider>
      <Harness onConfirm={async () => {}} />
    </ThemeProvider>,
  );
};

it("tells the pathologist how the completion switch counts the listed stains", async () => {
  renderWithStains([
    stain({ stain_id: 7 }),
    stain({ stain_id: 8, block_code: "A2", test_name: "Ki-67", status: "sent" }),
    stain({ stain_id: 9, block_code: "A3", test_name: "GMS", category: "Histochem", status: "pending", is_external: false }),
    // Reported by an earlier sign-off: nothing left to say about it.
    stain({ stain_id: 10, block_code: "A4", test_name: "CD3", status: "completed", reported_at: "2026-11-01T10:00:00" }),
  ]);

  expect(await screen.findByText("1 stain awaiting review")).toBeInTheDocument();
  expect(screen.getByText("A1 — CD20 (Outlab)")).toBeInTheDocument();
  expect(screen.getByText("Signing off as complete records these as reported.")).toBeInTheDocument();

  expect(screen.getByText("2 stains not back yet")).toBeInTheDocument();
  expect(screen.getByText("A2 — Ki-67 (at outlab)")).toBeInTheDocument();
  expect(screen.getByText("A3 — GMS (not stained yet)")).toBeInTheDocument();
  expect(screen.getByText(/These stay open until an Addendum carries them/)).toBeInTheDocument();
  expect(screen.queryByText(/CD3/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("switch", { name: /Yes, Signed Off/ }));

  expect(
    await screen.findByText(
      "These stay open while the report is pending — use Mark All as Reviewed for any already in this report.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("These stay open until a later sign-off carries them.")).toBeInTheDocument();
  expect(screen.queryByText("Signing off as complete records these as reported.")).not.toBeInTheDocument();
});

it("loads the case's stains by case id", async () => {
  renderWithStains([]);
  await waitFor(() => expect(SurgicalBlockStainService.getSignOffStains).toHaveBeenCalledWith(1));
  expect(screen.queryByText(/awaiting review|not back yet/)).not.toBeInTheDocument();
});

/**
 * The list used to come from the routine-H&E sticker endpoint, whose rows carry
 * `id`, not `stain_id`, so Mark All as Reviewed would have PATCHed
 * /surgical-block-stains/undefined.
 */
it("marks the listed stains reviewed by their stain ids", async () => {
  renderWithStains([stain({ stain_id: 7 }), stain({ stain_id: 8, block_code: "B1" })]);

  fireEvent.click(await screen.findByRole("button", { name: /Mark All as Reviewed/ }));

  await waitFor(() => expect(SurgicalBlockStainService.updateStain).toHaveBeenCalledTimes(2));
  expect(vi.mocked(SurgicalBlockStainService.updateStain).mock.calls.map((c) => c[0]).sort()).toEqual([7, 8]);
  await waitFor(() => expect(screen.queryByText(/awaiting review/)).not.toBeInTheDocument());
});
