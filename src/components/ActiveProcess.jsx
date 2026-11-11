import { AnimatePresence, motion } from "framer-motion";
import { who } from "../hooks.js";

/** The elevated "Active Process" card: current "Artist – Title", progress, live speed, pause (⏸/▶) and cancel (🛑). */
export default function ActiveProcess({ jobs, paused, onPause, onResume, onStop, onForce }) {
  const running = Object.entries(jobs).filter(([, j]) => j.status === "running" || j.status === "paused");
  const [key, j] = running[0] || [];
  const queued = Object.values(jobs).filter((x) => x.status === "queued").length;
  const cooling = !!j?.stage?.startsWith("Cooling");
  return (
    <AnimatePresence initial={false}>
      {j && (
        <motion.section key="process" className="process glass" aria-live="polite"
          initial={{ opacity: 0, y: -14, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -14, height: 0 }} transition={{ duration: 0.28 }}>
          <div className="proc-top">
            <div className="proc-main"><span className={"proc-dot" + (j.status === "running" ? " on" : "")} /><b>{j.name}</b><span className="mut small"> · {j.status === "paused" ? "Paused" : j.stage}</span></div>
            <div className="proc-actions">
              {cooling && <button className="ghost sm" onClick={onForce}>Run anyway</button>}
              <button className="icon-btn" aria-label={paused ? "Resume" : "Pause"} title={paused ? "Resume" : "Pause"} onClick={paused ? onResume : onPause}>{paused ? "▶" : "⏸"}</button>
              <button className="icon-btn danger" aria-label="Cancel" title="Cancel" onClick={() => onStop(key)}>🛑</button>
            </div>
          </div>
          {who(j.current) && <p className="proc-track">♪ {who(j.current)}</p>}
          <div className="bar"><b style={{ width: Math.round(j.overall || 0) + "%" }} className={j.status === "running" ? "live" : ""} /></div>
          <p className="proc-stats">
            <span>{Math.round(j.overall || 0)}%</span><span>⚡ {j.speed || "–"}</span><span>ETA {j.eta || "–"}</span>
            {j.total ? <span>Track {j.item || 0} of {j.total}</span> : null}
            {j.errors ? <span className="tag bad">{j.errors} failed</span> : null}
            {queued ? <span>{queued} queued</span> : null}
          </p>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
