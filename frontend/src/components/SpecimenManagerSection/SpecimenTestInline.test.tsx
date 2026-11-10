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

describe("SpecimenTestInline — ลำดับใน dropdown", () => {
  it("เรียงตามรหัสกรมบัญชีกลาง ไม่ใช่ตามชื่อ และรายการไม่มีรหัสไว้ท้ายสุด", async () => {
    // backend ส่งมาเรียงตามชื่อ — ตั้งใจให้ลำดับชื่อกับลำดับรหัสไม่ตรงกัน
    vi.mocked(AnatomicalPathologyTestService.getAllTests).mockResolvedValue({
      data: [
        { id: 1, code: "38190", name: "Bone", category: "Surgical Pathology", price_tier_3: 2400 },
        { id: 2, code: "", name: "Custom fee", category: "Surgical Pathology", price_tier_3: 100 },
        { id: 3, code: "38001", name: "Surgical biopsy", category: "Surgical Pathology", price_tier_3: 400 },
        { id: 4, code: "38002", name: "ชิ้นเนื้อ ขนาด 2-5 ซม.", category: "Surgical Pathology", price_tier_3: 500 },
        { id: 5, code: "38010", name: "Frozen section", category: "Surgical Pathology", price_tier_3: 1160 },
        { id: 6, code: "00001", name: "Pap smear", category: "Cytology", price_tier_3: 150 },
      ],
    } as never);
    const user = userEvent.setup();
    renderInline();
    await screen.findByText("Surgical pathology fee");

    await user.click(screen.getByRole("combobox"));

    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll(".ant-select-item-option-content")).map(
          (el) => el.textContent,
        ),
      ).toEqual([
        "Surgical biopsy - 400฿",
        "ชิ้นเนื้อ ขนาด 2-5 ซม. - 500฿",
        "Frozen section - 1,160฿",
        "Bone - 2,400฿",
        "Custom fee - 100฿",
      ]),
    );
  });
});

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
