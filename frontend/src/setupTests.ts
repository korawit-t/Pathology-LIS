import "@testing-library/jest-dom";
import { message, Modal } from "antd";

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

// Same root cause, the other half of the problem: Modal.confirm/info/... also
// mount their own module-level React root that RTL's per-test cleanup never
// unmounts. A dialog (or a message) still mounted when a test file finishes
// leaves render work queued on react-dom's scheduler, which runs on a
// macrotask — so it can fire after Vitest has torn down that file's jsdom
// environment, throwing "window is not defined" and being reported as an
// unhandled error against whichever unrelated file happens to be running.
// Closing them after every test and yielding a macrotask lets React finish
// the unmount while the environment is still alive.
//
// PARTIAL: this reduces those unhandled errors a lot (measured: present in
// nearly every full-suite run before, ~3 runs in 10 after) but does not
// eliminate them. The remainder is most likely rc-motion's deadline timers —
// real setTimeouts of a few hundred ms left pending by antd overlays when a
// file ends, which no per-test yield can cover. Mocking rc-motion globally
// would likely finish the job, at the risk of changing enter/leave behavior
// for every test, so it has not been done. The errors do not fail the suite;
// Vitest reports them because they *could* mask a false positive.
//
// vi.useRealTimers() first because the yield below may fall back to a real
// setTimeout: a test that left fake timers installed (or failed before
// restoring them) would otherwise hang here forever.
afterEach(async () => {
  vi.useRealTimers();
  Modal.destroyAll();
  message.destroy();
  // setImmediate, not setTimeout: react-dom's scheduler queues its work with
  // setImmediate under Node, which runs in a later event-loop phase than
  // timers — yielding via setTimeout returns before that work has run, and
  // the unhandled errors survive. Not in the DOM typings, hence the lookup.
  const scheduleImmediate = (globalThis as typeof globalThis & {
    setImmediate?: (cb: () => void) => void;
  }).setImmediate;
  await new Promise<void>((resolve) =>
    scheduleImmediate ? scheduleImmediate(resolve) : setTimeout(resolve, 0),
  );
});

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
