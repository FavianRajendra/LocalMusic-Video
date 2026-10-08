import sys, base64, mimetypes
from pathlib import Path
import webview
from backend import db
from backend.engine import Engine
from backend.localsend import Net
from backend.paths import base_dir, resource_dir, fix_path

fix_path(); db.init(); eng = Engine(); net = Net(eng)
DEV = "--dev" in sys.argv

def dialog(kind, **kw):
    fd = getattr(webview, "FileDialog", None)
    t = (fd.FOLDER if kind == "folder" else fd.OPEN) if fd else (webview.FOLDER_DIALOG if kind == "folder" else webview.OPEN_DIALOG)
    r = webview.windows[0].create_file_dialog(t, **kw)
    return r[0] if r else None

class Api:
    def deps(self): return eng.deps()
    def install_deps(self): eng.install_deps()
    def flag(self, k): return db.get_setting("flag_" + k) == "1"
    def set_flag(self, k): db.set_setting("flag_" + k, "1")
    def settings(self): return dict(dest=db.get_setting("dest", str(base_dir() / "downloads")))
    def pick_folder(self):
        r = dialog("folder")
        if r: db.set_setting("dest", r)
        return r
    def inspect(self, url): return eng.inspect(url)
    def scan(self, url, folder, media=None): return eng.scan(url, folder)
    def download(self, url, dest, media, fmt, track):
        db.set_setting("dest", dest); return eng.download(url, dest, media, fmt, track)
    def vault_add(self, url, dest, media, fmt): db.set_setting("dest", dest); return eng.vault_add(url, dest, media, fmt)
    def vault_list(self): return db.list_playlists()
    def vault_status(self, pid): return eng.vault_status(pid)
    def vault_remove(self, pid): db.remove_playlist(pid)
    def vault_cover(self, pid):
        f = dialog("file", file_types=("Images (*.png;*.jpg;*.jpeg;*.webp)",))
        if not f: return None
        mime = mimetypes.guess_type(f)[0] or "image/png"
        db.set_cover(pid, f"data:{mime};base64," + base64.b64encode(Path(f).read_bytes()).decode()); return True
    def sync(self, pid): return eng.sync(pid)
    def sync_all(self): return eng.sync_all()
    def net_start(self): return net.start()
    def net_stop(self): net.stop()
    def net_state(self): return net.state()
    def net_share(self, on): net.set_share(on)
    def net_scan(self): net.rescan()
    def net_pull(self, fp, two_way): return net.pull(fp, two_way)
    def net_send(self, fp, pid): return net.send(fp, pid)
    def set_remote_path(self, pid, path): db.set_remote_path(pid, path)
    def pause(self): eng.pause()
    def resume(self): eng.resume()
    def tracklist(self, pid): return eng.tracklist(pid)
    def set_skips(self, pid, skip, unskip): eng.set_skips(pid, skip, unskip)
    def ack_recent(self, pid): eng.ack_recent(pid)
    def get_setting(self, k): return db.get_setting(k)
    def set_setting(self, k, v): db.set_setting(k, v)
    def stop(self, key): return eng.stop(key)
    def stop_all(self): eng.stop_all()
    def state(self, since): return eng.state(since)

def selftest():
    """Run by build.py against the finished bundle: every module we need must import, or the build fails."""
    import importlib, json
    f = resource_dir() / "selftest_modules.json"
    mods = json.loads(f.read_text()) if f.exists() else ["backend.engine", "backend.localsend", "webview", "mimetypes"]
    bad = []
    for name in mods + ["webview"]:
        try: importlib.import_module(name)
        except Exception as e: bad.append(f"{name}: {e}")
    d = eng.deps()
    if not all(d.values()): bad.append(f"bundled tools missing: {d}")
    else:
        import subprocess
        r = subprocess.run([*eng._ytdlp(), "--version"], capture_output=True, text=True, timeout=90)
        if r.returncode: bad.append("bundled yt-dlp failed to run: " + r.stderr[:200])
        ff = Path(eng._ffdir()) / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
        if subprocess.run([str(ff), "-version"], capture_output=True, timeout=30).returncode: bad.append("bundled ffmpeg failed to run")
    print("SELFTEST FAILED:\n  " + "\n  ".join(bad) if bad else f"SELFTEST OK ({len(mods)} modules)")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    if "--selftest" in sys.argv: selftest()
    eng.start_auto()
    url = "http://localhost:5173" if DEV else str(resource_dir() / "web_dist" / "index.html")
    webview.create_window("LocalMusic and Video", url, js_api=Api(), width=1120, height=800,
                          min_size=(860, 620), background_color="#0b0d12")
    webview.start(http_server=not DEV, debug="--debug" in sys.argv)
