import { useEffect, useState } from "react";
import { call } from "../bridge.js";

/** One tag per state. Failures are RED restriction badges that carry the reason ("Geo-blocked in your region", "Private video" ...). */
export function Tag({ t }) {
  if (t.job === "error") return <span className="tag bad" title={t.msg}>🔴 {t.msg || "Failed"}</span>;
  if (t.job === "downloading") return <span className="tag live">⬇ Downloading…</span>;
  if (t.state === "present") return <span className="tag ok">✓ On disk</span>;
  if (t.state === "extra") return <span className="tag warn">Will be removed</span>;
  return <span className={"tag" + (t.skipped ? " mute" : "")}>{t.skipped ? "Skipped" : "Missing"}</span>;
}

export default function TrackList({ pid, active }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let live = true;
    const load = async () => { try { const x = await call("tracklist", pid); if (live) setR(x); } catch (e) { if (live) setR({ error: String(e?.message || e) }); } };
    load(); const t = active ? setInterval(load, 4000) : null;
    return () => { live = false; if (t) clearInterval(t); };
  }, [pid, active]);
  if (!r) return <p className="mut small">Loading tracks…</p>;
  if (r.error) return <p className="err small">{r.error}</p>;
  return (
    <div className="tracks">
      {r.tracks.map((t) => (
        <div className={"trk" + (t.job === "error" ? " bad" : "")} key={t.id}>
          <span className="ti"><b>{t.title}</b><em>{t.artist}</em></span><Tag t={t} />
        </div>
      ))}
    </div>
  );
}
