import { Skeleton } from '@/components/ui/skeleton';

export default function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden shadow-card">
      {/* Header skeleton */}
      <div className="flex bg-muted/50 border-b border-border h-14 px-4 items-end pb-2 gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-10" />
        <div className="flex-1 flex gap-4 justify-end">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-16" />
          ))}
        </div>
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center px-4 py-2.5 border-b border-border/60 gap-4" style={{ height: 42 }}>
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-8" />
          <div className="flex-1 flex gap-6 justify-end">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-12" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
