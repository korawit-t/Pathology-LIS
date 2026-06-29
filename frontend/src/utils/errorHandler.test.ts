import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";

// vi.hoisted runs before the vi.mock factory, making these available in the factory
const { mockMessageError, mockLoggerError } = vi.hoisted(() => ({
  mockMessageError: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("antd", () => ({
  message: { error: mockMessageError, success: vi.fn(), warning: vi.fn() },
}));

vi.mock("./logger", () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: mockLoggerError },
}));

// Import after mocks are set up
import { handleApiError } from "./errorHandler";

function makeAxiosError(status: number, data?: object, code?: string): AxiosError {
  const err = new AxiosError("Request failed");
  if (code) err.code = code;
  if (status) {
    Object.defineProperty(err, "response", {
      value: { status, data: data ?? {} },
      writable: true,
    });
  }
  return err;
}

describe("handleApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows network error for ERR_NETWORK code", () => {
    const err = makeAxiosError(0);
    err.code = "ERR_NETWORK";
    handleApiError(err);
    expect(mockMessageError).toHaveBeenCalledWith(
      expect.stringContaining("เชื่อมต่อ"),
    );
  });

  it("shows 401 session-expired message", () => {
    handleApiError(makeAxiosError(401));
    expect(mockMessageError).toHaveBeenCalledWith(
      expect.stringContaining("เซสชัน"),
    );
  });

  it("shows 403 permission message", () => {
    handleApiError(makeAxiosError(403));
    expect(mockMessageError).toHaveBeenCalledWith(
      expect.stringContaining("สิทธิ์"),
    );
  });

  it("shows backend detail string when provided", () => {
    handleApiError(makeAxiosError(400, { detail: "HN not found" }));
    expect(mockMessageError).toHaveBeenCalledWith("HN not found");
  });

  it("shows validation fallback for 422 without detail string", () => {
    handleApiError(makeAxiosError(422, {}));
    expect(mockMessageError).toHaveBeenCalledWith(
      expect.stringContaining("รูปแบบ"),
    );
  });

  it("shows generic fallback for unknown errors", () => {
    handleApiError(makeAxiosError(500, {}));
    expect(mockMessageError).toHaveBeenCalledWith(
      expect.stringContaining("ไม่ทราบสาเหตุ"),
    );
  });

  it("always calls logger.error with the error object", () => {
    const err = makeAxiosError(500);
    handleApiError(err);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("calls message.error exactly once per invocation", () => {
    handleApiError(makeAxiosError(404, { detail: "Not found" }));
    expect(mockMessageError).toHaveBeenCalledTimes(1);
  });
});
