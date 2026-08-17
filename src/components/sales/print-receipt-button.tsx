"use client";

import { Printer } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton({ saleId }: { saleId?: string }) {
  const printed = React.useRef(false);
  const [status, setStatus] = React.useState("");

  const printBill = React.useCallback(() => {
    setStatus("Print dialog opened.");
    window.setTimeout(() => window.print(), 0);
  }, []);

  React.useEffect(() => {
    const key = "qenvaro:auto-print-sale";
    const shouldAutoPrint =
      Boolean(saleId) && window.sessionStorage.getItem(key) === saleId;
    if (!shouldAutoPrint || printed.current) return;
    const timer = window.setTimeout(() => {
      if (printed.current) return;
      printed.current = true;
      window.sessionStorage.removeItem(key);
      printBill();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [printBill, saleId]);

  return (
    <>
      <Button variant="outline" onClick={printBill}>
        <Printer /> Print bill
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </>
  );
}
