import { useEffect, useRef, useState } from "react";
import { fmtSize } from "../formats.js";

/** A size that counts up/down smoothly when the estimate changes. */
export default function Num({ mb }) {
  const [v, setV] = useState(0), from = useRef(0);
  useEffect(() => {
    const a = from.current, t0 = performance.now(); let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      setV(a + (mb - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = mb;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mb]);
  return fmtSize(v);
}
