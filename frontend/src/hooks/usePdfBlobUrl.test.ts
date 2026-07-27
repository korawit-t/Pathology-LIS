import { renderHook, waitFor } from "@testing-library/react";
import { usePdfBlobUrl } from "./usePdfBlobUrl";

const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  mockCreateObjectURL.mockImplementation(() => `blob:mock-${++counter}`);
  globalThis.URL.createObjectURL = mockCreateObjectURL;
  globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
});

const makeBlob = () => new Blob(["fake"], { type: "application/pdf" });

describe("usePdfBlobUrl", () => {
  it("stays null and never fetches when fetchFn is null", async () => {
    const { result } = renderHook(() => usePdfBlobUrl(null));
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });

  it("sets url from the resolved blob and toggles loading", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeBlob());
    const { result } = renderHook(() => usePdfBlobUrl(fetchFn));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.url).toBe("blob:mock-1");
  });

  it("revokes the previous url when fetchFn identity changes", async () => {
    const fetchFn1 = vi.fn().mockResolvedValue(makeBlob());
    const { result, rerender } = renderHook(({ fn }) => usePdfBlobUrl(fn), {
      initialProps: { fn: fetchFn1 },
    });
    await waitFor(() => expect(result.current.url).toBe("blob:mock-1"));

    const fetchFn2 = vi.fn().mockResolvedValue(makeBlob());
    rerender({ fn: fetchFn2 });

    await waitFor(() => expect(result.current.url).toBe("blob:mock-2"));
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("revokes the current url on unmount", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeBlob());
    const { result, unmount } = renderHook(() => usePdfBlobUrl(fetchFn));
    await waitFor(() => expect(result.current.url).toBe("blob:mock-1"));

    unmount();

    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("calls onError and clears loading on a rejected fetch, leaving url untouched", async () => {
    const onError = vi.fn();
    const err = new Error("network down");
    const fetchFn = vi.fn().mockRejectedValue(err);
    const { result } = renderHook(() => usePdfBlobUrl(fetchFn, { onError }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onError).toHaveBeenCalledWith(err);
    expect(result.current.url).toBeNull();
  });

  it("delays the fetch call by debounceMs", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeBlob());
    renderHook(() => usePdfBlobUrl(fetchFn, { debounceMs: 30 }));

    expect(fetchFn).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1), { timeout: 1000 });
  });
});
