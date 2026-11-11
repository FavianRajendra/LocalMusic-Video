import { call, NATIVE } from "../bridge.js";
import { AUTHOR, DONATE_URL, REPO_URL, VERSION } from "../config.js";
import { usePoll, useSetting } from "../hooks.js";
import SegmentedPill from "./SegmentedPill.jsx";

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><b>{label}</b>{hint ? <><br /><span className="mut small">{hint}</span></> : null}</span>
    </label>
  );
}

export default function Settings({ collapsed, setCollapsed, onWelcome }) {
  const [lyOn, setLyOn] = useSetting("lyrics_on", "1"), [romaji, setRomaji] = useSetting("lyrics_romaji", "1"), [translate, setTranslate] = useSetting("lyrics_translate", "0");
  const [auto, setAuto] = useSetting("auto_sync", "0");
  const [par, setPar] = useSetting("parallel", "2"), [js, setJs] = useSetting("js_runtime", "1"), [heat, setHeat] = useSetting("heat_guard", "1");
  const [net, refreshNet] = usePoll(() => call("net_state"), 5000);
  const on1 = (v) => (v ? "1" : "0");
  return (
    <div className="page">
      <h2>Settings</h2>
      <div className="settings-grid">
        <section className="glass stack">
          <h3>🔄 Auto-Sync</h3>
          <p className="mut small">Checks your playlists in the background while the app is open and downloads new tracks. It never deletes anything.</p>
          <SegmentedPill label="Auto-sync interval" value={String(auto)} onChange={setAuto} options={[["0", "Off"], ["5", "Every 5 min"], ["10", "Every 10 min"]]} />
        </section>

        <section className="glass stack">
          <h3>📝 Lyrics</h3>
          <Toggle label="Add lyrics" hint="From LRCLIB, synced when available." checked={lyOn !== "0"} onChange={(v) => setLyOn(on1(v))} />
          {lyOn !== "0" && <Toggle label="Romanize" hint="Romaji, pinyin and Korean romanization." checked={romaji !== "0"} onChange={(v) => setRomaji(on1(v))} />}
          {lyOn !== "0" && <Toggle label="English translation" hint="Sends the lyric text to Google Translate (an unofficial endpoint, best effort)." checked={translate === "1"} onChange={(v) => setTranslate(on1(v))} />}
        </section>

        {NATIVE && (
          <section className="glass stack">
            <h3>⚡ Speed & heat (Android)</h3>
            <div><p className="mut small">Downloads at once</p><SegmentedPill label="Downloads at once" value={String(par)} onChange={setPar} options={[["1", "1"], ["2", "2"], ["3", "3"]]} /></div>
            <Toggle label="JavaScript runtime for YouTube" hint="More formats, avoids throttling." checked={js !== "0"} onChange={(v) => setJs(on1(v))} />
            <Toggle label="Pause when the phone gets hot" hint="Recommended. Run anyway is offered while cooling down." checked={heat !== "0"} onChange={(v) => setHeat(on1(v))} />
            <button className="ghost sm" onClick={async () => alert("Downloader update: " + (await call("update_ytdlp")))}>Update the downloader</button>
          </section>
        )}

        <section className="glass stack">
          <h3>⛖ Network</h3>
          <Toggle label="Allow incoming" hint="Let other devices on this Wi-Fi send files to you or sync your library. Only turn it on at home or on networks you trust."
            checked={!!net?.share} onChange={async (v) => { await call("net_share", v); refreshNet(); }} />
        </section>

        {!NATIVE && (
          <section className="glass stack">
            <h3>🖥 Appearance</h3>
            <Toggle label="Compact sidebar" hint="Icons only." checked={collapsed} onChange={setCollapsed} />
          </section>
        )}

        <section className="glass stack">
          <h3>ℹ About</h3>
          <p><b>LocalMusic and Video</b> · version {VERSION} · made by <b>{AUTHOR}</b></p>
          <div className="row wrap">
            {DONATE_URL && <button className="primary" onClick={() => call("open_url", DONATE_URL)}>☕ Buy {AUTHOR} a coffee</button>}
            {!REPO_URL.includes("YOUR_") && <button className="ghost" onClick={() => call("open_url", REPO_URL)}>Source code and updates</button>}
            <button className="ghost" onClick={onWelcome}>Show the welcome guide</button>
          </div>
          <p className="mut small">Powered by yt-dlp, FFmpeg, mutagen, LRCLIB, pykakasi and pypinyin. For personal use: you are responsible for respecting copyright and the terms of the sites you download from.</p>
        </section>
      </div>
    </div>
  );
}
