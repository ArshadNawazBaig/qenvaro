"use client";

import { PageContainer } from "@/components/shared/page-container";
import { ErrorState } from "@/components/shared/states";

export default function NewSaleError({ retry }: { retry: () => void }) {
  return (
    <PageContainer>
      <ErrorState
        title="Point of sale could not load"
        description="The checkout workspace hit a temporary problem. No sale or stock movement was recorded."
        onRetry={retry}
      />
    </PageContainer>
  );
}
