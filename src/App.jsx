import { useEffect, useRef, useState } from "react";
import { FORMATS, estimateMB, fmtSize } from "./formats.js";

// Waits until the Python bridge exists, so calls made early (or after a missed
// "pywebviewready" event) are never lost.
const bridge = new Promise((res) => {
  const t = setInterval(() => { if (window.pywebview?.api?.deps) { clearInterval(t); res(); } }, 100);
});
const call = async (fn, ...a) => { await bridge; return window.pywebview.api[fn](...a); };

const ACTIVE = (j) => j && ["queued", "running"].includes(j.status);

const STEPS = [
  ["Install the tools", "The first time, the app checks for yt-dlp and ffmpeg. If they're missing, click Install in Terminal and wait. It unlocks by itself."],
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
        <p><b>Lyrics:</b> fetched from LRCLIB after each audio download, saved as a .lrc file beside the track and inside its tags. Some tracks won't have any.</p>
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

  useEffect(() => { call("settings")?.then((s) => setDest(s.dest)); }, []);
  useEffect(() => {
    setInfo(null); setScan(null);
    if (!/^https?:\/\//.test(q)) return;
    let live = true; setLoading(true);
    call("inspect", q)?.then((r) => { if (live) { setInfo(r); setLoading(false); } });
    return () => { live = false; };
  }, [q]);
  useEffect(() => {
    setScan(null);
    if (info && !info.error && dest) call("scan", q, dest)?.then(setScan);
  }, [info, dest]);

  const pick = async () => { const r = await call("pick_folder"); if (r) setDest(r); };
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
      <div className="row"><input className="field" readOnly value={dest} /><button className="ghost" onClick={pick}>Choose folder</button></div>
      {mode === "quick" && <label className="chk"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Also keep in Vault</label>}
      <div className="row">
        <button className="primary" disabled={!info || info.error || !dest || (mode === "quick" && busy)} onClick={go}>
          {mode === "vault" ? "Add to Vault" : scan?.matched ? `Download ${scan.missing_local} missing` : "Download"}
        </button>
        {msg && <span className="err">{msg}</span>}
      </div>
    </div>
  );
}

function Vault({ busy, jobs }) {
  const anyActive = Object.entries(jobs).some(([k, j]) => k.startsWith("pl") && ACTIVE(j));
  const [list, setList] = useState([]), [st, setSt] = useState({});
  const load = async () => {
    const l = (await call("vault_list")) || []; setList(l);
    l.forEach((p) => call("vault_status", p.id)?.then((s) => {
      setSt((o) => ({ ...o, [p.id]: s }));
      if (s?.cover) setList((cur) => cur.map((x) => (x.id === p.id ? { ...x, cover: s.cover } : x)));
    }));
  };
  useEffect(() => { load(); }, []);
  const wasBusy = useRef(false);
  useEffect(() => { if (wasBusy.current && !busy) load(); wasBusy.current = busy; }, [busy]);
  return (
    <>
      <div className="row between"><h2>Vault</h2><div className="row">{anyActive && <button className="danger" onClick={() => call("stop_all")}>Stop all</button>}<button className="primary" disabled={!list.length} onClick={() => call("sync_all")}>Sync all</button></div></div>
      <Source mode="vault" onDone={load} />
      <div className="grid">
        {list.map((p, i) => { const s = st[p.id], job = jobs["pl" + p.id]; return (
          <div className="card glass" key={p.id} style={{ "--i": i }}>
            <div className="cover">{p.cover ? <img src={p.cover} alt="" /> : <div className="ph" />}
              <button className="ghost sm over" onClick={async () => (await call("vault_cover", p.id)) && load()}>Change cover</button></div>
            <h4>{p.name}</h4>
            <p className="mut small">{p.fmt} • {p.last_synced ? "Synced " + p.last_synced : "Never synced"}</p>
            <p className="small">{s && !s.error ? `${s.matched} local matched • ${s.missing_local} missing locally • ${s.missing_online} missing online` : "Scanning…"}</p>
            {ACTIVE(job) ? (
              <div className="job">
                <div className="row between small"><span className={job.status === "running" ? "stage" : "mut"}>{job.status === "queued" ? "Queued" : job.stage}</span><b>{Math.round(job.overall)}%</b></div>
                <div className="bar"><b style={{ width: job.overall + "%" }} className={job.status === "running" ? "live" : ""} /></div>
                <p className="mut small">{job.status === "running" ? `Track ${job.item || 0} of ${job.total || "?"} • ${job.speed || "–"} • ETA ${job.eta || "–"}` : "Waiting for its turn"}</p>
                <button className="danger sm" onClick={() => call("stop", "pl" + p.id)}>Stop</button>
              </div>
            ) : (
              <div className="row"><button className="primary sm" onClick={() => call("sync", p.id)}>Sync</button>
                <button className="ghost sm" onClick={async () => { await call("vault_remove", p.id); load(); }}>Remove</button>
                {job && <span className={"pill " + job.status}>{job.stage}</span>}</div>
            )}
          </div>); })}
      </div>
      {!list.length && <p className="mut">Your Vault is empty. Paste a playlist link above and pick its folder, even if it already has music in it.</p>}
    </>
  );
}

export default function App() {
  const [deps, setDeps] = useState(null), [tab, setTab] = useState("quick");
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
    const check = async () => { const d = await call("deps"); if (d) setDeps(d); };
    check(); const t1 = setInterval(check, 2000); window.__recheck = check;
    const t2 = setInterval(async () => {
      const s = await call("state", since.current); if (!s) return;
      since.current = s.next; setSt(s);
      if (s.logs.length) { setLogs((l) => (l + s.logs.join("\n") + "\n").slice(-60000)); requestAnimationFrame(() => con.current && (con.current.scrollTop = 1e9)); }
    }, 500);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  const jobs = st.jobs || {}, all = Object.values(jobs), run = all.find((j) => j.status === "running"), queued = all.filter((j) => j.status === "queued").length, ok = deps && deps["yt-dlp"] && deps.ffmpeg;
  return (
    <div className="app">
      <div className="blobs"><i /><i /><i /></div>
      {!ok && (
        <div className="lock"><div className="glass stack">
          <h2>Set up your tools</h2><p className="mut">These are needed before anything can download.</p>
          {["yt-dlp", "ffmpeg"].map((k) => <div key={k} className={"dep" + (deps?.[k] ? " ok" : "")}><i />{k}</div>)}
          <div className="row"><button className="primary" onClick={() => call("install_deps")}>Install in Terminal</button><button className="ghost" onClick={() => window.__recheck?.()}>Re-check</button></div>
          <p className="mut small">Checking every 2 seconds. When the Terminal says it finished, this unlocks automatically.</p>
        </div></div>
      )}
      <aside><h1>LocalMusic<br />and Video</h1>
        {[["quick", "Quick download"], ["vault", "Vault"], ["guide", "Welcome & guide"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </aside>
      <main key={tab}>
        {tab === "guide" ? <Guide onStart={start} /> : tab === "quick" ? <><h2>Quick download</h2><Source mode="quick" busy={ACTIVE(jobs.quick)} /></> : <Vault busy={st.busy} jobs={jobs} />}
      </main>
      <footer>
        <div className="prog"><div className="bar"><b style={{ width: (run?.overall || 0) + "%" }} className={run ? "live" : ""} /></div>
          <span className="mut small">{run ? `${run.name} • ${run.stage} • ${Math.round(run.overall)}%${run.total ? ` • Track ${run.item} of ${run.total}` : ""} • ${run.speed || "–"} • ETA ${run.eta || "–"}${queued ? ` • ${queued} queued` : ""}` : queued ? `${queued} queued` : "Idle"}</span></div>
        {st.busy && <button className="danger sm" onClick={() => call("stop_all")}>Stop all</button>}
        <button className="ghost sm" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} console</button>
        {open && <pre ref={con} className="console">{logs}</pre>}
      </footer>
    </div>
  );
}
