import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StaleChunkBoundary from "./StaleChunkBoundary";
import { reloadForNewBuild } from "../utils/staleBuild";

vi.mock("../utils/staleBuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/staleBuild")>()),
  reloadForNewBuild: vi.fn(),
}));

const Throws: React.FC<{ error: Error }> = ({ error }) => {
  throw error;
};

class Outer extends React.Component<{ children: React.ReactNode }, { caught: string | null }> {
  state = { caught: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { caught: error.message };
  }
  render() {
    return this.state.caught ? <p>outer caught: {this.state.caught}</p> : this.props.children;
  }
}

const chunkError = () =>
  new TypeError("Failed to fetch dynamically imported module: http://lis/assets/GrossPage-a1b2c3.js");

beforeEach(() => {
  // React logs every caught render error; keep the output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StaleChunkBoundary", () => {
  it("renders the page normally", () => {
    render(
      <StaleChunkBoundary resetKey="a">
        <p>page body</p>
      </StaleChunkBoundary>,
    );
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("offers a reload in place of a page whose chunk is gone", () => {
    render(
      <StaleChunkBoundary resetKey="a">
        <Throws error={chunkError()} />
      </StaleChunkBoundary>,
    );
    expect(screen.getByText("ระบบเพิ่งอัปเดต")).toBeInTheDocument();
    fireEvent.click(screen.getByText("รีเฟรช").closest("button")!);
    expect(reloadForNewBuild).toHaveBeenCalledTimes(1);
  });

  it("passes any other error on, as if it weren't there", () => {
    render(
      <Outer>
        <StaleChunkBoundary resetKey="a">
          <Throws error={new Error("a real bug")} />
        </StaleChunkBoundary>
      </Outer>,
    );
    expect(screen.getByText("outer caught: a real bug")).toBeInTheDocument();
    expect(screen.queryByText("ระบบเพิ่งอัปเดต")).not.toBeInTheDocument();
  });

  it("clears when the user moves to another page", () => {
    const { rerender } = render(
      <StaleChunkBoundary resetKey="gross">
        <Throws error={chunkError()} />
      </StaleChunkBoundary>,
    );
    expect(screen.getByText("ระบบเพิ่งอัปเดต")).toBeInTheDocument();
    rerender(
      <StaleChunkBoundary resetKey="dashboard">
        <p>dashboard home</p>
      </StaleChunkBoundary>,
    );
    expect(screen.getByText("dashboard home")).toBeInTheDocument();
  });
});
