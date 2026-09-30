"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { BrainIcon, ChevronDownIcon, Lightbulb } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";

import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
  compact: boolean;
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  /** Renders a static one-line thinking status instead of the expandable text. */
  compact?: boolean;
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    compact = false,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    // Track when streaming starts and compute duration
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    // Auto-open when streaming starts (unless explicitly closed)
    useEffect(() => {
      if (compact) return;
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [compact, isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (compact) return;
      if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [compact, isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen],
    );

    const contextValue = useMemo(
      () => ({ compact, duration, isOpen, isStreaming, setIsOpen }),
      [compact, duration, isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        {compact ? (
          <div className={cn("not-prose w-full", className)} {...props}>
            {children}
          </div>
        ) : (
          <Collapsible
            className={cn("not-prose mb-4 w-full", className)}
            onOpenChange={handleOpenChange}
            open={isOpen}
            {...props}
          >
            {children}
          </Collapsible>
        )}
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>Thinking...</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Thought for a few seconds</p>;
  }
  return <p>Thought for {duration} Seconds</p>;
};

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { compact, isStreaming, isOpen, duration } = useReasoning();

    // Compact mode keeps the thinking status but drops the disclosure
    // affordances — no chevron, no hover, sized to sit with tool activity
    // lines. Button-typed trigger props have no target on a status line, so
    // only className carries over.
    if (compact) {
      return (
        <div className={cn(
          "flex min-h-7 w-full items-center gap-2 py-0.5 text-xs text-muted-foreground",
          className,
        )}>
          <Lightbulb className="size-3.5 shrink-0" />
          {getThinkingMessage(isStreaming, duration)}
        </div>
      );
    }

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <Lightbulb className="size-4" />
            {getThinkingMessage(isStreaming, duration)}
            <ChevronDownIcon
              className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

const math = createMathPlugin({ singleDollarTextMath: true });
const streamdownPlugins = { cjk, code, math, mermaid };

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => {
  const { compact } = useReasoning();
  // Compact mode shows a status line only — the reasoning text never renders,
  // even if content is passed.
  if (compact) return null;
  return (
    <CollapsibleContent
      className={cn(
        "mt-4 text-sm",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...props}
    >
      <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
    </CollapsibleContent>
  );
});

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
