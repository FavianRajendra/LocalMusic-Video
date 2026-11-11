import { useRef } from "react";
import { usePill } from "../lib/pill.js";
import { TABS } from "./Sidebar.jsx";

/** Fixed bottom navigation for phones:  [ 📥 Quick ] [ ♬ Vault ] [ ⛖ Sync ]  (Settings is the gear in the top bar). */
export default function BottomNav({ tab, setTab }) {
  const box = useRef(null), pill = useRef(null);
  usePill(box, pill, tab);
  return (
    <nav className="bottomnav glass" ref={box} aria-label="Main">
      <span ref={pill} className="pill-bg" aria-hidden="true" />
      {TABS.filter(([k]) => k !== "settings").map(([k, icon, label, short]) => (
        <button key={k} data-key={k} className={"bn-btn" + (tab === k ? " on" : "")} aria-label={label} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
          <span className="ico" aria-hidden="true">{icon}</span><span className="lbl">{short}</span>
        </button>
      ))}
    </nav>
  );
}
