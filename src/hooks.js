import { useCallback, useEffect, useRef, useState } from "react";
import { call, NATIVE } from "./bridge.js";

export const ACTIVE = (j) => !!j && ["queued", "running", "paused"].includes(j.status);
/** "Artist – Song Title" for the track that is being downloaded right now. */
export const who = (c) => (c?.title ? (c.artist ? c.artist + " – " : "") + c.title : "");
export function fmtBytes(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"], i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024))), v = b / 1024 ** i;
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + " " + u[i];
}

export function useDebounced(v, ms) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Phone layout (bottom navigation) on Android and on narrow desktop windows. */
export function useIsMobile() {
  const mq = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 760px)") : null);
  const [m, setM] = useState(() => NATIVE || !!mq()?.matches);
  useEffect(() => {
    const q = mq(); if (!q) return;
    const on = () => setM(NATIVE || q.matches); on();
    q.addEventListener("change", on); return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

/** Calls fn now and every `ms` while the window is visible. Returns [value, refreshNow]. A failed call keeps the last value. */
export function usePoll(fn, ms, deps = []) {
  const [v, setV] = useState(null), ref = useRef(fn);
  ref.current = fn;
  const run = useCallback(async () => { try { setV(await ref.current()); } catch (e) { /* keep the last value */ } }, []);
  useEffect(() => {
    run(); const t = setInterval(() => { if (!document.hidden) run(); }, ms);
    return () => clearInterval(t);
  }, [ms, run, ...deps]);
  return [v, run];
}

/** A persisted setting (stored by the engine, so it survives restarts on desktop and Android). */
export function useSetting(key, def) {
  const [v, setV] = useState(def);
  useEffect(() => {
    let live = true;
    call("get_setting", key).then((x) => { if (live && x != null) setV(x); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  const set = useCallback((x) => { setV(x); call("set_setting", key, String(x)); }, [key]);
  return [v, set];
}

/** Engine state (jobs, pause flag, "recently updated" playlists) + the console log, polled calmly. */
export function useEngine() {
  const [st, setSt] = useState({ busy: false, paused: false, jobs: {}, recent: [] }), [logs, setLogs] = useState([]), since = useRef(0);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (document.hidden) return;   // nothing to redraw in the background
      try {
        const s = await call("state", since.current);
        if (!s || !live) return;
        since.current = s.next; setSt(s);
        if (s.logs?.length) setLogs((l) => [...l, ...s.logs].slice(-1500));
      } catch (e) { /* the bridge is not ready yet */ }
    };
    tick(); const t = setInterval(tick, 800);
    return () => { live = false; clearInterval(t); };
  }, []);
  return { st, logs };
}
