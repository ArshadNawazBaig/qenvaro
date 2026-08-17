"use client";

import { PageContainer } from "@/components/shared/page-container";
import { ErrorState } from "@/components/shared/states";

export default function WorkforceError({ retry }: { retry: () => void }) {
  return (
    <PageContainer>
      <ErrorState onRetry={retry} />
    </PageContainer>
  );
}
