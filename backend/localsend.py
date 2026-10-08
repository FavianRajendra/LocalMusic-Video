"""LocalSend v2 protocol (discovery, receive, send) + LocalMusic-and-Video library sync (/api/lmv/v1)."""
import http.client, json, mimetypes, platform, re, socket, ssl, struct, sys, threading, time, urllib.parse, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from . import db
from .paths import base_dir

MCAST, PORT, CH = "224.0.0.167", 53317, 256 * 1024
OSNAME = {"darwin": "macOS", "win32": "Windows"}.get(sys.platform, "Linux")

def safe_rel(p):
    """Sanitised relative path: no '..', no absolute parts, no illegal characters."""
    parts = [re.sub(r'[<>:"|?*\\]', "_", x) for x in PurePosixPath(str(p or "").replace("\\", "/")).parts if x not in ("/", ".", "..")]
    return Path(*parts) if parts else Path()

class Net:
    def __init__(self, eng):
        self.eng, self.peers, self.sessions = eng, {}, {}
        self.enabled, self.httpd, self.sock = False, None, None
        self.share = db.get_setting("net_share") == "1"          # allow incoming sync / uploads
        self.fp = db.get_setting("net_fp") or uuid.uuid4().hex
        db.set_setting("net_fp", self.fp)
        self.alias = db.get_setting("net_alias") or ("LMV " + platform.node())[:30]

    # ---------- identity / peers ----------
    def me(self, announce=False):
        return dict(alias=self.alias, version="2.0", deviceModel="LocalMusicAndVideo", deviceType="desktop",
                    fingerprint=self.fp, port=PORT, protocol="http", download=False, announce=announce,
                    lmv="2.0", os=OSNAME)

    def add_peer(self, ip, i):
        fp = i.get("fingerprint")
        if not fp or fp == self.fp: return None
        p = dict(fp=fp, alias=i.get("alias", "?"), ip=ip, port=i.get("port", PORT), protocol=i.get("protocol", "https"),
                 deviceType=i.get("deviceType", ""), deviceModel=i.get("deviceModel", ""), lmv=bool(i.get("lmv")),
                 os=i.get("os", ""), seen=time.time())
        p["kind"] = ((("Android APK" if p["os"] == "Android" else p["os"]) or "Desktop") if p["lmv"] else "LocalSend")
        self.peers[fp] = p
        return p

    def state(self):
        return dict(enabled=self.enabled, share=self.share, alias=self.alias,
                    peers=sorted(self.peers.values(), key=lambda p: p["alias"].lower()))

    def set_share(self, on):
        self.share = bool(on); db.set_setting("net_share", "1" if on else "0")

    # ---------- lifecycle ----------
    def start(self):
        if self.enabled: return dict(ok=True)
        try:
            self.httpd = ThreadingHTTPServer(("", PORT), self._handler())
        except OSError:
            return dict(error=f"Port {PORT} is busy. Is the LocalSend app open on this computer?")
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.enabled = True
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if hasattr(socket, "SO_REUSEPORT"): s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            s.bind(("", PORT))
            s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP,
                         struct.pack("4s4s", socket.inet_aton(MCAST), socket.inet_aton("0.0.0.0")))
            s.settimeout(1); self.sock = s
            threading.Thread(target=self._listen, daemon=True).start()
            threading.Thread(target=self._announce_loop, daemon=True).start()
        except OSError as e:
            self.eng.log(f"Multicast discovery unavailable: {e}")
        return dict(ok=True)

    def stop(self):
        self.enabled = False; self.peers.clear()
        if self.sock: self.sock.close(); self.sock = None
        if self.httpd: self.httpd.shutdown(); self.httpd.server_close(); self.httpd = None

    def announce(self):
        try: self.sock.sendto(json.dumps(self.me(True)).encode(), (MCAST, PORT))
        except Exception: pass

    def rescan(self):
        self.peers.clear(); self.announce()

    def _announce_loop(self):
        n = 0
        while self.enabled:
            self.announce(); time.sleep(1.5 if n < 3 else 6); n += 1

    def _listen(self):
        while self.enabled:
            try: data, addr = self.sock.recvfrom(4096)
            except socket.timeout: continue
            except OSError: return
            try: msg = json.loads(data)
            except ValueError: continue
            peer = self.add_peer(addr[0], msg)
            if peer and msg.get("announce"):
                threading.Thread(target=self._register_back, args=(peer,), daemon=True).start()

    def _register_back(self, peer):
        try: self._json(peer, "POST", "/api/localsend/v2/register", self.me(False), 5)
        except Exception: pass

    # ---------- HTTP client helpers ----------
    def _conn(self, peer, timeout=15):
        if peer["protocol"] == "https":
            return http.client.HTTPSConnection(peer["ip"], peer["port"], timeout=timeout, context=ssl._create_unverified_context())
        return http.client.HTTPConnection(peer["ip"], peer["port"], timeout=timeout)

    def _json(self, peer, method, path, body=None, timeout=15):
        c = self._conn(peer, timeout)
        try:
            c.request(method, path, body=None if body is None else json.dumps(body), headers={"Content-Type": "application/json"})
            r = c.getresponse(); data = r.read()
        finally: c.close()
        if r.status >= 400: raise RuntimeError(f"{peer['alias']} answered {r.status}: {data[:100]!r}")
        return json.loads(data) if data else {}

    # ---------- library manifest ----------
    def manifest(self):
        pls, ids = [], []
        for p in db.list_playlists():
            tr = [dict(id=i, file=f.name, size=f.stat().st_size, lrc=f.with_suffix(".lrc").exists())
                  for i, f in self.eng._local(p["path"]).items()]
            pls.append(dict(url=p["url"], name=p["name"], media=p["media"], fmt=p["fmt"], tracks=tr))
            ids += [t["id"] for t in tr]
        return dict(playlists=pls, ids=ids)

    # ---------- jobs ----------
    def pull(self, fp, two_way=False):
        peer = self.peers.get(fp)
        return bool(peer) and self.eng._enqueue(f"net-pull-{fp[:8]}", f"Sync from {peer['alias']}", lambda k: self._pull(k, peer, two_way))

    def send(self, fp, pid):
        peer, pl = self.peers.get(fp), db.get_playlist(pid)
        return bool(peer and pl) and self.eng._enqueue(f"net-send-{fp[:8]}", f"Send {pl['name']} to {peer['alias']}", lambda k: self._send(k, peer, pl))

    def _pull(self, key, peer, two_way):
        e = self.eng; e._set(key, stage="Reading their library")
        need = []
        for rp in self._json(peer, "GET", "/api/lmv/v1/manifest").get("playlists", []):
            mine = next((p for p in db.list_playlists() if p["url"] == rp["url"]), None)
            if not mine:
                folder = base_dir() / "downloads" / safe_rel(rp["name"])
                folder.mkdir(parents=True, exist_ok=True)
                db.upsert_playlist(rp["name"], rp["url"], str(folder), rp["media"], rp["fmt"], "")
                mine = next(p for p in db.list_playlists() if p["url"] == rp["url"])
            have = e._local(mine["path"])
            need += [(mine, rp["url"], t) for t in rp["tracks"] if t["id"] not in have]
        e._set(key, total=len(need), stage="Comparing")
        t0, got = time.time(), [0]
        for n, (mine, url, t) in enumerate(need, 1):
            if e._stopped(key): break
            e._set(key, item=n, pct=0, stage=f"Receiving {t['file'][:40]}")
            self._fetch(peer, url, t, "", mine["path"], key, t0, got)
            if t.get("lrc") and not e._stopped(key): self._fetch(peer, url, t, "lrc", mine["path"], key, t0, got)
        if not need: e._set(key, stage="Already identical")
        if two_way and not e._stopped(key):
            e._set(key, stage="Asking them to pull ours")
            self._json(peer, "POST", "/api/lmv/v1/request-pull", self.me())

    def _fetch(self, peer, url, t, ext, folder, key, t0, got):
        name = Path(t["file"]).name if not ext else Path(t["file"]).with_suffix(".lrc").name
        q = urllib.parse.urlencode({"url": url, "id": t["id"], "ext": ext})
        c = self._conn(peer, 60); part = Path(folder) / (name + ".part")
        try:
            c.request("GET", "/api/lmv/v1/file?" + q); r = c.getresponse()
            if r.status != 200: raise RuntimeError(f"Could not fetch {name} ({r.status})")
            size, done = int(r.getheader("Content-Length") or 0), 0
            with open(part, "wb") as f:
                while chunk := r.read(CH):
                    if self.eng._stopped(key): part.unlink(missing_ok=True); return
                    f.write(chunk); done += len(chunk); got[0] += len(chunk)
                    self.eng._set(key, pct=done * 100 / max(size, 1), speed=f"{got[0] / 1048576 / max(time.time() - t0, .1):.1f} MB/s")
            part.replace(Path(folder) / name)
        finally:
            c.close(); part.unlink(missing_ok=True)

    def _send(self, key, peer, pl):
        e = self.eng; e._set(key, stage="Comparing")
        lmv, skip = peer["lmv"], set()
        if lmv:
            try: skip = set(self._json(peer, "GET", "/api/lmv/v1/manifest").get("ids", []))
            except Exception: pass
        dest = (pl.get("remote_path") or "").strip().strip("/\\")
        items = []
        for i, f in e._local(pl["path"]).items():
            if i in skip: continue
            items.append(f)
            lrc = f.with_suffix(".lrc")
            if lrc.exists() and peer["os"] != "Android": items.append(lrc)
        if not items: return e._set(key, stage="They already have everything")
        files, byid = {}, {}
        for f in items:
            fid = uuid.uuid4().hex[:12]; byid[fid] = f
            # stock LocalSend only honours folders inside fileName; our own apps read `destination`
            files[fid] = dict(id=fid, fileName=f.name if lmv or not dest else f"{dest}/{f.name}", size=f.stat().st_size,
                              fileType=mimetypes.guess_type(f.name)[0] or "application/octet-stream", destination=dest)
        e._set(key, stage="Waiting for the other device to accept", total=len(items))
        r = self._json(peer, "POST", "/api/localsend/v2/prepare-upload", {"info": self.me(), "files": files}, 180)
        sid, toks = r.get("sessionId"), r.get("files", {})
        if not sid: return e._set(key, stage="Declined or nothing to receive")
        t0, sent = time.time(), [0]
        try:
            for n, (fid, f) in enumerate(byid.items(), 1):
                if e._stopped(key): break
                if fid not in toks: continue
                size = f.stat().st_size
                e._set(key, item=n, pct=0, stage=f"Sending {f.name[:40]}")
                def gen(f=f, size=size):
                    got = 0
                    with open(f, "rb") as fh:
                        while b := fh.read(CH):
                            if e._stopped(key): raise InterruptedError
                            got += len(b); sent[0] += len(b)
                            e._set(key, pct=got * 100 / max(size, 1), speed=f"{sent[0] / 1048576 / max(time.time() - t0, .1):.1f} MB/s")
                            yield b
                c = self._conn(peer, 600)
                try:
                    c.request("POST", f"/api/localsend/v2/upload?sessionId={sid}&fileId={fid}&token={toks[fid]}", body=gen(),
                              headers={"Content-Length": str(size), "Content-Type": "application/octet-stream"})
                    resp = c.getresponse(); resp.read()
                    if resp.status >= 400: raise RuntimeError(f"{peer['alias']} refused {f.name} ({resp.status})")
                finally: c.close()
        except InterruptedError: pass
        finally:
            if e._stopped(key):
                try: self._json(peer, "POST", f"/api/localsend/v2/cancel?sessionId={sid}", None, 5)
                except Exception: pass

    # ---------- HTTP server ----------
    def _handler(net):
        class H(BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def _send(self, code=200, obj=None):
                b = json.dumps({} if obj is None else obj).encode()
                self.send_response(code); self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
            def _body(self):
                n = int(self.headers.get("Content-Length") or 0)
                return json.loads(self.rfile.read(n) or b"{}") if n else {}
            def do_GET(self): self._route()
            def do_POST(self): self._route()
            def _route(self):
                u = urllib.parse.urlparse(self.path); p = u.path
                q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
                try:
                    if p.endswith("/info"): return self._send(200, net.me())
                    if p.endswith("/register"):
                        net.add_peer(self.client_address[0], self._body()); return self._send(200, net.me())
                    if not net.share: return self._send(403, {"message": "Incoming access is switched off"})
                    if p.endswith("/prepare-upload"): return self._prepare()
                    if p.endswith("/upload"): return self._upload(q)
                    if p.endswith("/cancel"): net.sessions.pop(q.get("sessionId"), None); return self._send(200)
                    if p == "/api/lmv/v1/manifest": return self._send(200, net.manifest())
                    if p == "/api/lmv/v1/file": return self._file(q)
                    if p == "/api/lmv/v1/request-pull":
                        peer = net.add_peer(self.client_address[0], self._body())
                        if peer: net.pull(peer["fp"], False)
                        return self._send(200)
                    self._send(404, {"message": "Not found"})
                except Exception as ex:
                    try: self._send(500, {"message": str(ex)})
                    except Exception: pass
            def _prepare(self):
                files, sess, out = self._body().get("files", {}), {}, {}
                for fid, f in files.items():
                    rel = safe_rel(f.get("destination") or "")
                    fn = safe_rel(f.get("fileName") or fid)
                    if not f.get("destination"): rel, fn = fn.parent, Path(fn.name)
                    if not fn.name: continue
                    tok = uuid.uuid4().hex
                    sess[fid] = dict(path=base_dir() / "downloads" / "Received" / rel / fn.name, token=tok); out[fid] = tok
                sid = uuid.uuid4().hex; net.sessions[sid] = sess
                net.eng.log(f"Incoming: {len(out)} file(s) accepted")
                self._send(200, {"sessionId": sid, "files": out})
            def _upload(self, q):
                f = net.sessions.get(q.get("sessionId"), {}).get(q.get("fileId"))
                if not f or f["token"] != q.get("token"): return self._send(403, {"message": "Invalid token"})
                left = int(self.headers.get("Content-Length") or 0)
                f["path"].parent.mkdir(parents=True, exist_ok=True); part = f["path"].with_name(f["path"].name + ".part")
                with open(part, "wb") as fh:
                    while left > 0:
                        b = self.rfile.read(min(CH, left))
                        if not b: break
                        fh.write(b); left -= len(b)
                if left: part.unlink(missing_ok=True); return self._send(400, {"message": "Truncated upload"})
                part.replace(f["path"]); net.eng.log(f"Received {f['path'].name}"); self._send(200)
            def _file(self, q):
                pl = next((p for p in db.list_playlists() if p["url"] == q.get("url")), None)
                f = net.eng._local(pl["path"]).get(q.get("id")) if pl else None
                if f and q.get("ext") == "lrc": f = f.with_suffix(".lrc")
                if not f or not f.exists(): return self._send(404, {"message": "No such file"})
                self.send_response(200); self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(f.stat().st_size)); self.end_headers()
                with open(f, "rb") as fh:
                    while b := fh.read(CH): self.wfile.write(b)
        return H
