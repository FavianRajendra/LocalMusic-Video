# LocalMusic and Video

[![Build](https://github.com/FavianRajendra/LocalMusic-Video/actions/workflows/build.yml/badge.svg)](https://github.com/FavianRajendra/LocalMusic-Video/actions/workflows/build.yml)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/favianrajed)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Download music and video from **YouTube, Shorts, X, Facebook, Instagram, TikTok, and 1000+ other sites**, keep playlists in sync with a one-to-one local copy, add lyrics (with romaji / pinyin / Korean romanization and optional English translations), and send files across your devices over local Wi-Fi.
One unified cross-platform application for **macOS, Windows, Linux, and Android**, created by **CrispySoft**.

---

## Contents
[Features](#features) · [Install](#install) · [How to use it](#how-to-use-it) · [Lyrics](#lyrics) · [Troubleshooting](#troubleshooting) · [Build from source](#build-from-source) · [Publish on GitHub and build everything automatically](#publish-on-github-and-build-everything-automatically) · [Donations](#where-to-put-your-buy-me-a-coffee-link) · [Credits and licenses](#credits-and-licenses)

---

## Features
- **Any link, any site:** Paste a URL; the app automatically resolves the media type. Single videos from X, Facebook, TikTok, and similar platforms switch to *Video* mode automatically.
- **Audio Optimization:** Supports Opus, MP3 (320/256/128), FLAC, M4A, WAV, and OGG. Music downloads exclusively pull audio streams (`-f bestaudio`), avoiding raw video downloads.
- **Video Flexibility:** 4K, 1440p, 1080p60, 1080p, 720p, 480p, or best quality. Includes automatic fallback to single-file downloads if stream merging fails.
- **Playlists (The Vault):** Link a playlist directory once and sync whenever needed. New tracks are downloaded, removed tracks are cleaned up, and failed tracks are skipped with clear error explanations. Use **Review missing** to selectively skip tracks.
- **Parallel Downloads & Throttling Mitigation:** Configurable parallel downloading (1 to 3 concurrent tracks) and built-in JavaScript engine support to bypass YouTube bandwidth throttling.
- **Pause / Resume & Auto-Sync:** Pause active download queues without losing progress (relying on `.part` files). Enable optional background polling (every 5 or 10 minutes) that automatically bumps updated playlists to the top with an "Updated" badge.
- **Lyrics Engine:** Embedded metadata tags and synced `.lrc` generation via LRCLIB, featuring offline romaji (Hepburn), pinyin, Korean romanization, and optional English translations.
- **Network Sync (LocalSend Protocol):** Zero-config discovery (UDP multicast `53317`) for direct 1:1 SQLite database diffing between desktop clients or mobile transfers.
- **Native Android Engine:** Packages `yt-dlp` and `FFmpeg` on-device via Capacitor, outputting directly to public storage (`Music/<Playlist>/` and `Movies/<Playlist>/`) for compatibility with players like Poweramp.
- **Zero End-User Dependencies:** `yt-dlp` and `FFmpeg` binaries are completely bundled out-of-the-box.

---

## Install
Download the latest binaries directly from the **[Releases](https://github.com/FavianRajendra/LocalMusic-Video/releases)** page.

| System | File | First Start Instructions |
|---|---|---|
| **macOS** | `LocalMusicAndVideo-macOS.dmg` | Drag to Applications. Unsigned build: **Right-click > Open** on first run (or run `xattr -cr /Applications/LocalMusicAndVideo.app`). |
| **Windows** | `LocalMusicAndVideo-Windows-Setup.exe` | Run installer. If SmartScreen alerts: click **More info > Run anyway**. |
| **Linux** | `LocalMusicAndVideo-Linux.tar.gz` | Extract: `tar xzf LocalMusicAndVideo-Linux.tar.gz && ./LocalMusicAndVideo/LocalMusicAndVideo`. Requires standard desktop webview libraries (`libnss3`, `libxkbcommon-x11-0`, `libxcb-cursor0`). |
| **Android 10+** | `LocalMusicAndVideo-Android.apk` | Open the APK and allow "Install from unknown sources". Allow notification permissions to keep downloads running reliably in the background. |

---

## How to use it

### 1. Quick Download
1. **Paste a link** (YouTube, X, Facebook, Instagram, TikTok, etc.). Title, thumbnail, track count, and estimated total download size load automatically.
2. Select **Audio** or **Video** and your preferred format quality. Choose a target folder or keep default settings.
3. Optional: Check *Also keep in Vault* to convert a one-off download into a tracked playlist.
4. Click **Download**. Monitor live speed, track metadata ("Artist – Title"), and real-time logs via the **Console**.

### 2. Vault (Playlist Manager)
- **Add to Vault:** Links a local folder to a playlist URL without downloading immediately. View disk counts, missing tracks, and removed online items.
- **Sync / Sync All:** Downloads missing items and cleans up obsolete tracks across single or all vaulted playlists.
- **Review Missing:** Inspect missing track lists before downloading and uncheck specific items to permanently skip them.
- **Pause / Resume:** Temporarily pause active downloads without losing partially downloaded `.part` data.
- **Auto-Sync:** Background polling (Off / 5 min / 10 min) fetches new online additions while keeping CPU overhead minimal.
- **Smart Sorting:** Sort by recently updated, name, last synced, or track count. Updated playlists jump to the top automatically.

### 3. Network Sync
Open the **Network Sync** tab and enable **Allow incoming** on trusted local Wi-Fi networks.
- **App-to-App Mode:** Computes 1:1 SQLite diffs between two instances of LocalMusic and Video, transferring only missing tracks.
- **To LocalSend Device Mode:** Streams selected Vault playlists directly to standard LocalSend receivers.
- **Android Target Paths:** Configure target relative directory mappings (e.g., `Music/Lofi Beats/`) saved per playlist in `data.db`.

---

## Lyrics
Configure settings under **Quick Download > Lyrics**: *Add lyrics*, *Romanize*, and *English translation*.

| Script | Romanization System | Notes |
|---|---|---|
| **Japanese Kana** | Hepburn romaji (built-in) | Offline support |
| **Japanese Kanji** | `pykakasi` | Bundled on desktop & Android |
| **Korean Hangul** | Revised Romanization (built-in) | Handles common sound changes; Hanja excluded |
| **Chinese Hanzi** | Pinyin (`pypinyin`) | Bundled on desktop & Android |

*Translations use Google Translate's public endpoint (optional and off by default). Synced `.lrc` files duplicate timestamp signatures per translated line.*

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **"Conversion failed"** | FFmpeg failed a post-processing step. The app automatically falls back (removing thumbnails or tags) to preserve the core media file. Check the **Console** for `FFmpeg details:`. |
| **Link error / 0 tracks** | Verify playlist privacy. On Android, tap **Update downloader and retry** to update `yt-dlp`. Private or geo-restricted links are skipped. |
| **YouTube bot/sign-in warning** | YouTube is throttling or blocking requests. Lower *Downloads at once*, switch networks, or try again later. |
| **Slow download speeds** | On Android: Increase *Downloads at once* to 2 or 3 and ensure *JavaScript runtime* remains enabled. Check console logs (`Saved ... in 9.2s (1.1MiB/s)`). |
| **Phone overheating** | Lower *Downloads at once* to 1, keep thermal throttling protection active, and keep the phone in a cool environment. |
| **macOS "app is damaged"** | Run `xattr -cr /Applications/LocalMusicAndVideo.app` in Terminal. |

---

## Build from source

### Prerequisites
- **Node.js** (v20+)
- **Python** (v3.11+)
- **Java 21 & Android SDK** (for Android builds)

```bash
npm install               # Install dependencies and setup Python virtualenv
npm run dev               # Launch desktop app with live reload
npm run build             # Build production desktop app (dist/)
npm run dev:android       # Launch Android live reload mode
npm run build:apk:debug   # Compile debug Android APK (dist/android/)
npm run build:apk         # Compile release Android APK