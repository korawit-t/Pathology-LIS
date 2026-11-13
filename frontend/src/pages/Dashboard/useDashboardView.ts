// src/pages/Dashboard/useDashboardView.ts
import { useCallback, useState } from "react";
import { SIDE_MENU_CONFIG, type SideMenuItem } from "../../constants/sideMenu.config";

const leafViews = (items: SideMenuItem[]): string[] =>
  items.flatMap((i) => (i.children ? leafViews(i.children) : i.view ? [i.view] : []));

/** Views that have a menu item of their own ("dashboard" is Home). */
export const MENU_VIEWS: ReadonlySet<string> = new Set(leafViews(SIDE_MENU_CONFIG));

/**
 * The page on screen, and the menu item to highlight for it.
 *
 * Report forms, approval detail, diagnosis entry, the WSI viewer and a dozen
 * more pages have no menu item, so highlighting the current view lit up
 * nothing. The menu now keeps the item the page was reached from.
 */
export function useDashboardView(initial = "dashboard") {
  const [state, setState] = useState({ view: initial, menuView: initial });
  const setView = useCallback((view: string) => {
    setState((s) => ({ view, menuView: MENU_VIEWS.has(view) ? view : s.menuView }));
  }, []);
  return [state.view, setView, state.menuView] as const;
}
