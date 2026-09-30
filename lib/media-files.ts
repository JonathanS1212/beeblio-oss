// Audio and video files stored in the workspace: they get dedicated icons in
// the file browsers and open in the media player instead of a text editor.
// Browser-decodable formats (mp3, mp4…) play inline; others (avi, wma…) still
// open in the player, which explains the missing codec and offers download.

export const AUDIO_FILE_EXTENSIONS = [
  "aac", "aif", "aiff", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "wma",
] as const;

export const VIDEO_FILE_EXTENSIONS = [
  "avi", "m4v", "mkv", "mov", "mp4", "ogv", "webm", "wmv",
] as const;

export function isAudioFileName(name: string) {
  return AUDIO_FILE_EXTENSIONS.includes(
    (name.split(".").pop() ?? "").toLowerCase() as (typeof AUDIO_FILE_EXTENSIONS)[number],
  );
}

export function isVideoFileName(name: string) {
  return VIDEO_FILE_EXTENSIONS.includes(
    (name.split(".").pop() ?? "").toLowerCase() as (typeof VIDEO_FILE_EXTENSIONS)[number],
  );
}
