import { Skeleton } from '@/components/ui/skeleton';

export const HomeSkeleton = () => (
  <div className="min-h-dvh bg-background p-4 sm:p-6 pb-24 animate-in fade-in duration-300">
    {/* Header skeleton */}
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl" />
        <div>
          <Skeleton className="h-6 w-40 mb-1.5" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
    </div>

    {/* Search bar */}
    <Skeleton className="h-10 w-full rounded-lg mb-4" />

    {/* Action buttons */}
    <div className="flex gap-2 mb-6">
      <Skeleton className="h-9 w-24 rounded-lg" />
      <Skeleton className="h-9 w-32 rounded-lg" />
    </div>

    {/* Summary cards */}
    <div className="grid grid-cols-2 gap-3 mb-6">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>

    {/* Payment sources */}
    <Skeleton className="h-5 w-32 mb-3" />
    <div className="flex gap-3 overflow-hidden mb-6">
      <Skeleton className="h-20 w-36 rounded-xl flex-shrink-0" />
      <Skeleton className="h-20 w-36 rounded-xl flex-shrink-0" />
      <Skeleton className="h-20 w-36 rounded-xl flex-shrink-0" />
    </div>

    {/* Transaction list */}
    <Skeleton className="h-5 w-40 mb-3" />
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
          <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-3/4 mb-1.5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>

    {/* Bottom nav skeleton */}
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card p-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-12 rounded-lg" />
        ))}
      </div>
    </div>
  </div>
);
