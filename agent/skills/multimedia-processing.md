---
description: Guidelines for processing multimedia files like audio and video.
---

# Multimedia Processing Guidelines

When tasked with processing multimedia files (e.g., video to audio extraction, audio transcription):

## Native FFmpeg
*   Use locally installed `ffmpeg` and `ffprobe`. Use them through `bash` for probing, clipping, transcoding, normalization, thumbnails, frame extraction, waveforms, and other deterministic local processing.
*   Use `-nostdin`, an explicit log level, bounded timeouts, quoted workspace paths, and a new output path. Probe inputs first and verify the resulting duration, streams, dimensions, and file size.

## Media Tools
*   `extract_audio` remains a convenient typed shortcut for MP3 extraction, but direct FFmpeg is supported when another codec, container, filter, or output is required.
*   Use absolute workspace paths (e.g., `/workspace/interview_01.mp4`) in commands and scripts.

## Transcription & Analysis
*   Use the `transcribe_audio` tool to transcribe extracted audio files.
*   Once you have the text transcript, proceed with thematic or qualitative analysis using standard string parsing or NLP libraries through `bash`.
