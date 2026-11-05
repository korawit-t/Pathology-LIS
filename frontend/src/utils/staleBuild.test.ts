import { describe, expect, it, vi } from "vitest";
import { STALE_BUILD_EVENT, isStaleChunkError, watchForStaleChunks } from "./staleBuild";

describe("isStaleChunkError", () => {
  it.each([
    // Chrome / Edge
    "Failed to fetch dynamically imported module: http://lis/assets/GrossPage-a1b2c3.js",
    // Firefox
    "error loading dynamically imported module: http://lis/assets/GrossPage-a1b2c3.js",
    // Safari
    "Importing a module script failed.",
    // Vite's own CSS preload
    "Unable to preload CSS for /assets/GrossPage-a1b2c3.css",
  ])("recognises %s", (message) => {
    expect(isStaleChunkError(new TypeError(message))).toBe(true);
  });

  it.each([
    new TypeError("Cannot read properties of undefined (reading 'name')"),
    new Error("Request failed with status code 500"),
    null,
    undefined,
  ])("leaves other errors alone: %s", (error) => {
    expect(isStaleChunkError(error)).toBe(false);
  });
});

describe("watchForStaleChunks", () => {
  it("turns Vite's preload failure into the app's stale-build event", () => {
    const onStale = vi.fn();
    window.addEventListener(STALE_BUILD_EVENT, onStale);
    watchForStaleChunks();

    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);

    expect(onStale).toHaveBeenCalledTimes(1);
    // Left to propagate: nothing is swallowed on the user's behalf.
    expect(event.defaultPrevented).toBe(false);
    window.removeEventListener(STALE_BUILD_EVENT, onStale);
  });
});
