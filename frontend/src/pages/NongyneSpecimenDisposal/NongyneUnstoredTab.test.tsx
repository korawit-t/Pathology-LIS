import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp, Modal } from "antd";
import NongyneUnstoredTab from "./NongyneUnstoredTab";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { NongyneDisposalCandidate } from "../../types/nongyneSpecimenDisposal";

vi.mock("../../services/nongyneSpecimenDisposalService", () => ({
  default: { getUnstored: vi.fn(), bulkUpdateStorage: vi.fn() },
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
    status: "registered",
    specimen_type: "Fluid",
    collection_site: "Pleural fluid",
    registered_at: "2026-09-01T09:00:00",
    report_at: null,
    is_pending: false,
    days_since_report: null,
    is_due: false,
    block_reason: null,
    specimen_storage_status: null,
    specimen_storage_container: null,
    discard_status: false,
    patient: { id: 3, name: "สมศรี", ln: "ใจงาม", title: { title: "นาง" } },
    ...overrides,
  }) as NongyneDisposalCandidate;

/** Modal.confirm renders imperatively into document.body and survives RTL
 *  cleanup, so a bare ".ant-table" lookup can land on a leftover dialog's
 *  preview table instead of the tab's own. */
const inTable = () =>
  within(
    Array.from(document.querySelectorAll<HTMLElement>(".ant-table")).find(
      (el) => !el.closest(".ant-modal"),
    ) as HTMLElement,
  );
const inDialog = () =>
  within(document.querySelector(".ant-modal-confirm") as HTMLElement);

/** The tab's own "บันทึกที่เก็บ" button and the confirm dialog's OK button share
 *  a label, and a dialog closing from a previous assertion can still be in the
 *  DOM — so always pick the one outside any modal. */
const saveButton = () =>
  screen
    .getAllByRole("button", { name: /บันทึกที่เก็บ/ })
    .find((el) => !el.closest(".ant-modal")) as HTMLElement;

/** The dialog's OK button carries the same label as the tab's, and Modal.confirm
 *  mounts a tick after the click — so wait for the one that is inside a modal. */
const dialogOk = () =>
  waitFor(() => {
    const btn = screen
      .getAllByRole("button", { name: "บันทึกที่เก็บ" })
      .find((el) => el.closest(".ant-modal"));
    if (!btn) throw new Error("confirm dialog not open yet");
    return btn as HTMLElement;
  });

const renderTab = (
  props: Partial<React.ComponentProps<typeof NongyneUnstoredTab>> = {},
) =>
  render(
    <AntdApp>
      <NongyneUnstoredTab search="" {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  svc.getUnstored.mockResolvedValue([makeCase()]);
  svc.bulkUpdateStorage.mockResolvedValue([]);
});

// Modal.confirm mounts imperatively outside the React tree, so RTL cleanup
// leaves it behind and the next test sees two "บันทึกที่เก็บ" buttons.
afterEach(() => {
  Modal.destroyAll();
});

describe("NongyneUnstoredTab", () => {
  it("lists the specimens with nowhere recorded yet", async () => {
    renderTab();
    expect(await inTable().findByText("N26-00123")).toBeInTheDocument();
    expect(inTable().getByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
  });

  it("will not save without a container number", async () => {
    renderTab();
    await inTable().findByText("N26-00123");

    fireEvent.click(inTable().getAllByRole("checkbox").at(-1) as HTMLElement);
    fireEvent.click(saveButton());

    expect(await screen.findByText("กรุณาระบุที่เก็บ / เลขกล่อง")).toBeInTheDocument();
    expect(svc.bulkUpdateStorage).not.toHaveBeenCalled();
  });

  it("cannot save with nothing selected", async () => {
    renderTab();
    await inTable().findByText("N26-00123");
    expect(saveButton()).toBeDisabled();
  });

  it("confirms before writing, then records the container", async () => {
    const onChanged = vi.fn();
    renderTab({ onChanged });
    await inTable().findByText("N26-00123");

    fireEvent.change(screen.getByPlaceholderText("เช่น NG-12"), {
      target: { value: "NG-07" },
    });
    fireEvent.click(inTable().getAllByRole("checkbox").at(-1) as HTMLElement);
    fireEvent.click(saveButton());

    expect(
      (await screen.findAllByText("ยืนยันการระบุที่เก็บ")).length,
    ).toBeGreaterThan(0);
    expect(inDialog().getByText("NG-07")).toBeInTheDocument();

    fireEvent.click(await dialogOk());

    await waitFor(() =>
      expect(svc.bulkUpdateStorage).toHaveBeenCalledWith({
        case_ids: [11],
        container_number: "NG-07",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("trims the container before sending it", async () => {
    renderTab();
    await inTable().findByText("N26-00123");

    fireEvent.change(screen.getByPlaceholderText("เช่น NG-12"), {
      target: { value: "  NG-07  " },
    });
    fireEvent.click(inTable().getAllByRole("checkbox").at(-1) as HTMLElement);
    fireEvent.click(saveButton());

    fireEvent.click(await dialogOk());

    await waitFor(() =>
      expect(svc.bulkUpdateStorage).toHaveBeenCalledWith(
        expect.objectContaining({ container_number: "NG-07" }),
      ),
    );
  });

  it("passes the search term through to the server", async () => {
    renderTab({ search: "N26-00123" });
    await waitFor(() => expect(svc.getUnstored).toHaveBeenCalledWith("N26-00123"));
  });
});
