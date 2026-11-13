import { describe, it, expect } from "vitest";
import { buildAuthorizedMenuItems, SIDE_MENU_CONFIG, SideMenuItem } from "./sideMenu.config";

describe("buildAuthorizedMenuItems", () => {
  const fixture: SideMenuItem[] = [
    {
      key: "always-visible",
      label: "Always Visible",
      view: "always-visible",
    },
    {
      key: "flagged-item",
      label: "Flagged Item",
      view: "flagged-item",
      featureFlag: "enable_tissue_processing_workflow",
    },
    {
      key: "group",
      label: "Group",
      children: [
        {
          key: "flagged-child",
          label: "Flagged Child",
          view: "flagged-child",
          featureFlag: "enable_tissue_processing_workflow",
        },
      ],
    },
  ];

  it("hides a flagged item when its flag is explicitly false", () => {
    const items = buildAuthorizedMenuItems(fixture, [], {
      enable_tissue_processing_workflow: false,
    });

    const keys = items.map((i) => i?.key);
    expect(keys).toContain("always-visible");
    expect(keys).not.toContain("flagged-item");
  });

  it("shows a flagged item when its flag is true", () => {
    const items = buildAuthorizedMenuItems(fixture, [], {
      enable_tissue_processing_workflow: true,
    });

    expect(items.map((i) => i?.key)).toContain("flagged-item");
  });

  it("defaults a flagged item to visible when the flag is absent from enabledFlags", () => {
    const items = buildAuthorizedMenuItems(fixture, [], {});

    expect(items.map((i) => i?.key)).toContain("flagged-item");
  });

  it("drops a group entirely once its only child is hidden by the flag", () => {
    const items = buildAuthorizedMenuItems(fixture, [], {
      enable_tissue_processing_workflow: false,
    });

    expect(items.map((i) => i?.key)).not.toContain("group");
  });
});

describe("SIDE_MENU_CONFIG icons", () => {
  // Child icons pushed their labels out of line with other groups' children
  // and cost 24px of label width in a 240px Sider.
  it("only top-level items carry an icon", () => {
    const childrenWithIcons = SIDE_MENU_CONFIG.flatMap((group) =>
      (group.children ?? []).filter((c) => c.icon).map((c) => c.label),
    );
    expect(childrenWithIcons).toEqual([]);
  });
});
