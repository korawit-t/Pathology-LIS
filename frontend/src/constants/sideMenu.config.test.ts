import { describe, it, expect } from "vitest";
import { buildAuthorizedMenuItems, SideMenuItem } from "./sideMenu.config";

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
