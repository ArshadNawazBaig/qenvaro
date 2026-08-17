"use client";

import { PageContainer } from "@/components/shared/page-container";
import { ErrorState } from "@/components/shared/states";

export default function ReturnError({ retry }: { retry: () => void }) {
  return (
    <PageContainer>
      <ErrorState
        title="The return could not load"
        description="The original receipt has not been changed. Try loading it again."
        onRetry={retry}
      />
    </PageContainer>
  );
}
