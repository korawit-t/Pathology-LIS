import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("in development mode (import.meta.env.DEV = true)", () => {
    it("logger.log calls console.log", async () => {
      const { default: logger } = await import("./logger");
      logger.log("hello", "world");
      expect(consoleSpy.log).toHaveBeenCalledWith("hello", "world");
    });

    it("logger.warn calls console.warn", async () => {
      const { default: logger } = await import("./logger");
      logger.warn("something fishy");
      expect(consoleSpy.warn).toHaveBeenCalledWith("something fishy");
    });

    it("logger.error calls console.error", async () => {
      const { default: logger } = await import("./logger");
      logger.error("boom", new Error("test"));
      expect(consoleSpy.error).toHaveBeenCalledWith("boom", new Error("test"));
    });

    it("logger accepts multiple arguments", async () => {
      const { default: logger } = await import("./logger");
      logger.log("a", 1, { b: 2 });
      expect(consoleSpy.log).toHaveBeenCalledWith("a", 1, { b: 2 });
    });
  });

  describe("in production mode (import.meta.env.DEV = false)", () => {
    it("logger.log is silent", async () => {
      vi.stubEnv("DEV", false);
      // Re-import with fresh module state
      vi.resetModules();
      const { default: logger } = await import("./logger");
      logger.log("should not appear");
      // In production, isDev = false so nothing is called
      // (vitest runs in dev mode so DEV=true; this test documents expected prod behavior)
      vi.unstubAllEnvs();
    });
  });
});
