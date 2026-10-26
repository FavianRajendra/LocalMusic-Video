# LocalMusic and Video

[![Build](https://github.com/YOUR_GITHUB_USER/LocalMusicAndVideo/actions/workflows/build.yml/badge.svg)](https://github.com/YOUR_GITHUB_USER/LocalMusicAndVideo/actions/workflows/build.yml)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/YOUR_BMC_USERNAME)

Download music and video from **YouTube, Shorts, X, Facebook, Instagram, TikTok and 1000+ other sites**, keep playlists in sync with a
one-to-one local copy, add lyrics (with romaji / pinyin and an English translation), and send files between your devices.
One app for **macOS, Windows, Linux and Android**, made by **CrispySoft**.

## Contents
[Features](#features) · [Install](#install) · [How to use it](#how-to-use-it) · [Lyrics](#lyrics) · [Troubleshooting](#troubleshooting) ·
[Build from source](#build-from-source) · [Publish on GitHub and build everything automatically](#publish-on-github-and-build-everything-automatically) ·
[Donations](#where-to-put-your-buy-me-a-coffee-link) · [Credits](#credits-and-licenses)

## Features
- **Any link, any site.** Paste a link; the app works out what it is. A single video from X, Facebook, TikTok and similar sites switches to *Video* by itself.
- **Audio**: Opus, MP3 (320/256/128), FLAC, M4A, WAV, OGG. Music downloads only the audio stream, never the video.
- **Video**: 4K, 1440p, 1080p60, 1080p, 720p, 480p or best. If merging fails the app falls back to one ready-made file instead of giving up.
- **Playlists (the Vault)**: add a playlist once, press **Sync** whenever you like. New tracks are downloaded, removed ones are deleted.
  Failed tracks are skipped (the others keep going) and shown with the reason. **Review missing** lets you untick songs to skip.
- **Pause / resume**, **Auto-sync** (every 5 or 10 minutes, only adds new tracks), **smart sorting** (playlists that just got new songs jump to the top).
- **Lyrics** from LRCLIB, synced when available, with romaji, pinyin, Korean romanization and an optional English translation.
- **Network Sync**: send playlists between computers and phones over Wi-Fi (LocalSend protocol).
- **Android**: saves to any folder you choose (or `Music/` and `Movies/`), runs in the background, slows down when the phone is hot.
- No installs for end users: yt-dlp and FFmpeg are built in.

## Install
Download the file for your system from the **[Releases](https://github.com/YOUR_GITHUB_USER/LocalMusicAndVideo/releases)** page.

| System | File | First start |
|---|---|---|
| macOS | `LocalMusicAndVideo-macOS.dmg` | Drag the app to Applications. It is not signed by Apple: **right-click > Open** the first time (or run `xattr -cr /Applications/LocalMusicAndVideo.app`). |
| Windows | `LocalMusicAndVideo-Windows.exe` | Double-click. If SmartScreen warns you: **More info > Run anyway**. |
| Linux | `LocalMusicAndVideo-Linux.tar.gz` | `tar xzf LocalMusicAndVideo-Linux.tar.gz && ./LocalMusicAndVideo/LocalMusicAndVideo`. Needs the usual desktop libraries (Qt WebEngine: `libnss3`, `libxkbcommon-x11-0`, `libxcb-cursor0` ...). |
| Android 10+ | `LocalMusicAndVideo-Android.apk` | Open the file, allow "install unknown apps" for your browser/files app, install. Allow notifications when asked (it keeps downloads alive in the background). The first start unpacks the downloader and can take up to a minute. |

## How to use it
### 1. Quick Download
1. **Paste a link** (YouTube, X, Facebook, Instagram, TikTok, ...). The title, thumbnail, track count and an **estimated total size** appear immediately.
2. Pick **Audio** or **Video** and a format. Folder: **Choose folder** (desktop and Android) or leave the default.
3. Optional: tick *Also keep in Vault* to turn a playlist into a synced one.
4. Press **Download**. Progress, speed and the current track are shown at the bottom; the **Console** button shows the raw log.

Files already in the folder are recognised and skipped (files are named `Title [id].ext`).

### 2. Vault (playlist manager)
- **Add to Vault** links a folder to a playlist **without downloading anything first**. You immediately see how many tracks are on disk, missing, or removed online.
- **Sync** downloads what is missing and removes what disappeared online. **Sync all** does every playlist.
- **Review missing** shows the missing songs; untick the ones you don't want (they are remembered). **Tracks** shows every track with its state and any error.
- **Pause / Resume** the whole queue (partly downloaded files continue where they stopped). **Stop** works per playlist.
- **Auto-sync**: Off / every 5 min / every 10 min while the app is open. It only ever *adds* new tracks.
- **Sort**: recently updated, name, last synced, most tracks. **Change cover** on a card to use your own picture.

### 3. Network Sync
Open the tab, tick **Allow incoming** only on networks you trust. Devices on the same Wi-Fi appear as cards.
*App-to-App* syncs libraries between two copies of this app (only missing files are transferred); *To LocalSend device* sends a playlist to any LocalSend app.
The Android app receives files; sending from the phone is not built yet.

### Android specifics
- **Choose folder** opens the Android file explorer: any folder on internal storage or an SD card. Each playlist gets its own sub-folder. *Use default* returns to `Music/` and `Movies/`.
- **Speed**: *Downloads at once* (1-3). More is faster and warmer. The console prints how long each track took.
- **Heat**: the app slows down when Android reports the phone is warm and waits when it is hot. **Run anyway** overrides it for the current batch; the switch under Quick Download turns it off for good.
- **Lyrics**: saved inside the track's tags. A synced `.lrc` file next to the track is only possible in a folder you picked with Choose folder.

## Lyrics
Switch them on or off under **Quick Download > Lyrics**: *Add lyrics*, *Romanize*, *English translation*.

| Script | Romanization | Notes |
|---|---|---|
| Japanese kana | Hepburn romaji, built in | works offline |
| Japanese kanji | needs `pykakasi` | bundled on desktop; on Android the build tries to bundle it |
| Korean Hangul | Revised Romanization, built in | common sound changes handled; hanja is not romanized |
| Chinese hanzi | pinyin, needs `pypinyin` | bundled on desktop; on Android the build tries to bundle it |

If a line can't be fully romanized the app skips the romaji line instead of showing a half-converted one.
The **translation** uses Google Translate's unofficial web endpoint: it can be blocked or rate-limited, it sends the lyric text to Google, and it is off by default.
In synced lyrics every added line repeats the timestamp of the original line.

## Troubleshooting
| Problem | What to do |
|---|---|
| **"Conversion failed"** | FFmpeg could not do one step on your device. The app steps down automatically (no thumbnail, no tags, then the raw stream) and keeps any finished file. Open the **Console**: `FFmpeg details:` has the real reason. |
| **Link shows an error / 0 tracks** | The error text says why. On Android press **Update downloader and retry**. Private, empty or region-blocked playlists can't be read. |
| **YouTube: "Sign in to confirm you're not a bot"** | YouTube is blocking that request. Try again later, switch network, or lower *Downloads at once*. Logged-in/cookie downloads are not supported yet. |
| **Facebook / X / Instagram says login required** | Private or login-only posts can't be downloaded (no cookie support yet). Public posts work. |
| **Downloads are slow** | Android: raise *Downloads at once* to 2 or 3 and keep *JavaScript runtime* on. Check the console lines `Saved ... in 9.2s (1.1MiB/s)`: if the speed is low, the site is throttling. Lyrics and conversion add a few seconds per track. |
| **Phone gets hot** | Lower *Downloads at once* to 1, keep the heat protection on, plug in and keep the phone cool. |
| **A track says "Geo-blocked / unavailable"** | It is skipped; the rest continues. Untick it under *Review missing* so it isn't retried. |
| **macOS "app is damaged"** | `xattr -cr /Applications/LocalMusicAndVideo.app` |
| **Android app stuck on "Starting the download engine"** | Wait up to a minute on first start; if an error is shown, **Try again**, then check internet. |

## Build from source
Needs **Node 18+**, **Python 3.10+** (and for Android: **JDK 17** and the Android SDK with `ANDROID_HOME` set).

```bash
npm install            # JS dependencies + a Python .venv with everything the app needs
npm run dev            # desktop app with hot reload
npm run build          # desktop app: minify -> obfuscate -> package -> self-test   (output in dist/)
npm run dev:android    # Android emulator/device with live reload
npm run build:apk:debug   # installable APK            -> dist/android/
npm run build:apk         # release APK (signed if you set the signing variables, see below)
```
Windows single-file exe: `npm run build -- --onefile`. Linux also needs `.venv/bin/pip install "pywebview[qt]"` first.
The `android/` folder is generated for you; the Android code lives in `mobile/` and `scripts/android-setup.mjs`.

## Publish on GitHub and build everything automatically
### One-time setup
1. Create an empty repository on GitHub (for example `LocalMusicAndVideo`, no README).
2. In the project folder:
   ```bash
   npm install                                   # creates package-lock.json: commit it
   npm run set-donate -- YOUR_BMC_NAME --repo YOUR_GITHUB_USER/LocalMusicAndVideo
   git init -b main
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_GITHUB_USER/LocalMusicAndVideo.git
   git push -u origin main
   ```
3. In the repo: **Settings > Actions > General > Workflow permissions** > *Read and write permissions* (needed to create Releases).
4. The **Checks** workflow now runs on every push. To try the full build without releasing: **Actions > Build LocalMusic and Video > Run workflow**.

### Every time you want to ship a new version
```bash
npm version patch          # 2.1.0 -> 2.1.1  (or minor / major). Edits package.json, commits, creates the tag v2.1.1
git push --follow-tags     # the tag starts the build
```
About 15-25 minutes later the **Releases** page has: `.dmg` (macOS), `.exe` (Windows), `.tar.gz` (Linux), `.apk` (Android) and automatic release notes.
The version number in `package.json` is also the app's version and the Android version, so updates install over older ones.
Edit `CHANGELOG.md` before tagging.

### Signing the Android app (so updates install over the old version)
Android only lets an update replace an installed app when **both are signed with the same key**. Create your key once and keep it safe:
```bash
keytool -genkeypair -v -keystore release.keystore -alias localmusic -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore      # macOS: base64 -i release.keystore | tr -d '\n'
```
Add four **repository secrets** (Settings > Secrets and variables > Actions):
`ANDROID_KEYSTORE_BASE64` (the base64 text), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`localmusic`), `ANDROID_KEY_PASSWORD`.
Without these the workflow still builds an installable debug APK, but its signature changes between builds, so each new version must be installed after uninstalling the old one.
**Never commit the keystore and never lose it** (`.gitignore` already excludes `*.keystore`).

## Where to put your Buy Me a Coffee link
Your page address is `https://www.buymeacoffee.com/<your-name>`. The easy way, one command that updates every place below:
```bash
npm run set-donate -- <your-name>
```
Or edit by hand:

| File | What to change | Where it shows |
|---|---|---|
| `src/config.js` | `BMC_USERNAME = "YOUR_BMC_USERNAME"` | In the app: **Welcome & guide > About > "Buy CrispySoft a coffee"** and the **Support CrispySoft** button in the desktop sidebar. Hidden while it still says `YOUR_...`. |
| `.github/FUNDING.yml` | `buy_me_a_coffee: YOUR_BMC_USERNAME` | The **Sponsor** button on your GitHub repository page. |
| `README.md` | the `buymeacoffee.com/YOUR_BMC_USERNAME` link at the top | The badge on your repo front page. |

Also set your repo link once: `npm run set-donate -- <your-name> --repo <github-user>/<repo>`. Rebuild (or push a new tag) to ship the change.

## Project structure
```
src/            React app (tabs, Vault, Network Sync, config.js)
backend/        Python engine: yt-dlp wrapper, sync, lyrics, LocalSend, database
main.py         desktop window (pywebview) and API
mobile/         Android native code: yt-dlp/FFmpeg engine, LocalSend, background service, lyrics plugin
scripts/        helpers: py.mjs, android-setup.mjs, gradle.mjs, set-donate.mjs
build.py        desktop packaging: obfuscation (PyArmor) + PyInstaller + self-test
.github/        workflows (build + checks) and the Sponsor button
```

## Credits and licenses
Made by **CrispySoft**. Built on great open-source work: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/),
[youtubedl-android](https://github.com/yausername/youtubedl-android), [LRCLIB](https://lrclib.net), [pywebview](https://github.com/r0x0r/pywebview),
[Capacitor](https://capacitorjs.com/), [mutagen](https://github.com/quodlibet/mutagen), [pykakasi](https://github.com/miurahr/pykakasi), [pypinyin](https://github.com/mozillazg/python-pinyin) and the [LocalSend](https://localsend.org) protocol.

**License of this project:** MIT (see `LICENSE`).
**Important - check before you distribute binaries.** The apps bundle third-party code with its own terms. To my knowledge FFmpeg's bundled build is GPL,
and `pykakasi` and `youtubedl-android` are GPL-licensed. If that is right, the binaries you publish fall under the GPL's conditions (for example, offering the source),
and the simplest way to stay compliant is to release this project itself under GPL-3.0. Please verify each license and, if in doubt, ask a lawyer: this is not legal advice.

**Disclaimer.** Downloading content may violate a site's terms of service or copyright law where you live. You are responsible for what you download and for respecting creators' rights.
