import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { call, NATIVE } from "./bridge.js";
import { ACTIVE, useEngine, useIsMobile, useSetting } from "./hooks.js";
import Sidebar from "./components/Sidebar.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { LiveMetricGrid } from "./components/MetricGrid.jsx";
import { LiveSystemMetrics } from "./components/SystemMetrics.jsx";
import ActiveProcess from "./components/ActiveProcess.jsx";
import ReceiverStatus from "./components/ReceiverStatus.jsx";
import ConsolePanel from "./components/ConsolePanel.jsx";
import QuickDownload from "./components/QuickDownload.jsx";
import Vault from "./components/Vault.jsx";
import NetworkTab from "./components/NetworkTab.jsx";
import Settings from "./components/Settings.jsx";
import WelcomeModal from "./components/WelcomeModal.jsx";

const refreshStats = () => window.dispatchEvent(new Event("lmv-stats"));

/** Shown until the downloader is ready. Android: the engine unpacks yt-dlp + FFmpeg on first start. Desktop: install the tools. */
function EngineLock({ deps, onDismiss }) {
  const err = deps?.error;
  return (
    <motion.div className="lock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="glass stack lockcard">
        {NATIVE ? (
          <>
            <h2>{err ? "The download engine could not start" : "Starting the download engine"}</h2>
            <p className="mut">{err ? "The built-in yt-dlp and FFmpeg did not start. Nothing needs to be installed on Android." : (deps?.stage || "Starting...")}</p>
            {err && <p className="err small selectable">{err}</p>}
            {!err && <div className="bar"><b className="live" style={{ width: "100%" }} /></div>}
            <div className="row">
              {err && <button className="primary" onClick={() => call("retry_init")}>Try again</button>}
              <button className="ghost" onClick={onDismiss}>Continue anyway</button>
            </div>
            <p className="mut small">The first start unpacks yt-dlp and FFmpeg and can take up to a minute.</p>
          </>
        ) : (
          <>
            <h2>Set up your tools</h2>
            <p className="mut">These are needed before anything can download.</p>
            {["yt-dlp", "ffmpeg"].map((k) => <div key={k} className={"dep" + (deps?.[k] ? " ok" : "")}><i />{k}</div>)}
            {err && <p className="err small selectable">{err}</p>}
            <div className="row"><button className="primary" onClick={() => call("install_deps")}>Install in Terminal</button></div>
            <p className="mut small">Checking every 2 seconds. When the Terminal says it finished, this unlocks automatically.</p>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function App() {
  const mobile = useIsMobile(), { st, logs } = useEngine(), jobs = st.jobs || {};
  const [tab, setTab] = useState("quick"), [side, setSide] = useSetting("sidebar", "open");
  const [deps, setDeps] = useState(null), [dismissed, setDismissed] = useState(false), [welcome, setWelcome] = useState(false);
  const collapsed = side === "collapsed", ok = !!(deps && deps["yt-dlp"] && deps.ffmpeg);

  const check = useCallback(async () => {
    try { const d = await call("deps"); if (d) setDeps(d); } catch (e) { setDeps({ "yt-dlp": false, ffmpeg: false, error: String(e?.message || e) }); }
  }, []);
  useEffect(() => {
    check(); const t = setInterval(() => { if (!document.hidden) check(); }, ok ? 30000 : 2000);
    return () => clearInterval(t);
  }, [ok, check]);
  useEffect(() => { call("flag", "welcomed").then((w) => { if (!w) setWelcome(true); }).catch(() => {}); }, []);
  const closeWelcome = () => { call("set_flag", "welcomed"); setWelcome(false); };

  const toSettings = () => setTab("settings");
  const pages = {
    quick: <QuickDownload busy={ACTIVE(jobs.quick)} onOpenSettings={toSettings} />,
    vault: <Vault st={st} onChanged={refreshStats} onOpenSettings={toSettings} />,
    net: <NetworkTab jobs={jobs} logs={logs} />,
    settings: <Settings collapsed={collapsed} setCollapsed={(b) => setSide(b ? "collapsed" : "open")} onWelcome={() => setWelcome(true)} />,
  };
  const activeSyncs = Object.entries(jobs).filter(([k, j]) => k.startsWith("pl") && ACTIVE(j)).length;

  return (
    <MotionConfig reducedMotion="user">
      <div className={"app dash" + (mobile ? " mobile" : "") + (NATIVE ? " lite" : "")}>
        <AnimatePresence>{!ok && !dismissed && <EngineLock key="lock" deps={deps} onDismiss={() => setDismissed(true)} />}</AnimatePresence>
        {!mobile && <Sidebar tab={tab} setTab={setTab} collapsed={collapsed} setCollapsed={(b) => setSide(b ? "collapsed" : "open")} badges={{ vault: activeSyncs || null }} />}
        <div className="content">
          {mobile && (
            <header className="topbar glass">
              <span className="logo">♪</span><b>LocalMusic and Video</b>
              <button className="icon-btn" aria-label="Settings" title="Settings" onClick={toSettings}>⚙</button>
            </header>
          )}
          <div className="scroll">
            {mobile ? <LiveSystemMetrics /> : <LiveMetricGrid busy={st.busy} onOpenSettings={toSettings} />}
            {mobile && tab !== "net" && <ReceiverStatus onOpen={() => setTab("net")} />}
            <ActiveProcess jobs={jobs} paused={!!st.paused} onPause={() => call("pause")} onResume={() => call("resume")} onStop={(k) => call("stop", k)} onForce={() => call("force_run")} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.main key={tab} className="stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                {pages[tab]}
              </motion.main>
            </AnimatePresence>
          </div>
          <ConsolePanel logs={logs} />
        </div>
        {mobile && <BottomNav tab={tab === "settings" ? "" : tab} setTab={setTab} />}
        <AnimatePresence>{welcome && <WelcomeModal key="welcome" onClose={closeWelcome} />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}
