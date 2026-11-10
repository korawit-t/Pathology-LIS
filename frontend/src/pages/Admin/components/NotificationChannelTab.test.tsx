import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import NotificationChannelTab from "./NotificationChannelTab";
import NotificationChannelService from "../../../services/notificationChannelService";
import { ThemeProvider } from "../../../contexts/ThemeContext";

vi.mock("../../../services/notificationChannelService");

const mockedGet = NotificationChannelService.getChannels as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = NotificationChannelService.createChannel as unknown as ReturnType<typeof vi.fn>;

const renderTab = () =>
  render(
    <ThemeProvider>
      <NotificationChannelTab />
    </ThemeProvider>,
  );

const pickPlatform = async (label: string) => {
  const dialog = await screen.findByRole("dialog");
  const select = dialog.querySelector(".ant-select-content") as HTMLElement;
  fireEvent.mouseDown(select);
  const list = document.getElementById("platform_list")!.closest(".ant-select-dropdown") as HTMLElement;
  fireEvent.click(await within(list).findByText(label));
  return dialog;
};

describe("NotificationChannelTab — MOPH Notify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGet.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({});
  });

  it("shows the group setup steps and a client/secret key template", async () => {
    renderTab();
    fireEvent.click(await screen.findByText("Add Channel"));

    const dialog = await pickPlatform("MOPH Notify (LINE group, หมอพร้อม bot)");

    expect(await within(dialog).findByText("MOPH Notify setup")).toBeInTheDocument();
    // The limitation an admin must know before relying on the group.
    expect(within(dialog).getByText(/replies posted in the group go/)).toBeInTheDocument();
    const creds = within(dialog).getByLabelText("Credentials (JSON format)") as HTMLTextAreaElement;
    expect(JSON.parse(creds.value)).toEqual({
      client_key: "client-key-from-the-MOPH-Notify-CMS",
      secret_key: "secret-key-from-the-MOPH-Notify-CMS",
    });
  });

  it("does not show the MOPH steps for another platform", async () => {
    renderTab();
    fireEvent.click(await screen.findByText("Add Channel"));

    const dialog = await pickPlatform("Slack (Incoming Webhook)");

    await waitFor(() =>
      expect(JSON.parse((within(dialog).getByLabelText("Credentials (JSON format)") as HTMLTextAreaElement).value))
        .toHaveProperty("webhook_url"),
    );
    expect(within(dialog).queryByText("MOPH Notify setup")).not.toBeInTheDocument();
  });

  it("saves the channel as platform moph_notify", async () => {
    renderTab();
    fireEvent.click(await screen.findByText("Add Channel"));
    const dialog = await pickPlatform("MOPH Notify (LINE group, หมอพร้อม bot)");

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "ห้องพยาธิ" } });
    fireEvent.change(within(dialog).getByLabelText("Credentials (JSON format)"), {
      target: { value: JSON.stringify({ client_key: "ck", secret_key: "sk" }) },
    });
    fireEvent.click(within(dialog).getByText("OK").closest("button")!);

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][0]).toMatchObject({
      name: "ห้องพยาธิ",
      platform: "moph_notify",
      credentials: { client_key: "ck", secret_key: "sk" },
    });
  });
});
