#!/bin/bash
echo "LocalMusic and Video - installing yt-dlp and ffmpeg"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Install it from https://brew.sh, then reopen the app."
  read -n 1 -s -r -p "Press any key to close..."; exit 1
fi
brew install yt-dlp ffmpeg
echo; echo "Finished. Return to the app - it detects the tools automatically."
read -n 1 -s -r -p "Press any key to close..."
