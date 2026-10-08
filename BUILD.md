# Building LocalMusic and Video

One tag, four apps: `git tag v1.0.0 && git push --tags` makes GitHub Actions build and attach
**macOS .dmg, Windows .exe, Linux .tar.gz and Android .apk** to the Release (see `.github/workflows/build.yml`).

## Desktop (macOS / Windows / Linux), built on each OS
Needs Node 18+ and Python 3.10+.

    npm install          # JS deps + .venv (pywebview, PyInstaller, PyArmor, yt-dlp, imageio-ffmpeg ...)
    npm run build        # vite minify -> PyArmor obfuscate -> PyInstaller -> self-test
    npm run build -- --onefile     # Windows only: a single .exe

`yt-dlp` (official standalone binary, downloaded at build time) and `ffmpeg` (via imageio-ffmpeg) are bundled, so users install nothing.
`data.db` and `downloads/` are created next to the app, outside the bundle.
Linux: `pip install "pywebview[qt]"` into the .venv first (the CI does this); users need the usual Qt/X11 libraries.
macOS: unsigned - right-click > Open the first time, or `xattr -cr LocalMusicAndVideo.app`.

## Android
Needs JDK 17 + the Android SDK (`ANDROID_HOME`).

    npm run dev:android        # emulator/device, live reload
    npm run build:apk:debug    # installable APK  -> dist/android/
    npm run build:apk          # unsigned release APK (sign with your own keystore)

The APK contains the real yt-dlp + FFmpeg (youtubedl-android). Finished files are published to the public
`Music/<Playlist>/` (audio) or `Movies/<Playlist>/` (video) folders through MediaStore, so Poweramp sees them.
Android 10+, portrait only. A foreground service keeps downloads running with the screen off (allow notifications when asked).

## Lyrics (desktop + Android)
LRCLIB supplies the lyrics (synced when available). Japanese kana, Korean Hangul, and (with the optional romanizers) kanji/hanzi can get
romaji/pinyin lines, and an English translation can be added (Google Translate's unofficial endpoint, off by default).
Desktop bundles `pykakasi` + `pypinyin`. For Android, `npm run build:apk` tries to vendor them into the APK (needs internet once; if it
can't, kana/Hangul/translation still work). Synced `.lrc` files can only be saved next to a track in a folder you picked with Choose folder.
