import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { call } from "../bridge.js";
import { ACTIVE, useSetting } from "../hooks.js";
import SourcePanel from "./SourcePanel.jsx";
import PlaylistCard from "./PlaylistCard.jsx";
import ReviewModal from "./ReviewModal.jsx";

const SORTS = [["recent", "Recently updated"], ["name", "Name A–Z"], ["synced", "Last synced"], ["size", "Most tracks"]];

export default function Vault({ st, onChanged, onOpenSettings }) {
  const jobs = st.jobs || {}, paused = !!st.paused, recent = st.recent || [], busy = !!st.busy;
  const [list, setList] = useState([]), [status, setStatus] = useState({}), [open, setOpen] = useState({});
  const [review, setReview] = useState(null), [adding, setAdding] = useState(false), [sort, setSort] = useSetting("vault_sort", "recent");

  const load = async () => {
    const l = (await call("vault_list")) || []; setList(l);
    for (const p of l) {   // one at a time: each check can start a downloader process, and a burst of them makes a phone hot
      try {
        const s = await call("vault_status", p.id);
        setStatus((o) => ({ ...o, [p.id]: s }));
        if (s?.cover) setList((cur) => cur.map((x) => (x.id === p.id ? { ...x, cover: s.cover } : x)));
      } catch (e) { setStatus((o) => ({ ...o, [p.id]: { error: String(e?.message || e) } })); }
    }
    onChanged?.();
  };
  useEffect(() => { load(); }, []);
  const wasBusy = useRef(false);
  useEffect(() => { if (wasBusy.current && !busy) load(); wasBusy.current = busy; }, [busy]);

  const size = (p) => (status[p.id]?.matched || 0) + (status[p.id]?.missing_local || 0);
  const keyOf = { recent: (p) => p.last_added || "", synced: (p) => p.last_synced || "", size };
  const rank = Object.fromEntries(recent.map(([pid], i) => [pid, i])), fresh = Object.fromEntries(recent);
  const sorted = [...list].sort((a, b) => sort === "name" ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : keyOf[sort](a) < keyOf[sort](b) ? 1 : keyOf[sort](a) > keyOf[sort](b) ? -1 : 0)
    .sort((a, b) => (rank[a.id] ?? 1e9) - (rank[b.id] ?? 1e9));   // playlists that just received new files float to the top; the cards animate into place
  const anyActive = Object.entries(jobs).some(([k, j]) => k.startsWith("pl") && ACTIVE(j));

  const on = {
    sync: (id) => call("sync", id), stop: (id) => call("stop", "pl" + id), force: () => call("force_run"), review: setReview, ack: (id) => call("ack_recent", id),
    toggle: (id) => setOpen((o) => ({ ...o, [id]: !o[id] })),
    remove: async (id) => { await call("vault_remove", id); load(); },
    cover: async (p) => { if (await call("vault_cover", p.id)) load(); },
  };
  return (
    <div className="page">
      <div className="row between wrap"><h2>The Vault</h2>
        <div className="row wrap">
          <select className="field sel" value={sort} aria-label="Sort playlists" onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
          {anyActive && <button className="ghost" onClick={() => call(paused ? "resume" : "pause")}>{paused ? "▶ Resume" : "⏸ Pause"}</button>}
          {anyActive && <button className="danger" onClick={() => call("stop_all")}>Stop all</button>}
          <button className="ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>{adding ? "Close" : "＋ Add playlist"}</button>
          <button className="primary" disabled={!list.length} onClick={() => call("sync_all")}>Sync all</button>
        </div></div>
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div key="add" style={{ overflow: "hidden" }} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            <SourcePanel mode="vault" onDone={() => { setAdding(false); load(); }} onOpenSettings={onOpenSettings} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid">
        <AnimatePresence mode="popLayout">
          {sorted.map((p, i) => <PlaylistCard key={p.id} p={p} s={status[p.id]} job={jobs["pl" + p.id]} fresh={fresh[p.id]} index={i} open={!!open[p.id]} on={on} />)}
        </AnimatePresence>
      </div>
      {!list.length && <p className="mut empty">Your Vault is empty. Press <b>＋ Add playlist</b>, paste a playlist link and pick its folder, even if it already has music in it.</p>}
      <AnimatePresence>{review && <ReviewModal key="review" pl={review} onClose={() => { setReview(null); load(); }} />}</AnimatePresence>
    </div>
  );
}
