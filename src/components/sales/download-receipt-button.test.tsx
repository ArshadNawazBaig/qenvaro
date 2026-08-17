import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadReceiptButton } from "./download-receipt-button";

const mocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  html2canvas: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("html2canvas-pro", () => ({
  default: mocks.html2canvas,
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    addImage = mocks.addImage;
    addPage = mocks.addPage;
    save = mocks.save;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

describe("DownloadReceiptButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    mocks.html2canvas.mockImplementation(async (element: HTMLElement) => {
      expect(element).toHaveAttribute("data-receipt-download-clone");
      expect(element.querySelector("[id]")).toBeNull();
      return {
        height: 1_440,
        toDataURL: () => "data:image/png;base64,dGVzdA==",
        width: 720,
      };
    });
  });

  it("downloads the rendered receipt as a 72mm PDF", async () => {
    const receipt = document.createElement("article");
    receipt.setAttribute("data-sale-bill", "");
    receipt.innerHTML = '<div id="receipt-row">Receipt content</div>';
    document.body.appendChild(receipt);
    render(<DownloadReceiptButton receiptNumber="MAIN 000042" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Download receipt" }),
    );

    await waitFor(() => {
      expect(mocks.save).toHaveBeenCalledWith("receipt-MAIN-000042.pdf");
    });
    expect(mocks.html2canvas).toHaveBeenCalledOnce();
    expect(mocks.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,dGVzdA==",
      "PNG",
      0,
      -0,
      72,
      144,
      undefined,
      "FAST",
    );
    expect(document.querySelector("[data-receipt-download-stage]")).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith("Receipt downloaded.");
    receipt.remove();
  });
});
