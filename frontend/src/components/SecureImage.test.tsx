import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// The on-prem IIS build sets VITE_API_BASE_URL="/api" (README §4D), so
// `api.baseURL` and the prefix every call site bakes into `src` are the same
// relative string — the exact configuration that produced /api/api/... 404s.
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("../services/httpClient", () => ({
  default: { get: mockGet, defaults: { baseURL: "/api" } },
  API_BASE_URL: "/api",
}));

import SecureImage, { useSecureSrc } from "./SecureImage";

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ data: new Blob(["img"], { type: "image/jpeg" }) });
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
});

const Probe: React.FC<{ src: string }> = ({ src }) => {
  const blob = useSecureSrc(src);
  return <span data-testid="probe">{blob ?? "pending"}</span>;
};

describe("useSecureSrc — request path", () => {
  it("strips the baked-in API base so axios does not apply it twice", async () => {
    render(<Probe src="/api/storage/nongyne_images/12/a.jpg" />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toBe("/storage/nongyne_images/12/a.jpg");
  });

  it("leaves an already-relative path untouched", async () => {
    render(<Probe src="/storage/gross_images/1/b.jpg" />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toBe("/storage/gross_images/1/b.jpg");
  });

  it("leaves an absolute URL untouched", async () => {
    const absolute = "http://192.168.1.100:8000/storage/gyne_images/3/c.jpg";
    render(<Probe src={absolute} />);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toBe(absolute);
  });
});

describe("SecureImage — failure state", () => {
  it("shows a failure placeholder instead of spinning forever when the fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("404"));
    const { container } = render(
      <SecureImage src="/api/storage/nongyne_images/12/missing.jpg" width={160} height={120} />,
    );

    await waitFor(() =>
      expect(container.querySelector(".ant-spin")).not.toBeInTheDocument(),
    );
    expect(container.querySelector(".anticon-file-image")).toBeInTheDocument();
  });

  it("renders the image once the fetch succeeds", async () => {
    render(
      <SecureImage
        src="/api/storage/nongyne_images/12/ok.jpg"
        width={160}
        height={120}
        alt="cytology"
      />,
    );

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:fake"));
  });
});
