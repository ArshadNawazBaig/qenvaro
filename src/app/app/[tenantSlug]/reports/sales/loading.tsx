import { PageContainer } from "@/components/shared/page-container";
import { Card, CardContent } from "@/components/ui/card";

export default function SalesReportLoading() {
  return (
    <PageContainer
      className="animate-pulse"
      aria-label="Loading sales performance report"
    >
      <div className="bg-muted h-5 w-32 rounded-md" />
      <div className="space-y-3">
        <div className="bg-muted h-9 w-64 rounded-lg" />
        <div className="bg-muted h-5 max-w-2xl rounded-md" />
      </div>
      <Card>
        <CardContent className="flex gap-3">
          <div className="bg-muted h-9 w-20 rounded-md" />
          <div className="bg-muted h-9 w-20 rounded-md" />
          <div className="bg-muted h-9 w-20 rounded-md" />
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3">
              <div className="bg-muted h-4 w-24 rounded" />
              <div className="bg-muted h-8 w-32 rounded" />
              <div className="bg-muted h-3 w-40 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <div className="bg-muted h-80 w-full rounded-lg" />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
