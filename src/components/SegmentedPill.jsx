import { useRef } from "react";
import { usePill } from "../lib/pill.js";

/** Segmented control whose highlight slides between options (GSAP FLIP). options = [[key, label], ...] */
export default function SegmentedPill({ options, value, onChange, label }) {
  const box = useRef(null), pill = useRef(null);
  usePill(box, pill, value);
  return (
    <div className="seg" ref={box} role="tablist" aria-label={label}>
      <span ref={pill} className="pill-bg" aria-hidden="true" />
      {options.map(([k, text]) => (
        <button key={k} data-key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{text}</button>
      ))}
    </div>
  );
}
