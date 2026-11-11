/**
 * The sign-off stain notices, as the non-gyne page uses them: no outlab step,
 * so nothing reads "Outlab" / "at outlab" / "not sent yet" even for a test
 * flagged external, and Mark All goes through the page's own update call.
 * (Surgical use is covered by FinalizeReportPage.test.tsx.)
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SignOffStainNotices from "./SignOffStainNotices";
import type { SignOffStain } from "../types/stains";

const stain = (over: Partial<SignOffStain>): SignOffStain => ({
  stain_id: 1,
  block_code: null,
  test_name: "CK7",
  category: "IHC",
  status: "stained",
  is_external: true,
  reported_at: null,
  ...over,
});

it("lists non-gyne stains without outlab wording and marks them reviewed", async () => {
  const fetchStains = vi.fn().mockResolvedValue([
    stain({ stain_id: 3 }),
    stain({ stain_id: 4, test_name: "TTF-1", status: "pending" }),
  ]);
  const markReviewed = vi.fn().mockResolvedValue({});

  render(
    <SignOffStainNotices
      open
      caseId={9}
      isPending={false}
      fetchStains={fetchStains}
      markReviewed={markReviewed}
      hasOutlab={false}
    />,
  );

  expect(await screen.findByText("1 stain awaiting review")).toBeInTheDocument();
  expect(fetchStains).toHaveBeenCalledWith(9);
  expect(screen.getByText("CK7")).toBeInTheDocument();          // no block code, no "(Outlab)"
  expect(screen.getByText("TTF-1 (not stained yet)")).toBeInTheDocument();
  expect(screen.queryByText(/outlab|not sent yet/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Mark All as Reviewed/ }));

  await waitFor(() => expect(markReviewed).toHaveBeenCalledWith(3));
  expect(markReviewed).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByText(/awaiting review/)).not.toBeInTheDocument());
});

it("loads nothing while closed", () => {
  const fetchStains = vi.fn().mockResolvedValue([]);
  render(
    <SignOffStainNotices open={false} caseId={9} isPending={false} fetchStains={fetchStains} markReviewed={vi.fn()} />,
  );
  expect(fetchStains).not.toHaveBeenCalled();
});
