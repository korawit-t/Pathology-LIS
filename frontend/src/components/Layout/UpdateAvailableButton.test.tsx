import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UpdateAvailableButton from "./UpdateAvailableButton";
import VersionService from "../../services/versionService";
import type { UpdateStatus } from "../../types/version";

vi.mock("../../services/versionService", () => ({
  default: { getVersion: vi.fn(), getUpdateStatus: vi.fn() },
}));

const RELEASE_URL = "https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.1.0";

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  enabled: true,
  repo: "korawit-t/Pathology-LIS",
  current_version: "3.0.0",
  latest_version: "3.1.0",
  update_available: true,
  major_update: false,
  release_url: RELEASE_URL,
  published_at: "2026-11-20T03:00:00Z",
  checked_at: "2026-11-20T04:00:00Z",
  error: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("UpdateAvailableButton", () => {
  it("doesn't ask the admin-only endpoint for anyone else", () => {
    render(<UpdateAvailableButton isAdmin={false} />);
    expect(VersionService.getUpdateStatus).not.toHaveBeenCalled();
  });

  it("links an admin to the newer release's notes", async () => {
    vi.mocked(VersionService.getUpdateStatus).mockResolvedValue(status());
    render(<UpdateAvailableButton isAdmin />);
    const link = await screen.findByRole("link", { name: "มีเวอร์ชันใหม่" });
    expect(link).toHaveAttribute("href", RELEASE_URL);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("stays hidden while up to date", async () => {
    vi.mocked(VersionService.getUpdateStatus).mockResolvedValue(
      status({ update_available: false, latest_version: "3.0.0" }),
    );
    render(<UpdateAvailableButton isAdmin />);
    await waitFor(() => expect(VersionService.getUpdateStatus).toHaveBeenCalled());
    expect(screen.queryByLabelText("มีเวอร์ชันใหม่")).not.toBeInTheDocument();
  });

  it("stays hidden when the check fails", async () => {
    vi.mocked(VersionService.getUpdateStatus).mockRejectedValue(new Error("404"));
    render(<UpdateAvailableButton isAdmin />);
    await waitFor(() => expect(VersionService.getUpdateStatus).toHaveBeenCalled());
    expect(screen.queryByLabelText("มีเวอร์ชันใหม่")).not.toBeInTheDocument();
  });
});
