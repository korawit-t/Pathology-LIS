import { renderHook } from "@testing-library/react";
import { act } from "react";
import { App as AntdApp, Upload } from "antd";
import type { ReactNode } from "react";
import { useCaseFileUpload } from "./useCaseFileUpload";
import type { CaseFileService } from "./useCaseFileUpload";

const fakeService: CaseFileService = {
  uploadRequestFile: vi.fn(),
  deleteRequestFile: vi.fn(),
  downloadRequestFile: vi.fn(),
  downloadRequestFileBlob: vi.fn(),
};

// useCaseFileUpload's confirm dialogs call antd's static Modal.confirm,
// which needs a real <App> context in tests (same convention already used
// elsewhere in this repo for antd static-message call sites).
const wrapper = ({ children }: { children: ReactNode }) => <AntdApp>{children}</AntdApp>;

describe("useCaseFileUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("beforeUpload queuing (no case yet)", () => {
    it("queues a file locally with a pending- uid and originFileObj set", () => {
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      const file = new File(["x"], "request.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1024 });

      let outcome: unknown;
      act(() => {
        outcome = result.current.uploadProps.beforeUpload!(file as never, [] as never);
      });

      expect(outcome).toBe(Upload.LIST_IGNORE);
      expect(result.current.fileList).toHaveLength(1);
      expect(result.current.fileList[0].uid).toMatch(/^pending-/);
      expect(result.current.fileList[0].originFileObj).toBe(file);
      expect(fakeService.uploadRequestFile).not.toHaveBeenCalled();
    });

    it("rejects a file over 10MB before queuing", () => {
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      const file = new File(["x"], "big.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });

      act(() => {
        result.current.uploadProps.beforeUpload!(file as never, [] as never);
      });

      expect(result.current.fileList).toHaveLength(0);
    });
  });

  describe("flushPendingUploads", () => {
    it("uploads only originFileObj-bearing entries with the new case id", async () => {
      (fakeService.uploadRequestFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        message: "ok",
        file_id: 1,
      });
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      const file = new File(["x"], "request.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1024 });

      act(() => {
        result.current.uploadProps.beforeUpload!(file as never, [] as never);
      });
      // A saved (non-pending) entry already in the list must not be re-sent.
      act(() => {
        result.current.setFileList((prev) => [
          ...prev,
          { uid: "42", name: "already-saved.pdf", status: "done" },
        ]);
      });

      await act(async () => {
        await result.current.flushPendingUploads(99);
      });

      expect(fakeService.uploadRequestFile).toHaveBeenCalledTimes(1);
      expect(fakeService.uploadRequestFile).toHaveBeenCalledWith(99, file);
    });

    it("does not throw when a per-file upload fails, and still resolves", async () => {
      (fakeService.uploadRequestFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("network error"),
      );
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      const file = new File(["x"], "request.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1024 });

      act(() => {
        result.current.uploadProps.beforeUpload!(file as never, [] as never);
      });

      await expect(
        act(async () => {
          await result.current.flushPendingUploads(99);
        }),
      ).resolves.not.toThrow();
    });

    it("is a no-op when there are no pending files", async () => {
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });

      await act(async () => {
        await result.current.flushPendingUploads(99);
      });

      expect(fakeService.uploadRequestFile).not.toHaveBeenCalled();
    });
  });

  describe("handleConfirmDeleteFile", () => {
    it("removes a pending file locally without calling the service", () => {
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      act(() => {
        result.current.setFileList([
          { uid: "pending-abc", name: "f.pdf", status: "done" },
        ]);
      });

      act(() => {
        result.current.handleConfirmDeleteFile({ uid: "pending-abc", name: "f.pdf" } as never);
      });

      expect(result.current.fileList).toHaveLength(0);
      expect(fakeService.deleteRequestFile).not.toHaveBeenCalled();
    });
  });

  describe("toUploadFileList", () => {
    it("maps RequestFile[] to UploadFile[] including url", () => {
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      const mapped = result.current.toUploadFileList([
        { id: 5, file_name: "a.pdf", file_path: "/files/a.pdf", file_type: "application/pdf" } as never,
      ]);
      expect(mapped).toEqual([
        { uid: "5", name: "a.pdf", status: "done", url: "/files/a.pdf", type: "application/pdf" },
      ]);
    });

    it("returns an empty array for undefined input", () => {
      const { result } = renderHook(() => useCaseFileUpload(fakeService, null), { wrapper });
      expect(result.current.toUploadFileList(undefined)).toEqual([]);
    });
  });
});
