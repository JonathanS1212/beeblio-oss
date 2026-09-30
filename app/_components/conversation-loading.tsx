import { LoaderCircle } from "lucide-react";

export function ConversationLoading() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-background"
      role="status"
      aria-label="Loading Conversation"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-6">
        <div className="flex justify-end">
          <div className="h-14 w-3/4 animate-pulse rounded-2xl rounded-br-md bg-primary/10" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-11/12 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          <span>Loading Conversation…</span>
        </div>
      </div>
      <div className="h-[105px] shrink-0 border-t bg-background p-3">
        <div className="h-full animate-pulse rounded-xl border bg-muted/40" />
      </div>
    </div>
  );
}
