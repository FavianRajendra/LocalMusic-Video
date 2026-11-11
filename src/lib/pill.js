import { useLayoutEffect } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

/**
 * Segmented pill with GSAP FLIP. `pillRef` is ONE absolutely positioned element inside `boxRef`; each tab carries data-key.
 * When the active tab changes we record the pill (Flip.getState), move it to the new tab's box, and let FLIP animate the difference.
 */
export function usePill(boxRef, pillRef, activeKey, extra = []) {
  useLayoutEffect(() => {
    const box = boxRef.current, pill = pillRef.current;
    if (!box || !pill) return;
    const btn = box.querySelector(`[data-key="${activeKey}"]`);
    if (!btn) return;
    const first = pill.dataset.ready !== "1", reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const state = Flip.getState(pill);
    Object.assign(pill.style, { left: btn.offsetLeft + "px", top: btn.offsetTop + "px", width: btn.offsetWidth + "px", height: btn.offsetHeight + "px", opacity: "1" });
    if (!first && !reduce) Flip.from(state, { duration: 0.42, ease: "power3.inOut", scale: false });
    pill.dataset.ready = "1";
  }, [activeKey, ...extra]);
}
