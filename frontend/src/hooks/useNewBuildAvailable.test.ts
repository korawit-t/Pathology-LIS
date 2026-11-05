import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNewBuildAvailable } from "./useNewBuildAvailable";
import { STALE_BUILD_EVENT } from "../utils/staleBuild";

const INTERVAL = 5 * 60 * 1000;

const serving = (buildId: string) => ({ ok: true, json: async () => ({ version: "3.0.0", buildId }) });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const opts = { enabled: true, currentBuildId: "build-A", intervalMs: INTERVAL };

describe("useNewBuildAvailable", () => {
  it("stays false while the server serves this tab's build", async () => {
    fetchMock.mockResolvedValue(serving("build-A"));
    const { result } = renderHook(() => useNewBuildAvailable(opts));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it("turns true when the server serves another build", async () => {
    fetchMock.mockResolvedValue(serving("build-B"));
    const { result } = renderHook(() => useNewBuildAvailable(opts));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("asks for version.json past every cache", async () => {
    fetchMock.mockResolvedValue(serving("build-A"));
    renderHook(() => useNewBuildAvailable(opts));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/version\.json\?t=\d+$/);
    expect(init).toEqual({ cache: "no-store" });
  });

  it("notices a deploy on a later poll", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(serving("build-A")).mockResolvedValue(serving("build-B"));
    const { result } = renderHook(() => useNewBuildAvailable(opts));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL);
    });
    expect(result.current).toBe(true);
  });

  it("stops polling once it has seen a new build", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(serving("build-B"));
    renderHook(() => useNewBuildAvailable(opts));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a failed or non-OK answer (mid-deploy)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network")).mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.useFakeTimers();
    const { result } = renderHook(() => useNewBuildAvailable(opts));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(false);
  });

  it("checks again when the tab comes back, but not twice within a minute", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(serving("build-A"));
    renderHook(() => useNewBuildAvailable(opts));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61 * 1000);
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes no request when disabled (dev server)", async () => {
    vi.useFakeTimers();
    renderHook(() => useNewBuildAvailable({ ...opts, enabled: false }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns true on a stale-chunk report, even when polling is off", async () => {
    const { result } = renderHook(() => useNewBuildAvailable({ ...opts, enabled: false }));
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event(STALE_BUILD_EVENT));
    });
    expect(result.current).toBe(true);
  });
});
