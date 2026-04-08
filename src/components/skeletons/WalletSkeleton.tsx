import { Skeleton } from '@/components/ui/skeleton';

export const WalletSkeleton = () => (
  <div className="min-h-dvh bg-background p-4 sm:p-6 pb-24 animate-in fade-in duration-300">
    <Skeleton className="h-8 w-32 mb-6" />

    {/* Balance card */}
    <Skeleton className="h-32 rounded-2xl mb-6" />

    {/* Payment sources grid */}
    <Skeleton className="h-5 w-40 mb-3" />
    <div className="grid grid-cols-2 gap-3 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>

    {/* Savings goals */}
    <Skeleton className="h-5 w-36 mb-3" />
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  </div>
);
