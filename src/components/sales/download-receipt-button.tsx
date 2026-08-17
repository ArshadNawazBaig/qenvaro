"use client";

import { Download, LoaderCircle } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DownloadReceiptButton({
  receiptNumber,
}: {
  receiptNumber: string;
}) {
  const [downloading, setDownloading] = React.useState(false);

  async function downloadReceipt() {
    const source = document.querySelector<HTMLElement>("[data-sale-bill]");
    if (!source || downloading) return;
    setDownloading(true);
    let stage: HTMLDivElement | null = null;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      await document.fonts.ready;

      stage = document.createElement("div");
      stage.setAttribute("data-receipt-download-stage", "");
      const clone = source.cloneNode(true) as HTMLElement;
      clone.setAttribute("data-receipt-download-clone", "");
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll<HTMLElement>("[id]").forEach((element) => {
        element.removeAttribute("id");
      });
      stage.appendChild(clone);
      document.body.appendChild(stage);

      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
      });
      const receiptWidthMm = 72;
      const receiptHeightMm = Math.max(
        40,
        (canvas.height / canvas.width) * receiptWidthMm,
      );
      const pageHeightMm = Math.min(1_000, receiptHeightMm);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [receiptWidthMm, pageHeightMm],
        compress: true,
      });
      const image = canvas.toDataURL("image/png");
      const pageCount = Math.ceil(receiptHeightMm / pageHeightMm);
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        if (pageIndex > 0)
          pdf.addPage([receiptWidthMm, pageHeightMm], "portrait");
        pdf.addImage(
          image,
          "PNG",
          0,
          -pageIndex * pageHeightMm,
          receiptWidthMm,
          receiptHeightMm,
          undefined,
          "FAST",
        );
      }
      const safeNumber = receiptNumber.replace(/[^a-z0-9_-]+/gi, "-");
      pdf.save(`receipt-${safeNumber || "sale"}.pdf`);
      toast.success("Receipt downloaded.");
    } catch {
      toast.error("The receipt could not be downloaded. Try again.");
    } finally {
      stage?.remove();
      setDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={downloadReceipt}
      disabled={downloading}
    >
      {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
      {downloading ? "Preparing receipt…" : "Download receipt"}
    </Button>
  );
}
