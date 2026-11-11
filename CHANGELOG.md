# Changelog

## 2.1.0
- Windows: a real installer (Inno Setup) plus a portable zip; the build now uses the folder layout instead of a single-file exe.
- New dashboard design: collapsible sidebar, KPI bar, sliding pill navigation, Settings tab, phone status widget.
- Video downloads work on any site yt-dlp supports (YouTube, Shorts, X, Facebook, Instagram, TikTok ...), with automatic fallbacks when merging fails.
- Android: several tracks download at once (1-3), timing lines in the console, built-in JavaScript runtime for YouTube.
- Android: lyrics, romaji/pinyin/romanization, optional English translation, any-folder saving, heat protection with "Run anyway".
- Android: files are no longer lost when yt-dlp reports an error for an optional step.
- GitHub Actions builds macOS (.dmg), Windows (.exe), Linux (.tar.gz) and Android (.apk) on every version tag.
