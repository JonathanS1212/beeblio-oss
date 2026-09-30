"use client";

import type { CSSProperties, SyntheticEvent } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  PictureInPicture,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  MediaController,
  MediaControlBar,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPipButton,
  MediaPlaybackRateButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";

// Media Chrome is themed with CSS custom properties on the controller; every
// value resolves from the app's light/dark tokens, so the player follows the
// theme toggle. The controller's own background must be reset — it defaults
// to #000, which turns the audio bar and video letterbox into a black slab.
const CHROME_THEME = {
  "--media-font-family": "var(--font-sans, sans-serif)",
  "--media-background-color": "transparent",
  "--media-control-background": "transparent",
  "--media-control-hover-background": "color-mix(in oklab, var(--foreground) 8%, transparent)",
  "--media-icon-color": "var(--muted-foreground)",
  "--media-text-color": "var(--muted-foreground)",
  "--media-range-track-height": "4px",
  "--media-range-track-border-radius": "9999px",
  "--media-range-track-background": "color-mix(in oklab, var(--foreground) 14%, transparent)",
  "--media-range-bar-color": "var(--primary)",
  "--media-range-thumb-background": "var(--primary)",
  "--media-range-thumb-border": "none",
  "--media-range-thumb-height": "12px",
  "--media-range-thumb-width": "12px",
  "--media-range-thumb-border-radius": "9999px",
  "--media-range-thumb-box-shadow": "none",
} as CSSProperties;

// Tailwind's preflight resets `* { margin: 0; padding: 0 }`, and for custom
// element hosts any document rule beats the shadow `:host` styles — so the
// reset silently strips Media Chrome's paddings (icons collide, the volume
// slider balloons and crushes the timeline). These document-level rules are
// scoped to the player and restore the intended geometry with certainty.
const SCOPED_PLAYER_CSS = `
.media-chrome-scope media-play-button,
.media-chrome-scope media-seek-backward-button,
.media-chrome-scope media-seek-forward-button,
.media-chrome-scope media-mute-button,
.media-chrome-scope media-pip-button,
.media-chrome-scope media-fullscreen-button { padding: 7px; }
.media-chrome-scope media-playback-rate-button { padding: 7px 8px; }
.media-chrome-scope media-time-display { padding: 0 8px; }
.media-chrome-scope media-control-bar { display: flex; width: 100%; padding: 0 2px; }
.media-chrome-scope media-volume-range { width: 72px; }
.media-chrome-scope media-time-range { flex: 1 1 auto; min-width: 96px; }
`;

// The app's icon language is lucide stroke icons; each Media Chrome button
// exposes state slots, so its filled default glyphs are swapped 1:1. The
// button's shadow CSS fills slotted SVGs and forces min-width: 100% (its own
// defaults are filled glyphs) — inline styles are the only thing that beats
// both, and they restore lucide's stroke rendering.
const ICON_STYLE = {
  fill: "none",
  stroke: "var(--media-icon-color, currentColor)",
  width: 16,
  height: 16,
  minWidth: 0,
  flexShrink: 0,
} as CSSProperties;

function PlayControls({ withVideoActions }: { withVideoActions?: boolean }) {
  return (
    <MediaControlBar
      // Over video the bar floats on the footage: give it a translucent
      // themed surface instead of sitting on the audio card's background.
      style={withVideoActions ? {
        background: "color-mix(in oklab, var(--card) 80%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      } as CSSProperties : undefined}
    >
      <MediaPlayButton>
        <Play slot="play" style={ICON_STYLE} />
        <Pause slot="pause" style={ICON_STYLE} />
      </MediaPlayButton>
      <MediaSeekBackwardButton seekOffset={10}>
        <RotateCcw slot="icon" style={ICON_STYLE} />
      </MediaSeekBackwardButton>
      <MediaSeekForwardButton seekOffset={10}>
        <RotateCw slot="icon" style={ICON_STYLE} />
      </MediaSeekForwardButton>
      <MediaTimeRange />
      <MediaTimeDisplay showDuration />
      <MediaPlaybackRateButton rates={[1, 1.25, 1.5, 1.75, 2]} />
      <MediaMuteButton>
        <VolumeX slot="off" style={ICON_STYLE} />
        <Volume1 slot="low" style={ICON_STYLE} />
        <Volume slot="medium" style={ICON_STYLE} />
        <Volume2 slot="high" style={ICON_STYLE} />
      </MediaMuteButton>
      <MediaVolumeRange />
      {withVideoActions ? (
        <>
          <MediaPipButton>
            <PictureInPicture2 slot="enter" style={ICON_STYLE} />
            <PictureInPicture slot="exit" style={ICON_STYLE} />
          </MediaPipButton>
          <MediaFullscreenButton>
            <Maximize slot="enter" style={ICON_STYLE} />
            <Minimize slot="exit" style={ICON_STYLE} />
          </MediaFullscreenButton>
        </>
      ) : null}
    </MediaControlBar>
  );
}

export function MediaChromePlayer({
  kind,
  src,
  onError,
  onDuration,
}: {
  kind: "audio" | "video";
  src: string;
  onError: (reason: "unsupported" | "failed") => void;
  onDuration: (seconds: number) => void;
}) {
  const handleError = (event: SyntheticEvent<HTMLMediaElement>) => {
    // Code 4 (SRC_NOT_SUPPORTED) means the browser fetched the file but
    // cannot decode it; anything else is a loading failure.
    onError(event.currentTarget.error?.code === event.currentTarget.error?.MEDIA_ERR_SRC_NOT_SUPPORTED
      ? "unsupported"
      : "failed");
  };

  if (kind === "audio") {
    return (
      <>
        <style>{SCOPED_PLAYER_CSS}</style>
        <MediaController
          audio
          style={CHROME_THEME}
          className="media-chrome-scope h-14 w-full"
        >
          <audio
            slot="media"
            src={src}
            preload="metadata"
            onError={handleError}
            onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
          />
          <PlayControls />
        </MediaController>
      </>
    );
  }

  return (
    <>
      <style>{SCOPED_PLAYER_CSS}</style>
      <MediaController style={CHROME_THEME} className="media-chrome-scope h-full w-full">
        <video
          slot="media"
          src={src}
          preload="metadata"
          playsInline
          className="h-full w-full object-contain"
          onError={handleError}
          onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
        />
        <PlayControls withVideoActions />
      </MediaController>
    </>
  );
}
