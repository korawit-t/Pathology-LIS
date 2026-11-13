import { describe, it, expect } from "vitest";
import { SIDE_MENU_CONFIG, type SideMenuItem } from "./sideMenu.config";
import { PAGE_PERMISSIONS } from "./pagePermissions";
import { VIEW_CONFIG } from "../pages/Dashboard/dashboardViewResolver";

const leaves = (items: SideMenuItem[]): SideMenuItem[] =>
  items.flatMap((item) => (item.children ? leaves(item.children) : [item]));

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

  it("Front Desk shows the print queue as Report Print Queue", () => {
    const frontDesk = SIDE_MENU_CONFIG.find((i) => i.key === "lab-services-group");
    const item = frontDesk?.children?.find((c) => c.view === "print-report-queue");
    expect(item?.label).toBe("Report Print Queue");
  });
});
