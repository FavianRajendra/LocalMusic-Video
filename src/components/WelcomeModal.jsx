import { motion } from "framer-motion";

const STEPS = [
  ["Nothing to install", "yt-dlp and ffmpeg are built into the app. Just open it and paste a link."],
  ["Paste a link", "A video or playlist from YouTube, X, Facebook, Instagram, TikTok or any of 1000+ other sites. The title, thumbnail, track count and estimated total size appear instantly."],
  ["Pick format and folder", "Choose Opus, MP3, FLAC, 4K and more. If the folder already has your music, those tracks are recognised and skipped."],
  ["Download, or add to The Vault", "Download grabs what is missing. In The Vault, Add playlist links a folder to a playlist without downloading anything first."],
  ["Keep it in sync", "Sync downloads new tracks and removes ones deleted online. Review missing lets you untick songs. Each playlist has its own progress bar and Stop button."],
];

export default function WelcomeModal({ onClose }) {
  return (
    <motion.div className="modal" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="glass sheet stack welcome" role="dialog" aria-modal="true" aria-label="Welcome" onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.96 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}>
        <span className="badge">Welcome</span>
        <h2>Your music and videos,<br />kept on your own drive.</h2>
        <p className="mut">Download playlists in the format you want, mirror them one-to-one, and never re-download what you already have.</p>
        <div className="steps">
          {STEPS.map(([t, d], i) => (
            <div className="step" key={t}><span className="num">{i + 1}</span><div><b>{t}</b><p className="mut small">{d}</p></div></div>
          ))}
        </div>
        <button className="primary" onClick={onClose}>Get started</button>
      </motion.div>
    </motion.div>
  );
}
