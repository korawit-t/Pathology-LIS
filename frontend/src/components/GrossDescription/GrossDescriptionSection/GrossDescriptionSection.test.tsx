import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp, Form } from "antd";
import GrossDescriptionSection from "./index";
import SurgicalBlockService from "../../../services/surgicalBlockService";
import type { SurgicalSpecimen } from "../../../types/surgical";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin" } }),
}));
vi.mock("../../../services/surgicalBlockService", () => ({
  default: {
    getBlocks: vi.fn(),
    deleteBlock: vi.fn(),
    createBlock: vi.fn(),
    updateBlock: vi.fn(),
  },
}));
vi.mock("../../../services/surgicalCaseService", () => ({
  default: { updateSpecimenGross: vi.fn() },
}));
vi.mock("../../../pages/Gross/components/GrossTemplateSystem", () => ({
  default: () => null,
}));
vi.mock("../../../pages/Gross/components/DecalFormModal", () => ({
  default: () => null,
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const specimen = (id: number, label: string): SurgicalSpecimen =>
  ({ id, specimen_label: label, specimen_name: `Specimen ${label}` }) as SurgicalSpecimen;

const block = (id: number, specimenId: number, label: string, no: number, code: string, seq: number | null) => ({
  id,
  specimen_id: specimenId,
  specimen_label: label,
  block_no: String(no),
  block_code: code,
  case_block_seq: seq,
  status: "grossed",
  is_fixing: false,
  is_decal: false,
});

const renderSection = (specimens: SurgicalSpecimen[]) =>
  render(
    <AntdApp>
      <Form>
        <GrossDescriptionSection specimens={specimens} onTemplateUpdate={vi.fn()} users={[]} />
      </Form>
    </AntdApp>,
  );

const loadsOf = (specimenId: number) =>
  mocked(SurgicalBlockService.getBlocks).mock.calls.filter(
    ([params]) => (params as { specimen_id: number }).specimen_id === specimenId,
  ).length;

const deleteFirstBlock = async () => {
  const closeIcons = await screen.findAllByLabelText("close");
  fireEvent.click(closeIcons[0].closest("button") as Element);
  fireEvent.click((await screen.findByText("OK")).closest("button") as Element);
  await waitFor(() => expect(SurgicalBlockService.deleteBlock).toHaveBeenCalled());
};

describe("GrossDescriptionSection — adding or deleting a block", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked(SurgicalBlockService.deleteBlock).mockResolvedValue({});
  });

  it("reloads the other specimens' blocks when letters run across the case", async () => {
    // specimen 1: A, B — specimen 2: C. Deleting A moves C to B (renumber mode).
    let deleted = false;
    mocked(SurgicalBlockService.getBlocks).mockImplementation(async ({ specimen_id }: { specimen_id: number }) => {
      if (specimen_id === 11) {
        return deleted
          ? [block(102, 11, "1", 1, "A", 1)]
          : [block(101, 11, "1", 1, "A", 1), block(102, 11, "1", 2, "B", 2)];
      }
      return [block(201, 12, "2", 1, deleted ? "B" : "C", deleted ? 2 : 3)];
    });
    mocked(SurgicalBlockService.deleteBlock).mockImplementation(async () => {
      deleted = true;
      return {};
    });

    renderSection([specimen(11, "1"), specimen(12, "2")]);
    expect(await screen.findByText("C")).toBeInTheDocument();
    const before = loadsOf(12);

    await deleteFirstBlock();

    await waitFor(() => expect(loadsOf(12)).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText("C")).not.toBeInTheDocument());
    expect(await screen.findByText(/ชิ้น 2: ตัวอักษร block เปลี่ยน C → B/)).toBeInTheDocument();
  });

  it("reloads the other specimens when a block added in the gross room re-letters them", async () => {
    // specimen 1: A, B, C — specimen 2: D. Adding to specimen 1 makes it D and specimen 2 E.
    let added = false;
    mocked(SurgicalBlockService.getBlocks).mockImplementation(async ({ specimen_id }: { specimen_id: number }) => {
      if (specimen_id === 11) {
        const own = [block(101, 11, "1", 1, "A", 1), block(102, 11, "1", 2, "B", 2), block(103, 11, "1", 3, "C", 3)];
        return added ? [...own, block(104, 11, "1", 4, "D", 4)] : own;
      }
      return [block(201, 12, "2", 1, added ? "E" : "D", added ? 5 : 4)];
    });
    mocked(SurgicalBlockService.createBlock).mockImplementation(async () => {
      added = true;
      return block(104, 11, "1", 4, "D", 4);
    });

    renderSection([specimen(11, "1"), specimen(12, "2")]);
    await screen.findByText("C");
    const before = loadsOf(12);

    fireEvent.click(screen.getAllByText("Add")[0].closest("button") as Element);

    await waitFor(() => expect(SurgicalBlockService.createBlock).toHaveBeenCalled());
    await waitFor(() => expect(loadsOf(12)).toBeGreaterThan(before));
    expect(await screen.findByText(/ชิ้น 2: ตัวอักษร block เปลี่ยน D → E/)).toBeInTheDocument();
  });

  it("leaves the other specimens alone in the A1 scheme", async () => {
    mocked(SurgicalBlockService.getBlocks).mockImplementation(async ({ specimen_id }: { specimen_id: number }) =>
      specimen_id === 11
        ? [block(101, 11, "A", 1, "A1", null), block(102, 11, "A", 2, "A2", null)]
        : [block(201, 12, "B", 1, "B1", null)],
    );

    renderSection([specimen(11, "A"), specimen(12, "B")]);
    expect(await screen.findByText("B1")).toBeInTheDocument();
    const before = loadsOf(12);

    await deleteFirstBlock();

    await waitFor(() => expect(loadsOf(11)).toBeGreaterThan(1));
    expect(loadsOf(12)).toBe(before);
    // A1 renumbering within the specimen is what deleting always did — no new notice
    // (antd's message container outlives a test, so match this case's labels only)
    expect(screen.queryByText(/ชิ้น [AB]: ตัวอักษร block เปลี่ยน/)).not.toBeInTheDocument();
  });
});
