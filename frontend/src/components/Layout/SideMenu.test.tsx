import { render, screen, waitFor } from "@testing-library/react";
import SideMenu, { findGroupKey } from "./SideMenu";
import { SIDE_MENU_CONFIG, buildAuthorizedMenuItems } from "../../constants/sideMenu.config";

vi.mock("../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn().mockResolvedValue({}) },
}));

const expandedGroups = () =>
  [...document.querySelectorAll(".ant-menu-submenu-title[aria-expanded='true']")].map(
    (el) => el.textContent,
  );

describe("findGroupKey", () => {
  it("skips a group the user cannot see that holds the same view", () => {
    // QC Review sits under Gyne Cytology and Diagnosis; a pathologist only sees Diagnosis.
    const items = buildAuthorizedMenuItems(SIDE_MENU_CONFIG, ["pathologist"]);
    expect(findGroupKey(items, "gyne-qc-review")).toBe("diagnosis-group");
  });

  it("finds the Gyne Cytology copy for a cytotechnologist", () => {
    const items = buildAuthorizedMenuItems(SIDE_MENU_CONFIG, ["cytotechnologist"]);
    expect(findGroupKey(items, "gyne-qc-review")).toBe("gyne-cytology-workflow");
  });

  it("returns undefined for a view outside every group", () => {
    const items = buildAuthorizedMenuItems(SIDE_MENU_CONFIG, ["admin"]);
    expect(findGroupKey(items, "dashboard")).toBeUndefined();
  });
});

describe("SideMenu", () => {
  it("opens the pathologist's Diagnosis group when they land on QC Review", async () => {
    render(
      <SideMenu user={{ roles: ["pathologist"] }} setCurrentView={vi.fn()} currentView="gyne-qc-review" />,
    );

    await waitFor(() => expect(expandedGroups()).toEqual(["Diagnosis"]));
    expect(screen.getByText("QC Review")).toBeVisible();
  });
});
