import React from "react";
import { render, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import NongyneStoredTab from "./NongyneStoredTab";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { NongyneDisposalCandidate } from "../../types/nongyneSpecimenDisposal";

vi.mock("../../services/nongyneSpecimenDisposalService", () => ({
  default: { getStored: vi.fn() },
}));

const svc = NongyneSpecimenDisposalService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const makeCase = (
  overrides: Partial<NongyneDisposalCandidate> = {},
): NongyneDisposalCandidate =>
  ({
    id: 11,
    accession_no: "N26-00123",
    hn: "0012345",
    status: "published",
    specimen_type: "Fluid",
    specimen_storage_status: "Stored",
    specimen_storage_container: "NG-07",
    specimen_storage_at: "2026-09-02T10:00:00",
    specimen_storer: { id: 5, username: "somchai", full_name: "สมชาย ใจดี" },
    is_pending: false,
    is_due: false,
    discard_status: false,
    patient: { id: 3, name: "สมศรี", ln: "ใจงาม", title: { title: "นาง" } },
    ...overrides,
  }) as NongyneDisposalCandidate;

const inTable = () => within(document.querySelector(".ant-table") as HTMLElement);

const renderTab = (
  props: Partial<React.ComponentProps<typeof NongyneStoredTab>> = {},
) =>
  render(
    <AntdApp>
      <NongyneStoredTab search="" {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  svc.getStored.mockResolvedValue({
    items: [makeCase()],
    total: 1,
    retention_days: 30,
  });
});

describe("NongyneStoredTab", () => {
  it("shows where each specimen is and who put it there", async () => {
    renderTab();
    expect(await inTable().findByText("N26-00123")).toBeInTheDocument();
    expect(inTable().getByText("NG-07")).toBeInTheDocument();
    expect(inTable().getByText("สมชาย ใจดี")).toBeInTheDocument();
  });

  it("flags a backfilled row that still has no box number", async () => {
    // the migration marks pre-existing cases Stored with a NULL container, so
    // these rows exist in production on day one and must not read as located
    svc.getStored.mockResolvedValue({
      items: [makeCase({ specimen_storage_container: null })],
      total: 1,
      retention_days: 30,
    });
    renderTab();
    expect(await inTable().findByText("ยังไม่ระบุ")).toBeInTheDocument();
  });

  it("reports the retention rule back to the parent", async () => {
    const onRetentionDays = vi.fn();
    renderTab({ onRetentionDays });
    await waitFor(() => expect(onRetentionDays).toHaveBeenCalledWith(30));
  });

  it("passes the search term through to the server", async () => {
    renderTab({ search: "NG-07" });
    await waitFor(() =>
      expect(svc.getStored).toHaveBeenCalledWith(
        expect.objectContaining({ search: "NG-07" }),
      ),
    );
  });
});
