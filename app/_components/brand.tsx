import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({
  href = "/",
  compact = false,
  small = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  /** Scaled-down mark + wordmark for dense surfaces like editor headers. */
  small?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center", small ? "gap-1.5" : "gap-2.5", className)}
      aria-label="Beeblio home"
    >
      <span className={cn("flex items-center justify-center transition-transform group-hover:-rotate-2", small ? "size-5" : "size-7")}>
        <img src="/beeblio-mark.svg" alt="" className={small ? "size-5" : "size-9"} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={cn("font-semibold tracking-[-0.035em]", small ? "text-[13px]" : "text-[1.15rem]")}>Beeblio</span>
          {/* <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Research Workspace
          </span> */}
        </span>
      )}
    </Link>
  );
}
