import { Skeleton } from '@/components/ui/skeleton';

export const GenericPageSkeleton = () => (
  <div className="min-h-dvh bg-background p-4 sm:p-6 pb-24 animate-in fade-in duration-300">
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-xl" />
      ))}
    </div>
  </div>
);
