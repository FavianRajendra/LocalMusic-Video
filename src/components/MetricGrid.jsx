import { useEffect } from "react";
import { motion } from "framer-motion";
import { call } from "../bridge.js";
import { fmtBytes, usePoll } from "../hooks.js";

/** Top KPI bar (desktop): library size and auto-sync state. `stats` comes from the engine's vault_stats. */
export default function MetricGrid({ stats, onOpenSettings }) {
  const s = stats;
  const items = [
    ["📚", "Total Playlists", s ? String(s.playlists) : "–"],
    ["🎵", "Total Tracks", s ? String(s.tracks) : "–"],
    ["💾", "Storage Used", s ? fmtBytes(s.bytes) : "–"],
    ["🔄", "Auto-Sync Status", s ? (s.auto ? `🟢 Every ${s.auto} min` : "⚪ Off") : "–", onOpenSettings],
  ];
  return (
    <section className="kpis" aria-label="Library overview">
      {items.map(([ico, label, value, click], i) => (
        <motion.div key={label} className={"kpi glass" + (click ? " click" : "")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}
          onClick={click} role={click ? "button" : undefined} title={click ? "Open the auto-sync setting" : undefined}>
          <span className="kpi-ico" aria-hidden="true">{ico}</span>
          <div><p className="kpi-label">{label}</p><p className="kpi-value">{value}</p></div>
        </motion.div>
      ))}
    </section>
  );
}

/** Polls the engine for the numbers (local files only, so it is cheap) and refreshes when a job starts/ends or the Vault changes. */
export function LiveMetricGrid({ busy, onOpenSettings }) {
  const [stats, refresh] = usePoll(() => call("vault_stats"), 30000, [busy]);
  useEffect(() => { window.addEventListener("lmv-stats", refresh); return () => window.removeEventListener("lmv-stats", refresh); }, [refresh]);
  return <MetricGrid stats={stats} onOpenSettings={onOpenSettings} />;
}
