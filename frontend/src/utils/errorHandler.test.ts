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
import { handleApiError, getValidationErrors } from "./errorHandler";

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

describe("getValidationErrors", () => {
  it("returns nothing for a string detail or no response", () => {
    expect(getValidationErrors(makeAxiosError(400, { detail: "nope" }))).toEqual([]);
    expect(getValidationErrors(new Error("boom"))).toEqual([]);
    expect(getValidationErrors(undefined)).toEqual([]);
  });

  it("names the body field and rewords length errors", () => {
    const err = makeAxiosError(422, {
      detail: [
        {
          type: "string_too_short",
          loc: ["body", "password"],
          msg: "String should have at least 8 characters",
          ctx: { min_length: 8 },
        },
        {
          type: "string_too_long",
          loc: ["body", "password"],
          msg: "String should have at most 128 characters",
          ctx: { max_length: 128 },
        },
        {
          type: "value_error",
          loc: ["body", "email"],
          msg: "value is not a valid email address",
        },
        { type: "missing", loc: ["query", "slug"], msg: "Field required" },
      ],
    });

    expect(getValidationErrors(err)).toEqual([
      { field: "password", message: "Must be at least 8 characters long." },
      { field: "password", message: "Must be at most 128 characters long." },
      { field: "email", message: "value is not a valid email address" },
      { field: undefined, message: "Field required" },
    ]);
  });
});
