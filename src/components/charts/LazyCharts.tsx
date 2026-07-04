import { lazy, Suspense } from "react";

const AnalyticsChartsInner = lazy(() => import("./AnalyticsChartsInner"));

export function AnalyticsCharts(props: {
  series: { date: string; likes: number; comments: number; shares: number }[];
  costByProvider: { name: string; value: number }[];
  topPosts: { topic: string; url: string | null; score: number; caption: string | null; likes: number; comments: number; shares: number; published_at: string | null }[];
  totalCost: number;
  wow: { likes: number; comments: number; shares: number; cost: number };
}) {
  return (
    <Suspense fallback={<AnalyticsChartsSkeleton />}>
      <AnalyticsChartsInner {...props} />
    </Suspense>
  );
}

function AnalyticsChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 glass rounded-2xl p-6">
        <div className="h-4 w-40 rounded shimmer-bg mb-4" />
        <div className="h-64 rounded-xl shimmer-bg" />
      </div>
      <div className="glass rounded-2xl p-6">
        <div className="h-4 w-24 rounded shimmer-bg mb-4" />
        <div className="h-64 rounded-xl shimmer-bg" />
      </div>
      <div className="lg:col-span-3 glass rounded-2xl p-6">
        <div className="h-4 w-28 rounded shimmer-bg mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg shimmer-bg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-48 rounded shimmer-bg" />
                <div className="h-3 w-24 rounded shimmer-bg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
