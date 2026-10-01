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
import { getPublicFileStatus, getSharePublicOrigin, setFilePublic } from "../../share-actions";

export function ShareButton({ projectId, filePath }: { projectId: string; filePath: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publicOrigin, setPublicOrigin] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    void Promise.all([
      getPublicFileStatus(projectId, filePath),
      getSharePublicOrigin(),
    ]).then(([id, origin]) => {
      if (cancelled) return;
      setShareId(id);
      setIsPublic(!!id);
      setPublicOrigin(origin);
    }).catch(() => {
      if (!cancelled) toast.error("Failed to load sharing status");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
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

  const linkOrigin = publicOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const shareUrl = shareId && linkOrigin ? `${linkOrigin}/share/${shareId}` : "";
  const localLink = linkOrigin ? ["localhost", "127.0.0.1", "[::1]"].includes(new URL(linkOrigin).hostname) : false;

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
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>
          {isPublic && shareUrl && (
            <div className="space-y-2">
              <div className="flex space-x-2">
                <Input value={shareUrl} readOnly className="h-8 flex-1" />
                <Button size="sm" variant="secondary" className="shrink-0" onClick={handleCopy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  <span className="sr-only">Copy</span>
                </Button>
              </div>
              {localLink && <p className="text-xs text-amber-700 dark:text-amber-400">This localhost link only works on this computer. Set <code>PUBLIC_TUNNEL_ORIGIN</code> to share it with others.</p>}
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            This requires your app to be reachable at a public HTTPS URL. One way is to use a tunnel: set the URL as <code>PUBLIC_TUNNEL_ORIGIN</code> in <code>.env.local</code>.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
