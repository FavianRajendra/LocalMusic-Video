// mb = typical size for `min` minutes of media (midpoint of the ranges)
export const FORMATS = {
  audio: [
    ["opus", "Opus", "Best efficiency", "~3–4 MB / 4 min", 3.5, 4],
    ["mp3-320", "MP3 320 kbps", "Highest MP3 quality", "~9–10 MB / 4 min", 9.5, 4],
    ["mp3-256", "MP3 256 kbps", "Standard quality", "~7–8 MB / 4 min", 7.5, 4],
    ["mp3-128", "MP3 128 kbps", "Compact", "~3–4 MB / 4 min", 3.5, 4],
    ["flac", "FLAC", "Lossless audio", "~30–40 MB / 4 min", 35, 4],
    ["m4a", "M4A / AAC", "Apple native", "~5–6 MB / 4 min", 5.5, 4],
    ["wav", "WAV", "Uncompressed PCM", "~40–50 MB / 4 min", 45, 4],
    ["ogg", "OGG Vorbis", "Open format", "~4–5 MB / 4 min", 4.5, 4],
  ],
  video: [
    ["2160", "4K Ultra HD", "2160p MP4", "~450–600 MB / 10 min", 525, 10],
    ["1440", "2K QHD", "1440p MP4", "~250–350 MB / 10 min", 300, 10],
    ["1080p60", "1080p60", "High frame rate MP4", "~180–220 MB / 10 min", 200, 10],
    ["1080", "1080p Full HD", "MP4", "~120–150 MB / 10 min", 135, 10],
    ["720", "720p HD", "MP4", "~60–80 MB / 10 min", 70, 10],
    ["480", "480p SD", "MP4", "~30–40 MB / 10 min", 35, 10],
    ["best", "Best available", "MKV container", "~450+ MB / 10 min", 525, 10],
  ],
};
export const estimateMB = (info, f) =>
  info ? (info.seconds > 0 ? info.seconds / 60 / f[5] : info.count) * f[4] : 0;
export const fmtSize = (mb) => (mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB");
