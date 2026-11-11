import { useEffect, useRef, useState } from "react";
import { call, NATIVE } from "../bridge.js";
import { FORMATS, estimateMB } from "../formats.js";
import { useDebounced } from "../hooks.js";
import Num from "./Num.jsx";
import SegmentedPill from "./SegmentedPill.jsx";

/** The "paste a link" form. mode="quick" downloads; mode="vault" links a folder to the playlist without downloading. */
export default function SourcePanel({ mode, busy, onDone, onOpenSettings }) {
  const [url, setUrl] = useState(""), [media, setMedia] = useState("audio"), [fmt, setFmt] = useState("opus");
  const [dest, setDest] = useState(""), [info, setInfo] = useState(null), [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(false), [track, setTrack] = useState(false), [msg, setMsg] = useState("");
  const [bases, setBases] = useState({ audio: "Music", video: "Movies" });   // Android: the chosen folder per media type
  const [retry, setRetry] = useState(0), [updating, setUpdating] = useState(false);
  const touched = useRef(false);   // the user chose Audio/Video themselves: do not override it
  const q = useDebounced(url.trim(), 500);
  const f = FORMATS[media].find((x) => x[0] === fmt) || FORMATS[media][0];

  useEffect(() => { call("settings")?.then((s) => { setDest(s.dest); if (s.audio) setBases({ audio: s.audio, video: s.video }); }).catch(() => {}); }, []);
  useEffect(() => { if (NATIVE) setDest(bases[media]); }, [media, bases]);
  useEffect(() => {
    setInfo(null); setScan(null);
    if (!/^https?:\/\//.test(q)) return;
    let live = true; setLoading(true);
    call("inspect", q)
      .then((r) => {
        if (!live) return;
        setInfo(r);   // a single video from a non-YouTube site (X, Facebook, TikTok ...) is almost always wanted as a video
        if (r && !r.error && !r.is_playlist && r.site && !r.site.startsWith("youtube") && !touched.current) { setMedia("video"); setFmt("1080"); }
      })
      .catch((e) => { if (live) setInfo({ error: String(e?.message || e) }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [q, retry]);
  useEffect(() => {
    setScan(null);
    if (info && !info.error && dest) call("scan", q, dest, media).then(setScan).catch(() => setScan(null));
  }, [info, dest, media]);

  const pick = async () => {
    setMsg("");
    try {
      const r = await call("pick_folder", media);
      if (NATIVE) {
        if (r?.error) setMsg(r.error);
        else if (r?.path) { setBases((b) => ({ ...b, [r.kind]: r.path })); setMsg(`Saved as your ${r.kind} folder: ${r.path}`); }
      } else if (r) setDest(r);
    } catch (e) { setMsg(String(e?.message || e)); }
  };
  const reset = async () => { await call("reset_folder", media); const s = await call("settings"); setBases({ audio: s.audio, video: s.video }); setMsg(""); };
  const updateEngine = async () => {
    setUpdating(true); setMsg("");
    try { setMsg("Downloader update: " + (await call("update_ytdlp"))); } catch (e) { setMsg(String(e?.message || e)); }
    setUpdating(false); setRetry((n) => n + 1);
  };
  const go = async () => {
    setMsg("");
    if (mode === "vault") {
      const r = await call("vault_add", q, dest, media, fmt);
      if (r?.error) return setMsg(r.error);
      setUrl(""); onDone?.();
    } else if (!(await call("download", q, dest, media, fmt, track))) setMsg("A job is already running.");
  };
  const total = estimateMB(info, f), customDefault = media === "video" ? "Movies" : "Music";

  return (
    <div className="glass stack source">
      <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link: YouTube, X, Facebook, Instagram, TikTok..." aria-label="Link" />
      <p className="mut small hint">Works with YouTube, Shorts and 1000+ other sites. A single non-YouTube video switches to Video by itself.</p>
      {loading && <div className="skeleton" />}
      {info?.error && <p className="err">{info.error}</p>}
      {info?.error && NATIVE && <button className="ghost sm" disabled={updating} onClick={updateEngine}>{updating ? "Updating..." : "Update downloader and retry"}</button>}
      {info && !info.error && (
        <div className="meta">
          <img src={info.thumbnail} alt="" />
          <div>
            <h3>{info.title}</h3>
            <p className="mut">{info.uploader}</p>
            <span className="badge">{info.count} {info.count === 1 ? "track" : "tracks"} • Est. total: ~<Num mb={total} /></span>
            {scan && !scan.error && <p className="mut small">{scan.matched} already present • {scan.missing_local} to download • {scan.missing_online} not online</p>}
          </div>
        </div>
      )}
      <div className="row">
        <SegmentedPill label="Media type" value={media} options={[["audio", "Audio"], ["video", "Video"]]}
          onChange={(m) => { touched.current = true; setMedia(m); setFmt(FORMATS[m][0][0]); }} />
      </div>
      <div className="fmts">
        {FORMATS[media].map((x, i) => (
          <button key={x[0]} style={{ "--i": i }} className={"fmt" + (fmt === x[0] ? " on" : "")} onClick={() => setFmt(x[0])}>
            <b>{x[1]}</b><span>{x[2]}</span><em>{x[3]}</em>
          </button>
        ))}
      </div>
      <div className="row">
        <input className="field" readOnly value={dest} aria-label="Save location" />
        <button className="ghost" onClick={pick}>Choose folder</button>
        {NATIVE && bases[media] !== customDefault && <button className="ghost" onClick={reset}>Use default</button>}
      </div>
      {NATIVE && <p className="mut small">Tap Choose folder to save anywhere you like (internal storage or SD card); each playlist gets its own subfolder there. By default it goes to Music/ and Movies/.</p>}
      {mode === "quick" && <label className="chk"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Also keep in Vault</label>}
      <div className="row wrap">
        <button className="primary" disabled={!info || !!info.error || !dest || (mode === "quick" && busy)} onClick={go}>
          {mode === "vault" ? "Add to Vault" : scan?.matched ? `Download ${scan.missing_local} missing` : "Download"}
        </button>
        {onOpenSettings && <button className="ghost sm" onClick={onOpenSettings}>⚙ Lyrics & speed options</button>}
        {msg && <span className={/^(Saved|Downloader)/.test(msg) ? "mut small" : "err"}>{msg}</span>}
      </div>
    </div>
  );
}
