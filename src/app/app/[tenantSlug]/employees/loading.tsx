import { Card, CardContent } from "@/components/ui/card";

export default function WorkforceLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="bg-muted h-12 animate-pulse rounded-xl" />
      <div className="bg-muted h-24 animate-pulse rounded-xl" />
      <Card>
        <CardContent className="h-80 animate-pulse" />
      </Card>
    </div>
  );
}
