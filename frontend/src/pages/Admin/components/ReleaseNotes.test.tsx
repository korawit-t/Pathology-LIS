import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReleaseNotes from "./ReleaseNotes";
import { RELEASE_NOTES } from "../../../constants/releaseNotes";
import pkg from "../../../../package.json";

const header = (version: string) =>
  screen.getByText(`v${version}`).closest(".ant-collapse-item") as HTMLElement;

describe("RELEASE_NOTES", () => {
  it("leads with the version being released", () => {
    // A release that bumps package.json without adding its notes here would
    // show admins the previous version's notes as if they were current.
    expect(RELEASE_NOTES[0].version).toBe(pkg.version);
  });

  it("lists each version once, newest first, with a date and something in it", () => {
    const versions = RELEASE_NOTES.map((n) => n.version);
    expect(new Set(versions).size).toBe(versions.length);
    const dates = RELEASE_NOTES.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const note of RELEASE_NOTES) {
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((note.added?.length ?? 0) + (note.fixed?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});

describe("ReleaseNotes", () => {
  it("opens the installed version's notes and marks it", () => {
    const current = RELEASE_NOTES[1];
    render(<ReleaseNotes currentVersion={current.version} />);

    const item = header(current.version);
    expect(item).toHaveClass("ant-collapse-item-active");
    expect(item).toHaveTextContent("เวอร์ชันนี้");
    expect(item).toHaveTextContent(current.summary);
    expect(header(RELEASE_NOTES[0].version)).not.toHaveClass("ant-collapse-item-active");
  });

  it("shows what to check before upgrading ahead of the changes", () => {
    const note = RELEASE_NOTES[0];
    render(<ReleaseNotes currentVersion={note.version} />);

    const text = header(note.version).textContent ?? "";
    expect(text.indexOf("ก่อนอัปเดต")).toBeGreaterThan(-1);
    expect(text.indexOf("ก่อนอัปเดต")).toBeLessThan(text.indexOf("แก้ไข"));
    for (const item of note.upgrade ?? []) expect(text).toContain(item);
  });

  it("opens the newest notes on a build with no version of its own", () => {
    render(<ReleaseNotes currentVersion="dev" />);

    expect(header(RELEASE_NOTES[0].version)).toHaveClass("ant-collapse-item-active");
    expect(screen.queryByText("เวอร์ชันนี้")).not.toBeInTheDocument();
  });
});
