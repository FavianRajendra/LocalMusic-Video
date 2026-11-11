import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Collapsible log viewer (raw yt-dlp and system messages). */
export default function ConsolePanel({ logs }) {
  const [open, setOpen] = useState(false), ref = useRef(null);
  useEffect(() => { if (open && ref.current) ref.current.scrollTop = 1e9; }, [logs, open]);
  return (
    <div className="console-wrap">
      <button className="ghost sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"} console</button>
      <AnimatePresence initial={false}>
        {open && <motion.pre ref={ref} className="console" initial={{ height: 0, opacity: 0 }} animate={{ height: 180, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>{logs.join("\n")}</motion.pre>}
      </AnimatePresence>
    </div>
  );
}
