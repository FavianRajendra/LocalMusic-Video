<div align="center">

# 🎵 LocalMusic and Video

**The ultimate open-source, cross-platform YouTube media downloader and 1:1 playlist synchronization app for macOS, Windows, and Linux.**

[![GitHub Release](https://img.shields.io/badge/Release-v2.0.0-blue?style=for-the-badge)](https://github.com/YOUR_USERNAME/LocalMusicAndVideo/releases)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=for-the-badge)]()

---

### ☕ Support Independent Open-Source Development!

> **Hey there! 👋** 
> 
> Building, maintaining, and keeping **LocalMusic and Video** up-to-date against YouTube's constant changes takes dozens of hours of late-night coding, testing, and cloud server builds. 
> 
> As an independent developer relying on open source, **I genuinely need your support to keep this project alive and free from ads, telemetry, or paywalls.** If this app saved you time, built your dream music library, or replaced a clunky web downloader, **please consider buying me a coffee!** Every single dollar helps cover server costs, development tools, and caffeine to power future updates. 💛

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate%20Now-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/YOUR_USERNAME)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/YOUR_USERNAME)

---

</div>

## ✨ Why LocalMusic and Video?

Most YouTube downloaders force you to copy-paste URLs every single time you want an update, redownload full playlists when a single track changes, or clutter your files with messy formats. 

**LocalMusic and Video** solves this completely with an **intelligent 1:1 local Vault sync system**, instant URL inspection, embedded metadata/lyrics, custom playlist artwork, and ultra-sleek dark mode UI.

---

## 🚀 Key Features

* **Instant URL Inspector:** Paste any link to instantly see track counts, channel names, thumbnail previews, and dynamic file size estimations before downloading.
* **The Vault (Smart 1:1 Playlist Sync):** 
  * Add online playlists to your local vault without downloading everything first.
  * Auto-detects existing local files (`Title [videoID].ext`) and skips re-downloading them.
  * **Strict Mirroring:** Automatically downloads newly added tracks and safely prunes removed offline files to maintain an exact 1:1 copy.
* **Custom Vault Cover Art:** Automatically fetches YouTube playlist thumbnails or allows you to upload custom cover art (`.jpg`, `.png`, `.webp`) for quick visual identification.
* **Rich Audio & Video Formats:**
  * **Audio:** Opus (~4MB), MP3 320kbps (~10MB), MP3 256kbps, MP3 128kbps, FLAC (~30MB Lossless), M4A (~6MB), WAV (~40MB), OGG.
  * **Video:** 4K Ultra HD, 2K QHD, 1080p60, 1080p HD, 720p HD, 480p SD, and MKV containers.
* **Metadata & Lyrics Integration:** Automatically embeds high-res album art, track details, and subtitles/lyrics directly into media files (`.opus`, `.mp3`, `.mp4`).
* **Zero-Setup Dependency Installer:** Checks system PATH for `yt-dlp` and `ffmpeg` on launch and offers one-click automated terminal installation via Homebrew (macOS) or Winget (Windows).
* **Modern Developer Experience:** Built with Vite, React, Python, SQLite, and `pywebview`.

---

## 📊 Formats & Estimated Storage Guide

| Format Option | Quality / Bitrate | Est. Size (4 min Song) | Est. Size (10 min Video) |
| :--- | :--- | :--- | :--- |
| **Opus** | High Efficiency | ~3–4 MB | — |
| **MP3 320kbps** | Standard High | ~9–10 MB | — |
| **FLAC** | Lossless Audio | ~30–40 MB | — |
| **M4A / AAC** | Apple Native | ~5–6 MB | — |
| **1080p MP4** | Full HD | — | ~120–150 MB |
| **4K MP4** | Ultra HD | — | ~450–600 MB |

*App automatically calculates total estimated download size for playlists on URL paste (e.g., `52 Tracks • Est. Total: ~468 MB`).*

---

## 🛠️ Developer Setup & Local Running

### Prerequisites
* **Node.js:** v18 or newer
* **Python:** 3.10 or newer

### Quick Start
1. Clone the repository:
   git clone https://github.com/YOUR_USERNAME/LocalMusicAndVideo.git
   cd LocalMusicAndVideo

2. Install dependencies:
   npm install

3. Start the development server:
   npm run dev
   (This concurrently launches the Vite React frontend on port 5173 and boots the Python backend process with hot reloading.)

---

## 📦 Building Production Executables

To build signed/bundled binaries locally:

npm run build

The build pipeline will:
1. Minify web assets via Vite.
2. Obfuscate Python logic using PyArmor/Nuitka.
3. Package the final app using PyInstaller.

Output directories:
* **macOS:** `dist/LocalMusicAndVideo.app`
* **Windows:** `dist/LocalMusicAndVideo/LocalMusicAndVideo.exe`

### Automated GitHub Actions Cross-Compilation
This repository includes `.github/workflows/build.yml`. Simply push code or trigger a release tag (`v1.0.0`) to automatically build and upload downloadable macOS (`.app`), Windows (`.exe`), and Linux binaries under **GitHub Actions / Releases**.

---

## 📂 Project Architecture

LocalMusicAndVideo/
├── .github/workflows/   # Automated CI/CD build actions
├── backend/
│   ├── engine.py        # yt-dlp wrapper, progress parsing, smart sync
│   └── db.py            # SQLite database management (data.db)
├── src/ / web/          # React + Vite frontend source files
├── scripts/             # Native dependency installer scripts (macOS/Win)
├── build.py             # Packaging pipeline (Minify + PyArmor + PyInstaller)
├── package.json         # NPM scripts and dev environment orchestration
└── main.py              # Application entry point (pywebview bridge)

---

## 📜 License & Disclaimer

This project is licensed under the **MIT License**.

*Disclaimer: This tool is strictly intended for personal media backup and archival of content you own or have explicit permission to download. Please respect creators and platform terms of service.*

---

<div align="center">

### 💖 Enjoying LocalMusic and Video? Keep it alive!

Making an app like this requires ongoing maintenance every time YouTube updates its backend. **Because I rely on project donations to sustain my work and cover living expenses, your generosity directly decides how long this tool remains active.**

If **LocalMusic and Video** saved you from monthly streaming subscriptions or clunky web converters, **please take 10 seconds to buy me a coffee.** Every single donation, no matter how small, means the world to me and keeps the code flowing!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate%20Now-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/YOUR_USERNAME)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/YOUR_USERNAME)

**Thank you so much for supporting open-source software! 🙏**

</div>
