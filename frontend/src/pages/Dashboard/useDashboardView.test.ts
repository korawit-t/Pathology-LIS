import { act, renderHook } from "@testing-library/react";
import { MENU_VIEWS, useDashboardView } from "./useDashboardView";

describe("useDashboardView", () => {
  it("starts on Home", () => {
    const { result } = renderHook(() => useDashboardView());
    expect(result.current[0]).toBe("dashboard");
    expect(result.current[2]).toBe("dashboard");
  });

  it("highlights a menu page itself", () => {
    const { result } = renderHook(() => useDashboardView());
    act(() => result.current[1]("accession"));
    expect(result.current[0]).toBe("accession");
    expect(result.current[2]).toBe("accession");
  });

  it("keeps the menu item a menu-less page was opened from", () => {
    const { result } = renderHook(() => useDashboardView());
    act(() => result.current[1]("gyne-qc-review"));
    act(() => result.current[1]("gyne-cyto-diagnosis-entry"));
    expect(result.current[0]).toBe("gyne-cyto-diagnosis-entry");
    expect(result.current[2]).toBe("gyne-qc-review");
  });

  it("knows which pages have no menu item", () => {
    for (const view of ["surgical-report-form", "approval-manage", "wsi-viewer"]) {
      expect(MENU_VIEWS.has(view)).toBe(false);
    }
    for (const view of ["dashboard", "pathologist-page", "approval", "wsi-file-list"]) {
      expect(MENU_VIEWS.has(view)).toBe(true);
    }
  });
});
