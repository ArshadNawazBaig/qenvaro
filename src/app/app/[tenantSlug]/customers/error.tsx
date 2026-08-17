"use client";

import { PageContainer } from "@/components/shared/page-container";
import { ErrorState } from "@/components/shared/states";

export default function CustomersError({ retry }: { retry: () => void }) {
  return (
    <PageContainer>
      <ErrorState
        title="Customers could not load"
        description="The customer workspace hit a temporary problem. Your data has not been changed."
        onRetry={retry}
      />
    </PageContainer>
  );
}
