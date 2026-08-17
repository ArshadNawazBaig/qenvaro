import { PageContainer } from "@/components/shared/page-container";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomersLoading() {
  return (
    <PageContainer className="animate-pulse" aria-label="Loading customers">
      <div className="bg-muted h-5 w-40 rounded-md" />
      <div className="space-y-3">
        <div className="bg-muted h-9 w-56 rounded-lg" />
        <div className="bg-muted h-5 max-w-xl rounded-md" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3">
              <div className="bg-muted h-4 w-24 rounded" />
              <div className="bg-muted h-8 w-16 rounded" />
              <div className="bg-muted h-3 w-32 rounded" />
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
