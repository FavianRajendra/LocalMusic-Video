import { useRef } from "react";
import { usePill } from "../lib/pill.js";
import { call } from "../bridge.js";
import { AUTHOR, DONATE_URL } from "../config.js";

export const TABS = [["quick", "📥", "Quick Download", "Quick"], ["vault", "♬", "The Vault", "Vault"], ["net", "⛖", "Network Sync", "Sync"], ["settings", "⚙", "Settings", "Settings"]];

/** Persistent, collapsible icon sidebar (desktop). The active tab is marked by a pill that slides between tabs (GSAP FLIP). */
export default function Sidebar({ tab, setTab, collapsed, setCollapsed, badges = {} }) {
  const box = useRef(null), pill = useRef(null);
  usePill(box, pill, tab, [collapsed]);
  return (
    <aside className={"sidebar glass" + (collapsed ? " collapsed" : "")}>
      <div className="brand" title="LocalMusic and Video"><span className="logo">♪</span><span className="brand-name">LocalMusic<br />and Video</span></div>
      <nav className="rail" ref={box} aria-label="Main">
        <span ref={pill} className="pill-bg" aria-hidden="true" />
        {TABS.map(([k, icon, label]) => (
          <button key={k} data-key={k} className={"rail-btn" + (tab === k ? " on" : "")} title={label} aria-label={label} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
            <span className="ico" aria-hidden="true">{icon}</span><span className="lbl">{label}</span>
            {badges[k] ? <span className="count">{badges[k]}</span> : null}
          </button>
        ))}
      </nav>
      <div className="rail-foot">
        {DONATE_URL && <button className="rail-btn sub" title={"Support " + AUTHOR} aria-label={"Support " + AUTHOR} onClick={() => call("open_url", DONATE_URL)}><span className="ico" aria-hidden="true">☕</span><span className="lbl">Support {AUTHOR}</span></button>}
        <button className="rail-btn sub" aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} title={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed(!collapsed)}>
          <span className="ico" aria-hidden="true">{collapsed ? "»" : "«"}</span><span className="lbl">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
