import { ChevronUp, Plus, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionList } from "./session-list";

export function ChatHistory({
  projectId,
  initialSessions,
  open,
  query,
  newConversationHref,
  onOpenChange,
  onQueryChange,
  onSelectConversation,
  onDeleteConversation,
}: {
  readonly projectId: string;
  readonly initialSessions: any[];
  readonly open: boolean;
  readonly query: string;
  readonly newConversationHref: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onSelectConversation: (sessionId: string) => void;
  readonly onDeleteConversation: (sessionId: string) => void;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="shrink-0 bg-sidebar/55"
    >
      <div className="flex h-10 w-full items-center gap-2 border-b pl-0 pr-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex h-full flex-1 items-center pl-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 text-left">Chat History</span>
          </button>
        </CollapsibleTrigger>
        <Button asChild size="icon-sm">
          <Link
            href={newConversationHref}
            aria-label="New conversation"
            onClick={() => onOpenChange(false)}
          >
            <Plus />
          </Link>
        </Button>
      </div>
      <CollapsibleContent>
        <div className="mb-1.5 flex h-[min(42dvh,22rem)] min-h-0 flex-col rounded-b-xl bg-card shadow-sm">
          <div className="shrink-0 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="h-8 rounded-lg pl-8 text-xs md:text-xs"
              />
            </div>
          </div>
          <ScrollArea className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden px-2.5 pb-0">
            <SessionList
              projectId={projectId}
              initialSessions={initialSessions}
              query={query}
              onSelectConversation={onSelectConversation}
              onDeleteConversation={onDeleteConversation}
            />
          </ScrollArea>
          <button
            type="button"
            className="flex h-5 w-full items-center justify-center rounded-b-xl bg-transparent text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="Close chat history"
          >
            <ChevronUp className="size-3.5" />
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
