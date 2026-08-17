import { PageContainer } from "@/components/shared/page-container";
import { Card, CardContent } from "@/components/ui/card";

export default function ReturnLoading() {
  return (
    <PageContainer className="animate-pulse" aria-label="Loading sale return">
      <div className="bg-muted h-5 w-40 rounded" />
      <div className="space-y-3">
        <div className="bg-muted h-9 w-64 rounded-lg" />
        <div className="bg-muted h-5 max-w-2xl rounded" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent className="h-32" />
          </Card>
          <Card>
            <CardContent className="h-80" />
          </Card>
        </div>
        <Card>
          <CardContent className="h-96" />
        </Card>
      </div>
    </PageContainer>
  );
}
