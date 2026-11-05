import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LatestRelease from "./LatestRelease";
import type { UpdateStatus } from "../../../types/version";

const RELEASE_URL = "https://github.com/korawit-t/Pathology-LIS/releases/tag/v4.0.0";

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  enabled: true,
  repo: "korawit-t/Pathology-LIS",
  current_version: "3.0.0",
  latest_version: "3.0.0",
  update_available: false,
  major_update: false,
  release_url: null,
  published_at: null,
  checked_at: "2026-11-20T04:00:00Z",
  error: null,
  ...over,
});

describe("LatestRelease", () => {
  it("says so when up to date", () => {
    render(<LatestRelease status={status()} />);
    expect(screen.getByText("v3.0.0")).toBeInTheDocument();
    expect(screen.getByText("เป็นเวอร์ชันล่าสุดแล้ว")).toBeInTheDocument();
    expect(screen.getByText(/เช็คล่าสุด/)).toBeInTheDocument();
  });

  it("links a newer release, and flags a MAJOR one", () => {
    render(
      <LatestRelease
        status={status({
          latest_version: "4.0.0",
          update_available: true,
          major_update: true,
          release_url: RELEASE_URL,
        })}
      />,
    );
    expect(screen.getByText("v4.0.0")).toBeInTheDocument();
    expect(screen.getByText("มีเวอร์ชันใหม่")).toBeInTheDocument();
    expect(screen.getByText("release notes").closest("a")).toHaveAttribute("href", RELEASE_URL);
    expect(screen.getByText(/อ่าน upgrade notes ก่อนอัปเดต/)).toBeInTheDocument();
  });

  it("doesn't flag a MINOR release as MAJOR", () => {
    render(
      <LatestRelease
        status={status({ latest_version: "3.1.0", update_available: true, release_url: RELEASE_URL })}
      />,
    );
    expect(screen.queryByText(/อ่าน upgrade notes/)).not.toBeInTheDocument();
  });

  it("explains a failed check instead of claiming it's up to date", () => {
    render(<LatestRelease status={status({ latest_version: null, error: "unreachable" })} />);
    expect(screen.getByText("เชื่อมต่อ GitHub ไม่ได้")).toBeInTheDocument();
    expect(screen.queryByText("เป็นเวอร์ชันล่าสุดแล้ว")).not.toBeInTheDocument();
  });

  it("names the setting when the check is off", () => {
    render(<LatestRelease status={status({ enabled: false, checked_at: null })} />);
    expect(screen.getByText(/UPDATE_CHECK_REPO/)).toBeInTheDocument();
  });
});
