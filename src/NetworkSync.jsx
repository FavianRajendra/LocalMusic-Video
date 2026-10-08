import { useEffect, useState } from "react";
import { call, NATIVE } from "./bridge.js";

const ACTIVE = (j) => j && ["queued", "running"].includes(j.status);
const CLS = { macOS: "mac", Windows: "win", "Android APK": "and", LocalSend: "ls" };

export default function NetworkSync({ jobs = {} }) {
  const [s, setS] = useState({ enabled: false, share: false, peers: [], recv: [] });
  const [mode, setMode] = useState("app"), [sel, setSel] = useState(null), [pls, setPls] = useState([]);
  const [pid, setPid] = useState(""), [msg, setMsg] = useState("");

  const refresh = async () => { const x = await call("net_state"); if (x) setS(x); };
  useEffect(() => {
    call("net_start").then((r) => r?.error && setMsg(r.error)).then(refresh);
    if (!NATIVE) call("vault_list").then((l) => { setPls(l || []); if (l?.length) setPid(String(l[0].id)); });
    const t = setInterval(refresh, 1500); return () => clearInterval(t);
  }, []);

  const peer = s.peers.find((p) => p.fp === sel), pl = pls.find((p) => String(p.id) === pid);
  const isApp = peer?.kind === "macOS" || peer?.kind === "Windows";
  const run = async (fn, ...a) => { setMsg(""); if ((await call(fn, ...a)) === false) setMsg("A transfer to this device is already running."); };
  const toggle = async () => { if (s.enabled) await call("net_stop"); else { const r = await call("net_start"); if (r?.error) setMsg(r.error); } refresh(); };
  const setPath = (v) => setPls((l) => l.map((p) => (String(p.id) === pid ? { ...p, remote_path: v } : p)));
  const netJobs = Object.entries(jobs).filter(([k]) => k.startsWith("net"));

  return (
    <div className="net">
      <div className="row between">
        <h2>Network sync</h2>
        <div className="row">
          <label className="chk"><input type="checkbox" checked={s.share} onChange={(e) => call("net_share", e.target.checked).then(refresh)} /> Allow incoming</label>
          <button className="ghost sm" onClick={() => call("net_scan").then(refresh)} disabled={!s.enabled}>Rescan</button>
          <button className={s.enabled ? "danger sm" : "primary sm"} onClick={toggle}>{s.enabled ? "Go offline" : "Go online"}</button>
        </div>
      </div>
      <p className="mut small"><span className={"dot" + (s.enabled ? " on" : "")} /> {s.enabled ? `Visible as "${s.alias}" on port 53317` : "Offline"}{!s.share && s.enabled ? " • incoming is off, so others can see you but not send or sync" : ""}</p>
      {msg && <p className="err">{msg}</p>}

      <div className="peers">
        {s.peers.map((p, i) => (
          <button key={p.fp} style={{ "--i": i }} className={"peer glass" + (sel === p.fp ? " on" : "")} onClick={() => setSel(p.fp)}>
            <span className={"kind " + CLS[p.kind]}>{p.kind}</span><b>{p.alias}</b><em>{p.ip}</em>
          </button>
        ))}
        {!s.peers.length && <p className="mut">{s.enabled ? "Looking for devices on your Wi-Fi…" : "Go online to find devices."}</p>}
      </div>

      {NATIVE ? (
        <div className="glass stack small">
          <p><b>Receiver mode.</b> Files sent to this phone are saved into Music/ (audio) or Movies/ (video) in the folder the sender chose, so Poweramp can see them.</p>
          {(s.recv || []).map((r) => <div key={r.name}><span>{r.name}</span><div className="bar"><b style={{ width: r.pct + "%" }} /></div></div>)}
        </div>
      ) : peer && (
        <div className="glass stack">
          <div className="seg">{[["app", "App-to-App"], ["raw", "To LocalSend device"]].map(([k, l]) => (
            <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>))}</div>
          {mode === "app" && isApp && (
            <div className="row">
              <button className="primary" onClick={() => run("net_pull", peer.fp, false)}>Pull missing from {peer.alias}</button>
              <button className="ghost" onClick={() => run("net_pull", peer.fp, true)}>Two-way sync</button>
            </div>
          )}
          {mode === "app" && !isApp && <p className="mut small">App-to-App needs another LocalMusic and Video on a computer. For a phone, choose "To LocalSend device" (our Android app also supports smart skipping).</p>}
          {(mode === "raw" || (mode === "app" && peer.kind === "Android APK")) && (
            <>
              <div className="row">
                <select className="field" value={pid} onChange={(e) => setPid(e.target.value)}>{pls.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <input className="field" placeholder="Folder on target, e.g. Music/Lofi Beats" value={pl?.remote_path || ""}
                  onChange={(e) => setPath(e.target.value)} onBlur={() => pl && call("set_remote_path", pl.id, pl.remote_path || "")} />
              </div>
              <button className="primary" disabled={!pl} onClick={() => run("net_send", peer.fp, Number(pid))}>
                {peer.kind === "LocalSend" ? "Send playlist" : "Send missing files"}</button>
              {peer.kind === "LocalSend" && <p className="mut small">Stock LocalSend saves into its own receive folder; your path becomes sub-folders inside it. Accept the transfer on the other device.</p>}
            </>
          )}
        </div>
      )}

      {netJobs.map(([k, j]) => (
        <div className="glass stack job" key={k}>
          <div className="row between"><b>{j.name}</b>{ACTIVE(j) ? <button className="danger sm" onClick={() => call("stop", k)}>Cancel</button> : <span className={"pill " + j.status}>{j.stage}</span>}</div>
          {ACTIVE(j) && <>
            <div className="bar"><b style={{ width: j.overall + "%" }} className={j.status === "running" ? "live" : ""} /></div>
            <p className="mut small">{j.stage} • {Math.round(j.overall)}% • {j.speed || "–"}{j.total ? ` • File ${j.item} of ${j.total}` : ""}</p></>}
        </div>
      ))}
    </div>
  );
}
