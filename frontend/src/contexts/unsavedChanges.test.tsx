import { render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  UnsavedChangesProvider,
  useUnsavedChangesGuard,
  useUnsavedChangesRegistry,
} from "./unsavedChanges";

const setup = () => {
  const { result } = renderHook(() => useUnsavedChangesRegistry());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UnsavedChangesProvider value={result.current.registry}>{children}</UnsavedChangesProvider>
  );
  return { hasUnsavedChanges: result.current.hasUnsavedChanges, wrapper };
};

const Page = ({ dirty }: { dirty: boolean }) => {
  useUnsavedChangesGuard(dirty);
  return null;
};

const fireBeforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("useUnsavedChangesGuard", () => {
  it("reports a dirty page until it saves or unmounts", () => {
    const { hasUnsavedChanges, wrapper } = setup();
    const { rerender, unmount } = render(<Page dirty={false} />, { wrapper });
    expect(hasUnsavedChanges()).toBe(false);

    rerender(<Page dirty />);
    expect(hasUnsavedChanges()).toBe(true);

    rerender(<Page dirty={false} />);
    expect(hasUnsavedChanges()).toBe(false);

    rerender(<Page dirty />);
    unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("stays dirty while any one of two pages is", () => {
    const { hasUnsavedChanges, wrapper } = setup();
    const { rerender } = render(
      <>
        <Page dirty />
        <Page dirty />
      </>,
      { wrapper },
    );
    rerender(
      <>
        <Page dirty={false} />
        <Page dirty />
      </>,
    );
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("asks before the tab closes or reloads only while dirty", () => {
    const { rerender, unmount } = render(<Page dirty={false} />);
    expect(fireBeforeUnload()).toBe(false);

    rerender(<Page dirty />);
    expect(fireBeforeUnload()).toBe(true);

    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });

  it("works outside a dashboard without throwing", () => {
    expect(() => render(<Page dirty />)).not.toThrow();
  });
});
