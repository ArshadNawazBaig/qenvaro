"use client";

import { ErrorState } from "@/components/shared/states";

export default function WorkforceError() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <ErrorState />
    </div>
  );
}
