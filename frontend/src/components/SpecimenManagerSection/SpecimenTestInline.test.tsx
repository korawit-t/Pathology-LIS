import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App as AntdApp } from "antd";

import SpecimenTestInline from "./SpecimenTestInline";
import SpecimenAPTestService from "../../services/specimenAPTestService";
import AnatomicalPathologyTestService from "../../services/anatomicalTestService";

vi.mock("../../services/specimenAPTestService", () => ({
  default: {
    getTestsBySpecimenId: vi.fn(),
    addTestToSpecimen: vi.fn(),
    deleteSpecimenTest: vi.fn(),
  },
}));
vi.mock("../../services/anatomicalTestService", () => ({
  default: { getAllTests: vi.fn() },
}));

const ordered = [{ id: 7, ap_test: { name: "Surgical pathology fee", price_tier_3: 500 } }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(AnatomicalPathologyTestService.getAllTests).mockResolvedValue({
    data: [{ id: 1, name: "Tissue exam", category: "Surgical Pathology", price_tier_3: 500 }],
  } as never);
  vi.mocked(SpecimenAPTestService.getTestsBySpecimenId).mockResolvedValue(ordered as never);
  vi.mocked(SpecimenAPTestService.deleteSpecimenTest).mockResolvedValue(undefined as never);
});

const renderInline = () =>
  render(
    <AntdApp>
      <SpecimenTestInline specimenId={42} />
    </AntdApp>,
  );

/** กากบาทบน Tag — antd ไม่ได้ตั้งชื่อ accessible ให้ จึงต้องหยิบจาก class */
const closeIcon = () => document.querySelector(".ant-tag-close-icon") as HTMLElement;

/** ชื่อรายการโผล่ทั้งใน Tag และในกล่องยืนยัน — ต้องเจาะดูเฉพาะ Tag */
const tagLabels = () =>
  Array.from(document.querySelectorAll(".ant-tag")).map((el) => el.textContent?.trim());

describe("SpecimenTestInline — ยืนยันก่อนลบค่าตรวจ", () => {
  it("กดกากบาทเฉย ๆ ยังไม่ลบ จนกว่าจะกดยืนยัน", async () => {
    const user = userEvent.setup();
    renderInline();
    await screen.findByText("Surgical pathology fee");

    await user.click(closeIcon());

    // ยังไม่ยิง API และ tag ยังอยู่
    expect(SpecimenAPTestService.deleteSpecimenTest).not.toHaveBeenCalled();
    expect(tagLabels()).toContain("Surgical pathology fee");

    await user.click(await screen.findByRole("button", { name: "ลบ" }));

    await waitFor(() =>
      expect(SpecimenAPTestService.deleteSpecimenTest).toHaveBeenCalledWith(7),
    );
  });

  it("กดยกเลิกแล้วรายการต้องไม่ถูกลบ", async () => {
    const user = userEvent.setup();
    renderInline();
    await screen.findByText("Surgical pathology fee");

    await user.click(closeIcon());
    await user.click(await screen.findByRole("button", { name: "ยกเลิก" }));

    expect(SpecimenAPTestService.deleteSpecimenTest).not.toHaveBeenCalled();
    expect(tagLabels()).toContain("Surgical pathology fee");
  });
});
