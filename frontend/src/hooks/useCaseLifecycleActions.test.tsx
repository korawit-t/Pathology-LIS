import { renderHook, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { App as AntdApp } from "antd";
import type { ReactNode } from "react";
import { useCaseLifecycleActions } from "./useCaseLifecycleActions";

const wrapper = ({ children }: { children: ReactNode }) => <AntdApp>{children}</AntdApp>;

const copy = {
  title: "Cancel this case?",
  prompt: "Please provide a reason for cancellation:",
  placeholder: "e.g. Wrong HN, Changed hospital, Other...",
};

// Modal.confirm renders into a portal with an exit animation, so a dialog
// from a prior test can still be mid-removal when the next one starts.
// Scoping to the most-recently-opened dialog sidesteps that timing
// entirely, rather than trying to force synchronous cleanup between tests.
const latestDialog = async () => {
  const dialogs = await screen.findAllByRole("dialog");
  return within(dialogs[dialogs.length - 1]);
};

describe("useCaseLifecycleActions", () => {

  describe("handleDelete", () => {
    it("calls deleteFn with editingId, reports success, and calls onSuccess(null)", async () => {
      const deleteFn = vi.fn().mockResolvedValue(undefined);
      const cancelFn = vi.fn();
      const onSuccess = vi.fn();
      const setLoading = vi.fn();
      const { result } = renderHook(
        () => useCaseLifecycleActions(42, deleteFn, cancelFn, copy, onSuccess, setLoading),
        { wrapper },
      );

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(deleteFn).toHaveBeenCalledWith(42);
      expect(onSuccess).toHaveBeenCalledWith(null);
      expect(setLoading).toHaveBeenCalledWith(true);
      expect(setLoading).toHaveBeenLastCalledWith(false);
    });

    it("is a no-op when editingId is null", async () => {
      const deleteFn = vi.fn();
      const { result } = renderHook(
        () => useCaseLifecycleActions(null, deleteFn, vi.fn(), copy, vi.fn(), vi.fn()),
        { wrapper },
      );

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(deleteFn).not.toHaveBeenCalled();
    });

    it("does not call onSuccess when deleteFn rejects", async () => {
      const deleteFn = vi.fn().mockRejectedValue(new Error("network error"));
      const onSuccess = vi.fn();
      const setLoading = vi.fn();
      const { result } = renderHook(
        () => useCaseLifecycleActions(42, deleteFn, vi.fn(), copy, onSuccess, setLoading),
        { wrapper },
      );

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(onSuccess).not.toHaveBeenCalled();
      expect(setLoading).toHaveBeenLastCalledWith(false);
    });
  });

  describe("handleCancel", () => {
    it("renders the caller's cancel copy verbatim", async () => {
      const { result } = renderHook(
        () => useCaseLifecycleActions(42, vi.fn(), vi.fn(), copy, vi.fn(), vi.fn()),
        { wrapper },
      );

      act(() => {
        result.current.handleCancel();
      });

      const dialog = await latestDialog();
      expect(dialog.getByText(copy.prompt)).toBeInTheDocument();
      expect(dialog.getByPlaceholderText(copy.placeholder)).toBeInTheDocument();
    });

    it("rejects an empty reason, then succeeds once a reason is provided in the same dialog", async () => {
      // onOk returning a rejected promise keeps the dialog open for another
      // attempt — exercised here as one continuous flow (submit empty, see
      // the warning, type a reason, resubmit) in a single dialog instance,
      // matching how a real user would retry without a fresh handleCancel()
      // call in between.
      const cancelFn = vi.fn().mockResolvedValue(undefined);
      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useCaseLifecycleActions(42, vi.fn(), cancelFn, copy, onSuccess, vi.fn()),
        { wrapper },
      );

      act(() => {
        result.current.handleCancel();
      });
      const dialog = await latestDialog();

      fireEvent.click(dialog.getByRole("button", { name: /Confirm Cancel/i }));
      // message.warning renders into its own toast portal, separate from
      // the modal dialog — query the whole document, not the dialog scope.
      await waitFor(() =>
        expect(screen.getByText(/provide a reason before cancelling/i)).toBeInTheDocument(),
      );
      expect(cancelFn).not.toHaveBeenCalled();

      // Re-fetch: antd's Modal.confirm re-creates part of the DOM on an
      // onOk rejection, so the dialog reference from before that first
      // click can no longer be the one the user (and this test) interacts
      // with next.
      const retryDialog = await latestDialog();
      fireEvent.change(retryDialog.getByPlaceholderText(copy.placeholder), {
        target: { value: "Wrong HN entered" },
      });
      fireEvent.click(retryDialog.getByRole("button", { name: /Confirm Cancel/i }));

      await waitFor(() => expect(cancelFn).toHaveBeenCalledWith(42, "Wrong HN entered"));
      expect(onSuccess).toHaveBeenCalledWith(null);
    });
  });
});
