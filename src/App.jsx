import { useEffect, useRef, useState } from "react";
import { call, NATIVE } from "./bridge.js";
import NetworkSync from "./NetworkSync.jsx";
import { FORMATS, estimateMB, fmtSize } from "./formats.js";



const ACTIVE = (j) => j && ["queued", "running", "paused"].includes(j.status);

const Ic = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICONS = {
  quick: Ic(<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />),
  vault: Ic(<><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></>),
  net: Ic(<><circle cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8" /></>),
};
const TABS = [["quick", "Quick Download"], ["vault", "Vault"], ["net", "Network Sync"]];

const STEPS = [
  ["Nothing to install", "yt-dlp and ffmpeg are built into the app. Just open it and paste a link."],
  ["Paste a link", "Drop in a video or playlist URL. The title, channel, thumbnail, track count and estimated total size appear instantly."],
  ["Pick format and folder", "Choose Opus, MP3, FLAC, 4K and more. If the folder already has your music, those tracks are recognised and skipped."],
  ["Download, or add to the Vault", "Download grabs what's missing. In the Vault tab, Add to Vault links a folder to a playlist without downloading anything."],
  ["Keep it in sync", "Sync downloads new tracks and removes ones deleted online. Each playlist has its own progress bar and Stop button."],
];

function Guide({ onStart }) {
  return (
    <div className="guide">
      <div className="hero glass">
        <span className="badge">Welcome</span>
        <h2>Your music and videos,<br />kept on your own drive.</h2>
        <p className="mut">Download playlists in the format you want, mirror them one-to-one, and never re-download what you already have.</p>
        <button className="primary" onClick={onStart}>Get started</button>
      </div>
      <h3>How to use it</h3>
      <div className="steps">{STEPS.map(([t, d], i) => (
        <div className="step glass" key={t} style={{ "--i": i }}><span className="num">{i + 1}</span><div><b>{t}</b><p className="mut small">{d}</p></div></div>
      ))}</div>
      <h3>Good to know</h3>
      <div className="glass stack small">
        <p><b>Playing Opus in Poweramp:</b> point Poweramp at your download folder. Cover art and metadata are embedded in each file.</p>
        <p><b>Lyrics:</b> fetched from LRCLIB after each audio download and saved inside the file's tags (and as a .lrc file beside the track when the folder allows it). Japanese, Korean and Chinese lines can get romaji/pinyin and an English translation: see the Lyrics options on Quick Download. Some tracks have no lyrics.</p>
        <p><b>Stopping:</b> Stop on a Vault card halts only that playlist. Finished files are kept.</p>
        <p><b>Files:</b> data.db and your downloads live next to the app, not inside it.</p>
      </div>
      <h3>About</h3>
      <div className="glass stack small">
        <p><b>LocalMusic and Video</b> · version 2.0</p>
        <p className="mut">Built with React, Python and pywebview. Powered by yt-dlp, ffmpeg, mutagen and LRCLIB.</p>
        <p className="mut">For personal use. You're responsible for respecting copyright and the terms of the sites you download from.</p>
      </div>
    </div>
  );
}

function Num({ mb }) {
  const [v, setV] = useState(0), from = useRef(0);
  useEffect(() => {
    const a = from.current, t0 = performance.now(); let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      setV(a + (mb - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = mb; };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [mb]);
  return fmtSize(v);
}

function useDebounced(v, ms) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Source({ mode, busy, onDone }) {
  const [url, setUrl] = useState(""), [media, setMedia] = useState("audio"), [fmt, setFmt] = useState("opus");
  const [dest, setDest] = useState(""), [info, setInfo] = useState(null), [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(false), [track, setTrack] = useState(false), [msg, setMsg] = useState("");
  const q = useDebounced(url.trim(), 500);
  const f = FORMATS[media].find((x) => x[0] === fmt) || FORMATS[media][0];

  const [bases, setBases] = useState({ audio: "Music", video: "Movies" });   // Android: chosen folder per media type
  useEffect(() => { call("settings")?.then((s) => { setDest(s.dest); if (s.audio) setBases({ audio: s.audio, video: s.video }); }); }, []);
  useEffect(() => { if (NATIVE) setDest(bases[media]); }, [media, bases]);
  const [retry, setRetry] = useState(0), [updating, setUpdating] = useState(false);
  const [ly, setLy] = useState({ on: true, romaji: true, translate: false });
  useEffect(() => {
    Promise.all(["on", "romaji", "translate"].map((k) => call("get_setting", "lyrics_" + k)))
      .then(([x, y, z]) => setLy({ on: x !== "0", romaji: y !== "0", translate: z === "1" })).catch(() => {});
  }, []);
  const [heat, setHeat] = useState(true);
  useEffect(() => { if (NATIVE) call("get_setting", "heat_guard").then((v) => setHeat(v !== "0")).catch(() => {}); }, []);
  const setHeatGuard = (v) => { setHeat(v); call("set_setting", "heat_guard", v ? "1" : "0"); };
  const setLyric = (k, v) => { setLy((o) => ({ ...o, [k]: v })); call("set_setting", "lyrics_" + k, v ? "1" : "0"); };
  const reset = async () => { await call("reset_folder", media); const s = await call("settings"); setBases({ audio: s.audio, video: s.video }); setMsg(""); };
  const updateEngine = async () => {
    setUpdating(true); setMsg("");
    try { setMsg("Downloader update: " + (await call("update_ytdlp"))); } catch (e) { setMsg(String(e?.message || e)); }
    setUpdating(false); setRetry((n) => n + 1);
  };
  useEffect(() => {
    setInfo(null); setScan(null);
    if (!/^https?:\/\//.test(q)) return;
    let live = true; setLoading(true);
    call("inspect", q)
      .then((r) => { if (live) setInfo(r); })
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
  const go = async () => {
    setMsg("");
    if (mode === "vault") {
      const r = await call("vault_add", q, dest, media, fmt);
      if (r?.error) return setMsg(r.error);
      setUrl(""); onDone?.();
    } else if (!(await call("download", q, dest, media, fmt, track))) setMsg("A job is already running.");
  };
  const total = estimateMB(info, f);

  return (
    <div className="glass stack">
      <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a video or playlist link" />
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
            {scan && !scan.error && (
              <p className="mut small">{scan.matched} already present • {scan.missing_local} to download • {scan.missing_online} not online</p>
            )}
          </div>
        </div>
      )}
      <div className="row">
        <div className="seg">{["audio", "video"].map((m) => (
          <button key={m} className={media === m ? "on" : ""} onClick={() => { setMedia(m); setFmt(FORMATS[m][0][0]); }}>{m === "audio" ? "Audio" : "Video"}</button>
        ))}</div>
      </div>
      <div className="fmts">{FORMATS[media].map((x, i) => (
        <button key={x[0]} style={{ "--i": i }} className={"fmt" + (fmt === x[0] ? " on" : "")} onClick={() => setFmt(x[0])}>
          <b>{x[1]}</b><span>{x[2]}</span><em>{x[3]}</em>
        </button>
      ))}</div>
      <div className="row"><input className="field" readOnly value={dest} /><button className="ghost" onClick={pick}>Choose folder</button>{NATIVE && bases[media] !== (media === "video" ? "Movies" : "Music") && <button className="ghost" onClick={reset}>Use default</button>}</div>
      {NATIVE && <p className="mut small">Tap Choose folder to save anywhere you like (internal storage or SD card); each playlist gets its own subfolder there. By default it goes to Music/ and Movies/.</p>}
      {mode === "quick" && <label className="chk"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Also keep in Vault</label>}
      {NATIVE && <label className="chk"><input type="checkbox" checked={heat} onChange={(e) => setHeatGuard(e.target.checked)} /> Pause downloads when the phone gets hot (recommended)</label>}
      {media === "audio" && (
        <div className="lyr">
          <b className="small">Lyrics</b>
          <label className="chk"><input type="checkbox" checked={ly.on} onChange={(e) => setLyric("on", e.target.checked)} /> Add lyrics (synced when available)</label>
          {ly.on && <label className="chk"><input type="checkbox" checked={ly.romaji} onChange={(e) => setLyric("romaji", e.target.checked)} /> Romanize Japanese, Korean and Chinese (romaji, pinyin)</label>}
          {ly.on && <label className="chk"><input type="checkbox" checked={ly.translate} onChange={(e) => setLyric("translate", e.target.checked)} /> Add an English translation</label>}
          {ly.on && ly.translate && <p className="mut small">Translation sends the lyric text to Google Translate (an unofficial endpoint, best effort).</p>}
        </div>
      )}
      <div className="row">
        <button className="primary" disabled={!info || info.error || !dest || (mode === "quick" && busy)} onClick={go}>
          {mode === "vault" ? "Add to Vault" : scan?.matched ? `Download ${scan.missing_local} missing` : "Download"}
        </button>
        {msg && <span className={/^(Saved|Downloader)/.test(msg) ? "mut small" : "err"}>{msg}</span>}
      </div>
    </div>
  );
}

const SORTS = [["recent", "Recently updated"], ["name", "Name A–Z"], ["synced", "Last synced"], ["size", "Most tracks"]];
const AUTO = [["0", "Off"], ["5", "Every 5 min"], ["10", "Every 10 min"]];
const who = (c) => (c?.title ? (c.artist ? c.artist + " – " : "") + c.title : "");

function rowLabel(t) {
  if (t.job === "error") return <span className="lbl bad" title={t.msg}>{t.msg || "Failed"}</span>;
  if (t.job === "downloading") return <span className="lbl live">Downloading…</span>;
  if (t.state === "present") return <span className="lbl ok">On disk</span>;
  if (t.state === "extra") return <span className="lbl warn">Will be removed</span>;
  return <span className="lbl">{t.skipped ? "Skipped" : "Missing"}</span>;
}

function TrackList({ pid, active }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let live = true;
    const load = async () => { const x = await call("tracklist", pid); if (live) setR(x); };
    load(); const t = active ? setInterval(load, 4000) : null;
    return () => { live = false; if (t) clearInterval(t); };
  }, [pid, active]);
  if (!r) return <p className="mut small">Loading tracks…</p>;
  if (r.error) return <p className="err small">{r.error}</p>;
  return (
    <div className="tracks">{r.tracks.map((t) => (
      <div className={"trk" + (t.job === "error" ? " bad" : "")} key={t.id}>
        <span className="ti"><b>{t.title}</b><em>{t.artist}</em></span>{rowLabel(t)}
      </div>))}</div>
  );
}

function Review({ pl, onClose }) {
  const [r, setR] = useState(null), [off, setOff] = useState({});
  useEffect(() => {
    call("tracklist", pl.id).then((x) => { setR(x); if (!x.error) setOff(Object.fromEntries(x.tracks.filter((t) => t.skipped).map((t) => [t.id, true]))); });
  }, [pl.id]);
  const missing = (r?.tracks || []).filter((t) => t.state === "missing"), extra = (r?.tracks || []).filter((t) => t.state === "extra");
  const picked = missing.filter((t) => !off[t.id]).length;
  const go = async () => {
    await call("set_skips", pl.id, missing.filter((t) => off[t.id]).map((t) => t.id), missing.filter((t) => !off[t.id]).map((t) => t.id));
    await call("sync", pl.id); onClose();
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="glass stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Review missing · {pl.name}</h3>
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
              {t.job === "error" ? <span className="lbl bad">Failed last time: {t.msg}</span> : off[t.id] && <span className="lbl">Will skip</span>}
            </label>))}
          {extra.length > 0 && <p className="mut small sect">Not in the online playlist any more (removed by Sync, not by auto-sync)</p>}
          {extra.map((t) => <div className="trk" key={t.id}><span className="ti"><b>{t.title}</b></span><span className="lbl warn">Will be removed</span></div>)}
        </div>
        <div className="row between">
          <span className="mut small">Unchecked songs are remembered and skipped until you check them again.</span>
          <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={go}>{picked ? `Sync ${picked} selected` : "Sync"}</button></div>
        </div>
      </div>
    </div>
  );
}

function Vault({ busy, jobs, paused, recent }) {
  const [list, setList] = useState([]), [st, setSt] = useState({}), [sort, setSort] = useState("recent");
  const [auto, setAuto] = useState("0"), [open, setOpen] = useState({}), [review, setReview] = useState(null);
  const load = async () => {
    const l = (await call("vault_list")) || []; setList(l);
    for (const p of l) {   // one at a time: each check can start a downloader process, and a burst of them makes a phone hot
      try {
        const s = await call("vault_status", p.id);
        setSt((o) => ({ ...o, [p.id]: s }));
        if (s?.cover) setList((cur) => cur.map((x) => (x.id === p.id ? { ...x, cover: s.cover } : x)));
      } catch (e) { setSt((o) => ({ ...o, [p.id]: { error: String(e?.message || e) } })); }
    }
  };
  useEffect(() => {
    call("get_setting", "vault_sort").then((v) => v && setSort(v)); call("get_setting", "auto_sync").then((v) => setAuto(v || "0")); load();
  }, []);
  const wasBusy = useRef(false);
  useEffect(() => { if (wasBusy.current && !busy) load(); wasBusy.current = busy; }, [busy]);

  const size = (p) => (st[p.id]?.matched || 0) + (st[p.id]?.missing_local || 0);
  const keyOf = { recent: (p) => p.last_added || "", synced: (p) => p.last_synced || "", size };
  const rank = Object.fromEntries(recent.map(([pid], i) => [pid, i])), rc = Object.fromEntries(recent);
  const arr = [...list].sort((a, b) => sort === "name" ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : keyOf[sort](a) < keyOf[sort](b) ? 1 : keyOf[sort](a) > keyOf[sort](b) ? -1 : 0)
    .sort((a, b) => (rank[a.id] ?? 1e9) - (rank[b.id] ?? 1e9));            // playlists that just received new files always float to the top
  const anyActive = Object.entries(jobs).some(([k, j]) => k.startsWith("pl") && ACTIVE(j));

  return (
    <>
      <div className="row between wrap"><h2>Vault</h2>
        <div className="row wrap">
          <select className="field sel" value={sort} onChange={(e) => { setSort(e.target.value); call("set_setting", "vault_sort", e.target.value); }}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
          <select className="field sel" value={auto} title="Checks your playlists in the background while the app is open. It only adds new tracks; it never deletes."
            onChange={(e) => { setAuto(e.target.value); call("set_setting", "auto_sync", e.target.value); }}>
            {AUTO.map(([k, l]) => <option key={k} value={k}>Auto-sync: {l}</option>)}</select>
          {anyActive && <button className="ghost" onClick={() => call(paused ? "resume" : "pause")}>{paused ? "Resume" : "Pause"}</button>}
          {anyActive && <button className="danger" onClick={() => call("stop_all")}>Stop all</button>}
          <button className="primary" disabled={!list.length} onClick={() => call("sync_all")}>Sync all</button>
        </div></div>
      <Source mode="vault" onDone={load} />
      <div className="grid">
        {arr.map((p, i) => { const s = st[p.id], job = jobs["pl" + p.id]; return (
          <div className={"card glass" + (rc[p.id] ? " fresh" : "")} key={p.id} style={{ "--i": i }}>
            <div className="cover">{p.cover ? <img src={p.cover} alt="" /> : <div className="ph" />}
              <button className="ghost sm over" onClick={async () => (await call("vault_cover", p.id)) && load()}>Change cover</button></div>
            <h4>{p.name} {rc[p.id] && <button className="pill done" title="Dismiss" onClick={() => call("ack_recent", p.id)}>+{rc[p.id]} new ✕</button>}</h4>
            <p className="mut small">{p.fmt} • {p.last_synced ? "Synced " + p.last_synced : "Never synced"}</p>
            <p className="small">{s && !s.error ? `${s.matched} of ${s.matched + s.missing_local} tracks on disk${s.missing_local ? ` • ${s.missing_local} to download` : ""}${s.missing_online ? ` • ${s.missing_online} to remove` : ""}` : s?.error ? `Could not check: ${s.error}` : "Scanning…"}</p>
            {ACTIVE(job) ? (
              <div className="job">
                <div className="row between small"><span className={job.status === "running" ? "stage" : "mut"}>{job.status === "queued" ? "Queued" : job.status === "paused" ? "Paused" : job.stage}</span><b>{Math.round(job.overall)}%</b></div>
                <div className="bar"><b style={{ width: job.overall + "%" }} className={job.status === "running" ? "live" : ""} /></div>
                {who(job.current) && <p className="now">♪ {who(job.current)}</p>}
                <p className="mut small">{job.status === "queued" ? "Waiting for its turn" : `Track ${job.item || 0} of ${job.total || "?"} • ${job.speed || "–"} • ETA ${job.eta || "–"}`}{job.errors ? ` • ${job.errors} failed` : ""}</p>
                <div className="row"><button className="danger sm" onClick={() => call("stop", "pl" + p.id)}>Stop</button>{job.stage?.startsWith("Cooling") && <button className="ghost sm" onClick={() => call("force_run")}>Run anyway</button>}</div>
              </div>
            ) : (
              <div className="row wrap"><button className="primary sm" onClick={() => call("sync", p.id)}>Sync</button>
                {s && !s.error && (s.missing_local > 0 || s.missing_online > 0) && <button className="ghost sm" onClick={() => setReview(p)}>Review missing</button>}
                <button className="ghost sm" onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>{open[p.id] ? "Hide tracks" : "Tracks"}</button>
                <button className="ghost sm" onClick={async () => { await call("vault_remove", p.id); load(); }}>Remove</button>
                {job && <span className={"pill " + job.status}>{job.stage}</span>}</div>
            )}
            {(open[p.id] || (ACTIVE(job) && job.errors > 0)) && <TrackList pid={p.id} active={ACTIVE(job)} />}
          </div>); })}
      </div>
      {!list.length && <p className="mut">Your Vault is empty. Paste a playlist link above and pick its folder, even if it already has music in it.</p>}
      {review && <Review pl={review} onClose={() => { setReview(null); load(); }} />}
    </>
  );
}

export default function App() {
  const [deps, setDeps] = useState(null), [tab, setTab] = useState("quick"), [dismissed, setDismissed] = useState(false);
  const [st, setSt] = useState({ busy: false, jobs: {} }), [logs, setLogs] = useState(""), [open, setOpen] = useState(false);
  const since = useRef(0), con = useRef();
  useEffect(() => { call("flag", "welcomed").then((w) => { if (!w) setTab("guide"); }); }, []);
  const start = () => { call("set_flag", "welcomed"); setTab("quick"); };
  useEffect(() => {  // cursor-following spotlight on glass surfaces
    const mv = (e) => { const g = e.target.closest?.(".glass"); if (!g) return; const r = g.getBoundingClientRect();
      g.style.setProperty("--mx", e.clientX - r.left + "px"); g.style.setProperty("--my", e.clientY - r.top + "px"); };
    document.addEventListener("pointermove", mv); return () => document.removeEventListener("pointermove", mv);
  }, []);
  useEffect(() => {
    const check = async () => { try { const d = await call("deps"); if (d) setDeps(d); } catch (e) { setDeps({ "yt-dlp": false, ffmpeg: false, error: String(e?.message || e) }); } };
    check(); const t1 = setInterval(() => { if (!document.hidden) check(); }, 2000); window.__recheck = check;
    const t2 = setInterval(async () => {
      if (document.hidden) return;   // nothing to redraw while the app is in the background
      const s = await call("state", since.current); if (!s) return;
      since.current = s.next; setSt(s);
      if (s.logs.length) { setLogs((l) => (l + s.logs.join("\n") + "\n").slice(-60000)); requestAnimationFrame(() => con.current && (con.current.scrollTop = 1e9)); }
    }, 800);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  const jobs = st.jobs || {}, all = Object.values(jobs), run = all.find((j) => ["running", "paused"].includes(j.status)), queued = all.filter((j) => j.status === "queued").length, ok = deps && deps["yt-dlp"] && deps.ffmpeg;
  return (
    <div className={"app" + (NATIVE ? " lite" : "")}>
      <div className="blobs"><i /><i /><i /></div>
      {!ok && !dismissed && (
        <div className="lock"><div className="glass stack">
          {NATIVE ? (<>
            <h2>{deps?.error ? "The download engine could not start" : "Starting the download engine"}</h2>
            <p className="mut">{deps?.error ? "The built-in yt-dlp and FFmpeg did not start. Nothing needs to be installed on Android." : (deps?.stage || "Starting...")}</p>
            {deps?.error && <p className="err small" style={{ wordBreak: "break-word", userSelect: "text" }}>{deps.error}</p>}
            {!deps?.error && <div className="bar"><b className="live" style={{ width: "100%" }} /></div>}
            <div className="row">
              {deps?.error && <button className="primary" onClick={async () => { await call("retry_init"); window.__recheck?.(); }}>Try again</button>}
              <button className="ghost" onClick={() => setDismissed(true)}>Continue anyway</button>
            </div>
            <p className="mut small">The first start unpacks yt-dlp and FFmpeg and can take up to a minute.</p>
          </>) : (<>
          <h2>Set up your tools</h2><p className="mut">These are needed before anything can download.</p>
          {["yt-dlp", "ffmpeg"].map((k) => <div key={k} className={"dep" + (deps?.[k] ? " ok" : "")}><i />{k}</div>)}
          <div className="row"><button className="primary" onClick={() => call("install_deps")}>Install in Terminal</button><button className="ghost" onClick={() => window.__recheck?.()}>Re-check</button></div>
          <p className="mut small">Checking every 2 seconds. When the Terminal says it finished, this unlocks automatically.</p>
          </>)}
        </div></div>
      )}
      <header className="top"><b>LocalMusic and Video</b><button className="ghost sm" onClick={() => setTab("guide")} aria-label="Guide">?</button></header>
      <nav className="nav"><h1>LocalMusic<br />and Video</h1>
        {TABS.map(([k, l]) => <button key={k} className={"tabbtn" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{ICONS[k]}<span>{l}</span></button>)}
        <button className={"tabbtn minor" + (tab === "guide" ? " on" : "")} onClick={() => setTab("guide")}><span>Welcome &amp; guide</span></button>
      </nav>
      <main key={tab}>
        {tab === "net" ? <NetworkSync jobs={jobs} /> : tab === "guide" ? <Guide onStart={start} /> : tab === "quick" ? <><h2>Quick download</h2><Source mode="quick" busy={ACTIVE(jobs.quick)} /></> : <Vault busy={st.busy} jobs={jobs} paused={!!st.paused} recent={st.recent || []} />}
      </main>
      <footer>
        <div className="prog"><div className="bar"><b style={{ width: (run?.overall || 0) + "%" }} className={run?.status === "running" ? "live" : ""} /></div>
          <span className="mut small">{run ? `${run.name} • ${run.status === "paused" ? "Paused" : run.stage} • ${Math.round(run.overall)}%${run.current?.title ? ` • ♪ ${run.current.artist ? run.current.artist + " – " : ""}${run.current.title}` : ""}${run.total ? ` • Track ${run.item} of ${run.total}` : ""} • ${run.speed || "–"} • ETA ${run.eta || "–"}${queued ? ` • ${queued} queued` : ""}` : queued ? `${queued} queued` : st.paused ? "Paused" : "Idle"}</span></div>
        {run?.stage?.startsWith("Cooling") && <button className="primary sm" onClick={() => call("force_run")}>Run anyway</button>}
        {st.busy && <button className="ghost sm" onClick={() => call(st.paused ? "resume" : "pause")}>{st.paused ? "Resume" : "Pause"}</button>}
        {st.busy && <button className="danger sm" onClick={() => call("stop_all")}>Stop all</button>}
        <button className="ghost sm" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} console</button>
        {open && <pre ref={con} className="console">{logs}</pre>}
      </footer>
    </div>
  );
}
