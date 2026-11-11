import { motion } from "framer-motion";
import { ACTIVE, who } from "../hooks.js";
import TrackList from "./TrackList.jsx";

/** One status badge per playlist. */
export function badgeOf(s, job) {
  if (ACTIVE(job)) return ["sync", job.status === "paused" ? "⏸ PAUSED" : "🔵 SYNCING"];
  if (!s) return ["wait", "⏳ CHECKING"];
  if (s.error) return ["bad", "🔴 Unreachable"];
  if (s.geo > 0) return ["bad", `🔴 Geo-Blocked (${s.geo})`];
  if (s.failed > 0) return ["bad", `🔴 ${s.failed} failed`];
  if (s.missing_local > 0) return ["warn", `🟡 ${s.missing_local} missing`];
  return ["ok", "🟢 UPDATED"];
}

export default function PlaylistCard({ p, s, job, fresh, index, open, on }) {
  const [tone, label] = badgeOf(s, job), active = ACTIVE(job);
  return (
    <motion.article layout className={"card glass" + (fresh ? " fresh" : "")}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ layout: { type: "spring", stiffness: 340, damping: 30 }, opacity: { duration: 0.25, delay: Math.min(index, 8) * 0.04 }, y: { duration: 0.25 } }}>
      <div className="cover">{p.cover ? <img src={p.cover} alt="" /> : <div className="ph" />}
        <button className="ghost sm over" onClick={() => on.cover(p)}>Change cover</button>
        <span className={"status " + tone}>{label}</span></div>
      <h4>{p.name} {fresh ? <button className="tag ok flat" title="Dismiss" onClick={() => on.ack(p.id)}>+{fresh} new ✕</button> : null}</h4>
      <p className="mut small">{p.fmt} • {p.last_synced ? "Synced " + p.last_synced : "Never synced"}</p>
      <p className="small">{s && !s.error ? `${s.matched} of ${s.matched + s.missing_local} tracks on disk${s.missing_local ? ` • ${s.missing_local} to download` : ""}${s.missing_online ? ` • ${s.missing_online} to remove` : ""}` : s?.error ? `Could not check: ${s.error}` : "Scanning…"}</p>
      {active ? (
        <div className="job">
          <div className="row between small"><span className={job.status === "running" ? "stage" : "mut"}>{job.status === "queued" ? "Queued" : job.status === "paused" ? "Paused" : job.stage}</span><b>{Math.round(job.overall)}%</b></div>
          <div className="bar"><b style={{ width: job.overall + "%" }} className={job.status === "running" ? "live" : ""} /></div>
          {who(job.current) && <p className="now">♪ {who(job.current)}</p>}
          <p className="mut small">{job.status === "queued" ? "Waiting for its turn" : `Track ${job.item || 0} of ${job.total || "?"} • ${job.speed || "–"} • ETA ${job.eta || "–"}`}{job.errors ? ` • ${job.errors} failed` : ""}</p>
          <div className="row"><button className="danger sm" onClick={() => on.stop(p.id)}>Stop</button>
            {job.stage?.startsWith("Cooling") && <button className="ghost sm" onClick={on.force}>Run anyway</button>}</div>
        </div>
      ) : (
        <div className="row wrap">
          <button className="primary sm" onClick={() => on.sync(p.id)}>Sync</button>
          {s && !s.error && (s.missing_local > 0 || s.missing_online > 0) && <button className="ghost sm" onClick={() => on.review(p)}>Review missing</button>}
          <button className="ghost sm" onClick={() => on.toggle(p.id)}>{open ? "Hide tracks" : "Tracks"}</button>
          <button className="ghost sm" onClick={() => on.remove(p.id)}>Remove</button>
          {job && <span className={"pill " + job.status}>{job.stage}</span>}
        </div>
      )}
      {(open || (active && job.errors > 0)) && <TrackList pid={p.id} active={active} />}
    </motion.article>
  );
}
