import { copyText } from "./clipboard";

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });

afterEach(() => {
  setClipboard(undefined);
  Reflect.deleteProperty(document, "execCommand");
});

describe("copyText", () => {
  it("uses the Clipboard API when it is available", () => {
    const writeText = vi.fn();
    setClipboard({ writeText });

    expect(copyText("S26-00012")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("S26-00012");
  });

  it("falls back to execCommand when the Clipboard API is missing (plain-HTTP LAN)", () => {
    setClipboard(undefined);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    expect(copyText("1234567890123")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // The scratch textarea must not be left behind in the DOM.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure — and still cleans up — when the fallback throws", () => {
    setClipboard(undefined);
    document.execCommand = () => {
      throw new Error("not allowed");
    };

    expect(copyText("nope")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
