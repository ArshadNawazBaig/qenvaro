"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "!border-border !bg-popover !text-popover-foreground",
            title: "!text-popover-foreground",
            description: "!text-muted-foreground",
          },
        }}
      />
    </ThemeProvider>
  );
}
