"use client";

import { useState, useEffect } from "react";
import { Share2, Copy, Check, Globe } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPublicFileStatus, setFilePublic } from "../../share-actions";

export function ShareButton({ projectId, filePath }: { projectId: string; filePath: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getPublicFileStatus(projectId, filePath).then((id) => {
        setShareId(id);
        setIsPublic(!!id);
        setIsLoading(false);
      });
    }
  }, [isOpen, projectId, filePath]);

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    try {
      const id = await setFilePublic(projectId, filePath, checked);
      setShareId(id);
      setIsPublic(checked);
      if (checked) {
        toast.success("File is now public");
      } else {
        toast.success("File is now private");
      }
    } catch {
      toast.error("Failed to update sharing status");
      setIsPublic(!checked);
    } finally {
      setIsLoading(false);
    }
  };

  const shareUrl = shareId && typeof window !== "undefined" ? `${window.location.origin}/share/${shareId}` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Share file">
              <Share2 className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Share this File</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Share File</h4>
            {/* <p className="text-sm text-muted-foreground">
              Make this file public so others can view and copy it.
            </p> */}
          </div>
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
            <div className="flex items-center space-x-3">
              <Globe className="size-5 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="public-toggle" className="text-sm font-medium">
                  Public link
                </Label>
                <p className="text-xs text-muted-foreground">
                  Anyone with the link can view
                </p>
              </div>
            </div>
            <Switch
              id="public-toggle"
              checked={isPublic}
              // onCheckedChange={() => notifyUpcomingFeature("Public sharing")}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>
          {isPublic && shareUrl && (
            <div className="flex space-x-2">
              <Input value={shareUrl} readOnly className="h-8 flex-1" />
              <Button size="sm" variant="secondary" className="shrink-0" onClick={handleCopy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="sr-only">Copy</span>
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
