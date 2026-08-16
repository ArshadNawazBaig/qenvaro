"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ReturnError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
          <span className="border-destructive/25 bg-destructive/10 text-foreground flex size-11 items-center justify-center rounded-xl border">
            <AlertCircle className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">
            The return could not load
          </h1>
          <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
            The original receipt has not been changed. Try loading it again.
          </p>
          <Button className="mt-5" onClick={retry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
