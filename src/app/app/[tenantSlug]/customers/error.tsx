"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomersError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
          <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-xl">
            <AlertCircle className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">
            Customers could not load
          </h1>
          <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
            The customer workspace hit a temporary problem. Your data has not
            been changed.
          </p>
          <Button className="mt-5" onClick={retry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
