"use client";

import { PageContainer } from "@/components/shared/page-container";
import { ErrorState } from "@/components/shared/states";

export default function SalesReportError({ retry }: { retry: () => void }) {
  return (
    <PageContainer>
      <ErrorState
        title="Sales report could not load"
        description="The reporting workspace hit a temporary problem. No business data has been changed."
        onRetry={retry}
      />
    </PageContainer>
  );
}
