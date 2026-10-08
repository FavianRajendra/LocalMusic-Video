// One `call()` for both runtimes: pywebview (desktop) and the native Android plugins (Capacitor).
import { Capacitor, registerPlugin } from "@capacitor/core";

export const NATIVE = Capacitor.isNativePlatform();
// registerPlugin() is the supported way to reach an app-local native plugin; `Capacitor.Plugins.X` is not reliably defined for them.
const LmvEngine = registerPlugin("LmvEngine");
const LocalSend = registerPlugin("LocalSend");

const ready = new Promise((res) => {
  const t = setInterval(() => { if (window.pywebview?.api?.deps) { clearInterval(t); res(); } }, 100);
});
// A native call that never answers must become an error, never an endless spinner.
const withTimeout = (p, ms, what) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`"${what}" timed out. Check the connection and try again.`)), ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

export const call = async (fn, ...a) => {
  if (NATIVE) {
    if (fn.startsWith("net_")) return LocalSend[fn]({ value: a[0], args: a });                       // LocalSend protocol
    if (fn === "vault_cover") return (await LmvEngine.pickCover({ value: a[0] })).ok;                // image picker
    if (fn === "pick_folder") return LmvEngine.pickFolder({ value: a[0] });                                         // native folder picker
    return (await withTimeout(LmvEngine.rpc({ fn, args: a }), 150000, fn)).r;                        // yt-dlp/FFmpeg engine
  }
  await ready; return window.pywebview.api[fn](...a);
};
