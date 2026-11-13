import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PendingTasks from "./PendingTasks";
import type { User } from "../../../types/user";

vi.mock("./Surgical/SurgicalSection", () => ({ default: () => null }));
vi.mock("./Pathologist/PathologistSection", () => ({ default: () => null }));
vi.mock("./Histo/HistoSection", () => ({ default: () => null }));
vi.mock("./Cyto/CytoSection", () => ({ default: () => null }));
vi.mock("./Immuno/ImmunoSection", () => ({ default: () => null }));
vi.mock("./Outlab/OutlabConsultSection", () => ({ default: () => null }));
vi.mock("./PrintQueue/PrintQueueSection", () => ({
  default: () => <div>Pending Print</div>,
}));

const userWith = (...roles: string[]) => ({ id: 1, roles }) as unknown as User;

describe("PendingTasks print queue box", () => {
  it.each(["register", "lab_manager", "senior_pathologist"])(
    "shows Pending Print to %s",
    (role) => {
      render(<PendingTasks user={userWith(role)} />);
      expect(screen.getByText("Pending Print")).toBeInTheDocument();
    },
  );

  // Every row in the box opens the print queue page, which these roles cannot.
  it.each(["histo", "gross", "cytotechnologist", "pathologist"])(
    "hides Pending Print from %s",
    (role) => {
      render(<PendingTasks user={userWith(role)} />);
      expect(screen.queryByText("Pending Print")).not.toBeInTheDocument();
    },
  );
});
