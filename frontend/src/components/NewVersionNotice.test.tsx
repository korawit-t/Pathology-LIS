import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewVersionNotice, { SNOOZE_MS } from "./NewVersionNotice";
import { useNewBuildAvailable } from "../hooks/useNewBuildAvailable";
import { reloadForNewBuild } from "../utils/staleBuild";
import SystemSettingService from "../services/systemSettingService";

vi.mock("../hooks/useNewBuildAvailable", () => ({ useNewBuildAvailable: vi.fn() }));
vi.mock("../services/systemSettingService", () => ({
  default: { getPublicSettings: vi.fn() },
}));
vi.mock("../utils/staleBuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/staleBuild")>()),
  reloadForNewBuild: vi.fn(),
}));

const TITLE = "มีระบบเวอร์ชันใหม่แล้ว";

// The notice lives in a portal; count only the ones still on their way in or
// shown (a dismissed one can linger mid-animation under jsdom).
const openNotices = () =>
  Array.from(document.querySelectorAll(".ant-notification-notice")).filter(
    (n) => !n.closest("[class*='-leave']") && !n.className.includes("-leave"),
  );

const renderNotice = () =>
  render(
    <AntdApp>
      <NewVersionNotice />
    </AntdApp>,
  );

beforeEach(() => {
  vi.mocked(useNewBuildAvailable).mockReturnValue(false);
  vi.mocked(SystemSettingService.getPublicSettings).mockResolvedValue({
    notify_new_build: true,
  } as Awaited<ReturnType<typeof SystemSettingService.getPublicSettings>>);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// What the component last asked the hook to do.
const pollingEnabled = () => vi.mocked(useNewBuildAvailable).mock.lastCall?.[0]?.enabled;

describe("NewVersionNotice", () => {
  it("shows nothing while this tab is on the current build", () => {
    renderNotice();
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("tells the user, and reloads only when they ask", async () => {
    vi.mocked(useNewBuildAvailable).mockReturnValue(true);
    renderNotice();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(reloadForNewBuild).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("รีเฟรช").closest("button")!);
    expect(reloadForNewBuild).toHaveBeenCalledTimes(1);
  });

  it("comes back after Later, once the snooze is up", async () => {
    vi.mocked(useNewBuildAvailable).mockReturnValue(true);
    renderNotice();
    await screen.findByText(TITLE);

    vi.useFakeTimers();
    fireEvent.click(screen.getByText("ภายหลัง").closest("button")!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(openNotices()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SNOOZE_MS);
    });
    expect(openNotices()).toHaveLength(1);
  });

  describe("the notify_new_build setting", () => {
    beforeEach(() => {
      vi.stubEnv("PROD", true);
    });

    it("polls when it is on", async () => {
      renderNotice();
      await waitFor(() => expect(pollingEnabled()).toBe(true));
    });

    it("doesn't poll when an admin turned it off", async () => {
      vi.mocked(SystemSettingService.getPublicSettings).mockResolvedValue({
        notify_new_build: false,
      } as Awaited<ReturnType<typeof SystemSettingService.getPublicSettings>>);
      renderNotice();
      await waitFor(() => expect(SystemSettingService.getPublicSettings).toHaveBeenCalled());
      await act(async () => {});
      expect(pollingEnabled()).toBe(false);
    });

    it("polls when the setting can't be read", async () => {
      vi.mocked(SystemSettingService.getPublicSettings).mockRejectedValue(new Error("offline"));
      renderNotice();
      await waitFor(() => expect(pollingEnabled()).toBe(true));
    });

    it("never polls under the dev server", async () => {
      vi.stubEnv("PROD", false);
      renderNotice();
      await waitFor(() => expect(SystemSettingService.getPublicSettings).toHaveBeenCalled());
      await act(async () => {});
      expect(pollingEnabled()).toBe(false);
    });
  });
});
