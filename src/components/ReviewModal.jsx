import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { call } from "../bridge.js";
import { Tag } from "./TrackList.jsx";

/** "Review missing": untick the songs to skip before syncing. Tracks that failed last time carry their reason as a red badge. */
export default function ReviewModal({ pl, onClose }) {
  const [r, setR] = useState(null), [off, setOff] = useState({});
  useEffect(() => {
    let live = true;
    call("tracklist", pl.id).then((x) => {
      if (!live) return;
      setR(x); if (!x.error) setOff(Object.fromEntries(x.tracks.filter((t) => t.skipped).map((t) => [t.id, true])));
    }).catch((e) => live && setR({ error: String(e?.message || e) }));
    return () => { live = false; };
  }, [pl.id]);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const missing = (r?.tracks || []).filter((t) => t.state === "missing"), extra = (r?.tracks || []).filter((t) => t.state === "extra");
  const picked = missing.filter((t) => !off[t.id]).length;
  const go = async () => {
    await call("set_skips", pl.id, missing.filter((t) => off[t.id]).map((t) => t.id), missing.filter((t) => !off[t.id]).map((t) => t.id));
    await call("sync", pl.id); onClose();
  };
  return (
    <motion.div className="modal" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div className="glass sheet stack" role="dialog" aria-modal="true" aria-label={"Review missing: " + pl.name} onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 36, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 36, scale: 0.97 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
        <div className="row between wrap"><h3>Review missing · {pl.name}</h3>
          <div className="row"><button className="ghost sm" onClick={() => setOff({})}>Select all</button>
            <button className="ghost sm" onClick={() => setOff(Object.fromEntries(missing.map((t) => [t.id, true])))}>None</button></div></div>
        {!r && <p className="mut">Checking the playlist…</p>}
        {r?.error && <p className="err">{r.error}</p>}
        {r && !r.error && !missing.length && !extra.length && <p className="mut">Everything is already on disk.</p>}
        <div className="mlist">
          {missing.map((t) => (
            <label className="trk pick" key={t.id}>
              <input type="checkbox" checked={!off[t.id]} onChange={(e) => setOff((o) => ({ ...o, [t.id]: !e.target.checked }))} />
              <span className="ti"><b>{t.title}</b><em>{t.artist}</em></span>
              {t.job === "error" ? <Tag t={t} /> : off[t.id] ? <span className="tag mute">Will skip</span> : null}
            </label>
          ))}
          {extra.length > 0 && <p className="mut small sect">Not in the online playlist any more (removed by Sync, not by auto-sync)</p>}
          {extra.map((t) => <div className="trk" key={t.id}><span className="ti"><b>{t.title}</b></span><Tag t={t} /></div>)}
        </div>
        <div className="row between wrap">
          <span className="mut small">Unchecked songs are remembered and skipped until you check them again.</span>
          <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={go}>{picked ? `Sync ${picked} selected` : "Sync"}</button></div>
        </div>
      </motion.div>
    </motion.div>
  );
}
