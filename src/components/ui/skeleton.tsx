import { cn } from "@/lib/utils";

/** Pulsing block for loading placeholders. Prefer this over spinners for page/section loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-muted", className)} />
  );
}
