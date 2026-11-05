import { act, fireEvent, render, screen } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewVersionNotice, { SNOOZE_MS } from "./NewVersionNotice";
import { useNewBuildAvailable } from "../hooks/useNewBuildAvailable";
import { reloadForNewBuild } from "../utils/staleBuild";

vi.mock("../hooks/useNewBuildAvailable", () => ({ useNewBuildAvailable: vi.fn() }));
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
});

afterEach(() => {
  vi.useRealTimers();
});

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
});
