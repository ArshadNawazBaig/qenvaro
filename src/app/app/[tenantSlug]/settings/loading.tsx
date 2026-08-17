import { PageContainer } from "@/components/shared/page-container";

export default function SettingsLoading() {
  return (
    <PageContainer className="animate-pulse">
      <div className="bg-muted h-20 w-full max-w-2xl rounded-xl" />
      <div className="bg-muted h-12 w-full rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="bg-muted h-96 rounded-xl" />
        <div className="bg-muted h-96 rounded-xl" />
      </div>
    </PageContainer>
  );
}
