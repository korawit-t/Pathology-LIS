import "@testing-library/jest-dom";
import { message } from "antd";

// antd's static message API mounts a single module-level React root the
// first time message.success/error/etc is called, independent of any
// component's render tree — RTL's automatic per-test unmount never touches
// it. Its default auto-dismiss uses a real setTimeout (not vi fake timers),
// which can fire after Vitest has already torn down some *other* test file's
// jsdom environment (test.isolate default), throwing "window is not
// defined" from inside react-dom's scheduler and failing an unrelated file.
// duration: 0 disables that auto-dismiss timer entirely (rc-notification
// only schedules it when duration > 0) so it never outlives any test file.
// Tests only assert a message appears, never that it disappears on its own,
// so nothing relies on the auto-dismiss behavior.
message.config({ duration: 0 });

// Ant Design requires matchMedia and ResizeObserver in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
