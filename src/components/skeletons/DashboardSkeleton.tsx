import { Skeleton } from '@/components/ui/skeleton';

export const DashboardSkeleton = () => (
  <div className="min-h-dvh bg-background p-4 sm:p-6 animate-in fade-in duration-300">
    {/* Header */}
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>

    {/* Summary row */}
    <div className="grid grid-cols-3 gap-3 mb-6">
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-20 rounded-xl" />
    </div>

    {/* Chart */}
    <Skeleton className="h-64 rounded-xl mb-6" />

    {/* Category breakdown */}
    <Skeleton className="h-5 w-36 mb-3" />
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3 w-full rounded-full" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  </div>
);
