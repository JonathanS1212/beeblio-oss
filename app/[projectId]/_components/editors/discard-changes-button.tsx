"use client";

import { Undo2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DiscardChangesButton({
  dirty,
  disabled = false,
  onDiscard,
}: {
  dirty: boolean;
  disabled?: boolean;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-foreground" disabled={!dirty || disabled} aria-label="Discard changes">
              <Undo2 />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Discard Unsaved Changes</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard Unsaved Changes?</AlertDialogTitle>
          <AlertDialogDescription>
            The editor will return to the last saved version. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Discard Changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
