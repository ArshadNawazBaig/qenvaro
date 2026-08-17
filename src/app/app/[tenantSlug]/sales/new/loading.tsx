import { PageContainer } from "@/components/shared/page-container";
import { Card, CardContent } from "@/components/ui/card";

export default function NewSaleLoading() {
  return (
    <PageContainer className="animate-pulse" aria-label="Loading point of sale">
      <div className="bg-muted h-5 w-40 rounded-md" />
      <div className="space-y-3">
        <div className="bg-muted h-9 w-48 rounded-lg" />
        <div className="bg-muted h-5 max-w-xl rounded-md" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-muted h-40 rounded-xl" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <div className="bg-muted h-8 rounded-lg" />
            <div className="bg-muted h-24 rounded-lg" />
            <div className="bg-muted h-10 rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
