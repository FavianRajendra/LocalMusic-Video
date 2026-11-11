import { call } from "../bridge.js";
import { fmtBytes, usePoll } from "../hooks.js";

/** Top status widget on the phone: Storage, Thermal Throttling, Active Threads, Speed. `m` comes from the engine's sys_metrics. */
export default function SystemMetrics({ m }) {
  const used = m && m.total ? Math.round(((m.total - m.free) / m.total) * 100) : null;
  const tiles = [
    ["Storage", m ? fmtBytes(m.free) + " free" : "–", used != null ? used + "% used" : "", used > 90 ? "warn" : ""],
    ["Thermal Throttling", m ? (m.throttling ? "Slowing down" : "None") : "–", m ? m.thermal : "", m?.throttling ? "warn" : ""],
    ["Active Threads", m ? String(m.threads) : "–", "downloaders running", ""],
    ["Speed", m?.speed || "–", "", ""],
  ];
  return (
    <section className="sysmetrics glass" aria-label="Device status">
      {tiles.map(([label, value, sub, tone]) => (
        <div key={label} className={"sm-tile " + tone}><p className="kpi-label">{label}</p><p className="sm-value">{value}</p>{sub ? <p className="sm-sub">{sub}</p> : null}</div>
      ))}
    </section>
  );
}

export function LiveSystemMetrics() {
  const [m] = usePoll(() => call("sys_metrics"), 3000);
  return <SystemMetrics m={m} />;
}
