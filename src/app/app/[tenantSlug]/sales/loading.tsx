import { PageContainer } from "@/components/shared/page-container";
import { Card, CardContent } from "@/components/ui/card";

export default function SalesLoading() {
  return (
    <PageContainer className="animate-pulse" aria-label="Loading sales history">
      <div className="bg-muted h-5 w-40 rounded-md" />
      <div className="space-y-3">
        <div className="bg-muted h-9 w-52 rounded-lg" />
        <div className="bg-muted h-5 max-w-xl rounded-md" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3">
              <div className="bg-muted h-4 w-24 rounded" />
              <div className="bg-muted h-8 w-28 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4">
          <div className="bg-muted h-9 w-full rounded-md" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="bg-muted h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
