# Building the Mac and Windows apps

PyInstaller cannot cross-compile: build the `.app` on a Mac and the `.exe` on Windows
(or let GitHub Actions do both, see the end).

## One-time setup (each machine)
- Node.js 18+ (https://nodejs.org) and Python 3.10+ (https://python.org, tick "Add to PATH" on Windows)
- `npm install`   (also creates `.venv` and installs PyInstaller, PyArmor, pywebview, mutagen)

## Build
    npm run build
Steps: Vite minifies the UI into `web_dist/` -> PyArmor obfuscates the Python -> PyInstaller packages.

## Output
- macOS:   `dist/LocalMusicAndVideo.app`
- Windows: `dist/LocalMusicAndVideo/LocalMusicAndVideo.exe` (keep the whole folder together)
`data.db` and `downloads/` are created next to the app (or in `~/LocalMusicAndVideo` if that place is read-only).

## Running the built app
- macOS (unsigned): right-click the app > Open > Open. If macOS says it is damaged: `xattr -cr LocalMusicAndVideo.app`.
  Build on Apple Silicon for M-series Macs, on an Intel Mac for Intel.
- Windows: SmartScreen may warn: More info > Run anyway. Needs the WebView2 runtime (already in Windows 10/11).
- End users still need yt-dlp and ffmpeg; the app installs them via Homebrew (Mac) or winget (Windows).

## Both platforms via GitHub
Push the project to GitHub, open Actions > "Build apps" > Run workflow. Download the Mac and Windows artifacts.
