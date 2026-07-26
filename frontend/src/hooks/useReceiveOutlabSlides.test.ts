import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { useReceiveOutlabSlides } from "./useReceiveOutlabSlides";
import SurgicalBlockStainService from "../services/surgicalBlockStainService";

vi.mock("../services/surgicalBlockStainService", () => ({
  default: { receiveOutlabRunDetails: vi.fn() },
}));

const mockReceive = SurgicalBlockStainService.receiveOutlabRunDetails as ReturnType<typeof vi.fn>;

describe("useReceiveOutlabSlides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls receiveOutlabRunDetails once per run and reports success", async () => {
    mockReceive.mockResolvedValue({});
    const { result } = renderHook(() => useReceiveOutlabSlides());

    let outcome;
    await act(async () => {
      outcome = await result.current.receiveSelected({ 1: [100, 101], 2: [200] });
    });

    expect(mockReceive).toHaveBeenCalledWith(1, [100, 101]);
    expect(mockReceive).toHaveBeenCalledWith(2, [200]);
    expect(outcome).toEqual({ receivedCount: 3, failedRunIds: [] });
  });

  it("reports failedRunIds for a partial failure without failing the whole call", async () => {
    mockReceive.mockImplementation((runId: number) =>
      runId === 1 ? Promise.resolve({}) : Promise.reject(new Error("network error")),
    );
    const { result } = renderHook(() => useReceiveOutlabSlides());

    let outcome;
    await act(async () => {
      outcome = await result.current.receiveSelected({ 1: [100], 2: [200] });
    });

    expect(outcome).toEqual({ receivedCount: 2, failedRunIds: ["2"] });
  });

  it("reports all run ids as failed when every run fails", async () => {
    mockReceive.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useReceiveOutlabSlides());

    let outcome;
    await act(async () => {
      outcome = await result.current.receiveSelected({ 1: [100], 2: [200] });
    });

    expect(outcome).toEqual({ receivedCount: 2, failedRunIds: ["1", "2"] });
  });

  it("skips runs with no ids and returns early without calling the service for an all-empty input", async () => {
    const { result } = renderHook(() => useReceiveOutlabSlides());

    let outcome;
    await act(async () => {
      outcome = await result.current.receiveSelected({ 1: [], 2: [] });
    });

    expect(mockReceive).not.toHaveBeenCalled();
    expect(outcome).toEqual({ receivedCount: 0, failedRunIds: [] });
  });

  it("tracks the receiving flag across the call", async () => {
    let resolveReceive: (() => void) | undefined;
    mockReceive.mockReturnValue(new Promise<void>((resolve) => { resolveReceive = resolve; }));
    const { result } = renderHook(() => useReceiveOutlabSlides());

    expect(result.current.receiving).toBe(false);
    let callPromise: Promise<unknown>;
    act(() => {
      callPromise = result.current.receiveSelected({ 1: [100] });
    });
    await waitFor(() => expect(result.current.receiving).toBe(true));

    await act(async () => {
      resolveReceive?.();
      await callPromise;
    });
    expect(result.current.receiving).toBe(false);
  });
});
