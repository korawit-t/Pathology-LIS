import { describe, it, expect } from "vitest";
import type { MenuProps } from "antd";
import { SIDE_MENU_CONFIG, buildAuthorizedMenuItems, type SideMenuItem } from "./sideMenu.config";
import { PAGE_PERMISSIONS } from "./pagePermissions";
import { ROLES, type UserRole } from "./roles.constants";
import { VIEW_CONFIG } from "../pages/Dashboard/dashboardViewResolver";

const leaves = (items: SideMenuItem[]): SideMenuItem[] =>
  items.flatMap((item) => (item.children ? leaves(item.children) : [item]));

type BuiltItem = NonNullable<MenuProps["items"]>[number] & {
  key?: string;
  children?: BuiltItem[];
};

// Leaf keys (= view keys) of the menu as one role sees it, every flag on.
const visibleViews = (role: UserRole): string[] => {
  const walk = (items: BuiltItem[]): string[] =>
    items.flatMap((i) => (i?.children ? walk(i.children) : [String(i?.key)]));
  const built = buildAuthorizedMenuItems(SIDE_MENU_CONFIG, [role], {
    enable_tissue_processing_workflow: true,
    nongyne_slide_dispatch_enabled: true,
  }) as BuiltItem[];
  return walk(built);
};

const ALL_ROLES = Object.keys(ROLES) as UserRole[];

describe("side menu vs page guard", () => {
  // A role that sees a menu item but fails the page guard behind it clicks
  // straight into a 403. Print Queue did this to histo/gross/cytotechnologist.
  it.each(leaves(SIDE_MENU_CONFIG).filter((i) => i.view && i.roles))(
    "$label: every role shown the item can open its page",
    (item) => {
      const entry = VIEW_CONFIG[item.view!];
      expect(entry, `no view config for ${item.view}`).toBeDefined();
      const guard = PAGE_PERMISSIONS[entry.pageKey];
      const blocked = item.roles!.filter((r) => !guard.includes(r));
      expect(blocked).toEqual([]);
    },
  );

  // QC Review and Report Archive each sit in two groups; a role that saw both
  // copies got the same page twice (and both QC Review items lit up together).
  // Report Archive's copies are different view keys over one component, so
  // compare the page each view opens, not the key.
  const VIEW_DEPENDENT = new Set([
    // These read the view key: case type for dispatch, Process Out for processing.
    "slide-dispatch",
    "nongyne-slide-dispatch",
    "sur:tissue-processing",
    "his:process-out",
  ]);
  const pageOf = (view: string): unknown =>
    VIEW_DEPENDENT.has(view) ? view : (VIEW_CONFIG[view]?.component ?? view);

  it.each(ALL_ROLES)("%s does not see the same page twice", (role) => {
    const views = visibleViews(role);
    const pages = views.map(pageOf);
    const repeated = views.filter((_, i) => pages.indexOf(pages[i]) !== i);
    expect(repeated).toEqual([]);
  });

  it.each(PAGE_PERMISSIONS["gyne-qc-review"])("%s still has a way into QC Review", (role) => {
    expect(visibleViews(role)).toContain("gyne-qc-review");
  });

  it("every role that can open a Report Archive still sees one", () => {
    const canOpen = new Set([...PAGE_PERMISSIONS["all-report"], ...PAGE_PERMISSIONS["report-lookup"]]);
    for (const role of canOpen) {
      const views = visibleViews(role);
      expect(views.includes("all-report") || views.includes("report-lookup"), role).toBe(true);
    }
  });

  it("Front Desk shows the print queue as Report Print Queue", () => {
    const frontDesk = SIDE_MENU_CONFIG.find((i) => i.key === "lab-services-group");
    const item = frontDesk?.children?.find((c) => c.view === "print-report-queue");
    expect(item?.label).toBe("Report Print Queue");
  });
});
