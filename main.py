import sys, base64, mimetypes
from pathlib import Path
import webview
from backend import db
from backend.engine import Engine
from backend.paths import base_dir, resource_dir, fix_path

fix_path(); db.init(); eng = Engine()
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
    def scan(self, url, folder): return eng.scan(url, folder)
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
    def stop(self, key): return eng.stop(key)
    def stop_all(self): eng.stop_all()
    def state(self, since): return eng.state(since)

if __name__ == "__main__":
    url = "http://localhost:5173" if DEV else str(resource_dir() / "web_dist" / "index.html")
    webview.create_window("LocalMusic and Video", url, js_api=Api(), width=1120, height=800,
                          min_size=(860, 620), background_color="#0b0d12")
    webview.start(http_server=not DEV, debug="--debug" in sys.argv)
