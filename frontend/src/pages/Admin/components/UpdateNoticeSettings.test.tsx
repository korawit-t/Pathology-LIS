import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UpdateNoticeSettings from "./UpdateNoticeSettings";
import SystemSettingService from "../../../services/systemSettingService";
import type { SystemSetting } from "../../../types/system";

vi.mock("../../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));

const RELEASE = "แจ้ง admin เมื่อมี release ใหม่";
const BUILD = "แจ้งผู้ใช้ให้รีเฟรชหลัง deploy";

const settings = (over: Partial<SystemSetting> = {}) =>
  ({ id: 1, notify_new_release: true, notify_new_build: true, ...over }) as SystemSetting;

const toggle = (name: string) => screen.getByRole("switch", { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(SystemSettingService.getSettings).mockResolvedValue(settings());
  vi.mocked(SystemSettingService.updateSettings).mockResolvedValue(settings());
});

describe("UpdateNoticeSettings", () => {
  it("shows what the server has", async () => {
    vi.mocked(SystemSettingService.getSettings).mockResolvedValue(
      settings({ notify_new_release: false }),
    );
    render(<UpdateNoticeSettings />);
    await waitFor(() => expect(toggle(RELEASE)).not.toBeDisabled());
    expect(toggle(RELEASE)).not.toBeChecked();
    expect(toggle(BUILD)).toBeChecked();
  });

  it("saves a switch the moment it is flipped, and only that one", async () => {
    const onChange = vi.fn();
    render(<UpdateNoticeSettings onChange={onChange} />);
    await waitFor(() => expect(toggle(BUILD)).not.toBeDisabled());

    fireEvent.click(toggle(BUILD));

    await waitFor(() =>
      expect(SystemSettingService.updateSettings).toHaveBeenCalledWith({ notify_new_build: false }),
    );
    await waitFor(() => expect(toggle(BUILD)).not.toBeChecked());
    expect(onChange).toHaveBeenCalledWith("notify_new_build", false);
  });

  it("stays as it was when the save fails", async () => {
    vi.mocked(SystemSettingService.updateSettings).mockRejectedValue(new Error("500"));
    const onChange = vi.fn();
    render(<UpdateNoticeSettings onChange={onChange} />);
    await waitFor(() => expect(toggle(RELEASE)).not.toBeDisabled());

    fireEvent.click(toggle(RELEASE));

    await waitFor(() => expect(SystemSettingService.updateSettings).toHaveBeenCalled());
    await waitFor(() => expect(toggle(RELEASE)).not.toHaveClass("ant-switch-loading"));
    expect(toggle(RELEASE)).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("can't be flipped before the settings have loaded", () => {
    vi.mocked(SystemSettingService.getSettings).mockReturnValue(new Promise(() => {}));
    render(<UpdateNoticeSettings />);
    expect(toggle(RELEASE)).toBeDisabled();
    expect(toggle(BUILD)).toBeDisabled();
  });
});
