/**
 * The IHC TAT target (system_settings.ihc_tat_days) is edited here, next to
 * the other turnaround targets, and read by Report Analytics → IHC TAT. Pin
 * that it loads into the form and goes back out on save.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import WorkflowTab from "./WorkflowTab";
import SystemSettingService from "../../../services/systemSettingService";

vi.mock("../../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock("../../../services/anatomicalTestService", () => ({
  default: { getAllTests: vi.fn().mockResolvedValue({ data: [] }) },
}));

it("loads the IHC TAT target and saves it with the other settings", async () => {
  vi.mocked(SystemSettingService.getSettings).mockResolvedValue({
    surgical_tat_days: 10,
    surgical_express_tat_days: 3,
    ihc_tat_days: 7,
  } as never);
  vi.mocked(SystemSettingService.updateSettings).mockResolvedValue({} as never);

  const { container } = render(<WorkflowTab />);

  expect(await screen.findByText("Immunohistochemistry (IHC)")).toBeInTheDocument();
  const input = container.querySelector<HTMLInputElement>("#ihc_tat_days")!;
  await waitFor(() => expect(input.value).toBe("7"));

  fireEvent.change(input, { target: { value: "8" } });
  fireEvent.blur(input);

  const save = screen.getByRole("button", { name: /Save Settings/ });
  await waitFor(() => expect(save).not.toHaveClass("ant-btn-loading"));
  fireEvent.click(save);

  await waitFor(() => expect(SystemSettingService.updateSettings).toHaveBeenCalled());
  expect(vi.mocked(SystemSettingService.updateSettings).mock.calls[0][0]).toMatchObject({ ihc_tat_days: 8 });
});

it("explains the specimen / block labels in a panel under the settings", async () => {
  vi.mocked(SystemSettingService.getSettings).mockResolvedValue({
    surgical_label_scheme: "number_letter",
    surgical_block_delete_mode: "keep_gap",
  } as never);

  render(<WorkflowTab />);

  const header = await screen.findByText(/รายละเอียด: label ชิ้นเนื้อและ block ทำงานอย่างไร/);
  expect(screen.queryByText(/ระบบนับว่าเคส/)).not.toBeInTheDocument();

  fireEvent.click(header);

  expect(await screen.findByText(/ระบบนับว่าเคส/)).toBeInTheDocument();
  expect(screen.getByText("1: A B C E, 2: D")).toBeInTheDocument();
  expect(screen.getByText("พิมพ์สติกเกอร์สไลด์ของเคสไปแล้ว")).toBeInTheDocument();
});
