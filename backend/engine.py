import base64, collections, json, re, shutil, subprocess, sys, threading, urllib.parse, urllib.request
from pathlib import Path
from . import db
from .paths import scripts_dir

_A = lambda *a: ["-x", "--audio-format", *a]
_V = lambda h, ext="mp4", extra="": ["-f", f"{extra}bv*[height<={h}]+ba/b[height<={h}]", "--merge-output-format", ext]
FORMATS = {
    "opus": _A("opus"), "mp3-320": _A("mp3", "--audio-quality", "320K"),
    "mp3-256": _A("mp3", "--audio-quality", "256K"), "mp3-128": _A("mp3", "--audio-quality", "128K"),
    "flac": _A("flac"), "m4a": _A("m4a"), "wav": _A("wav"), "ogg": _A("vorbis"),
    "2160": _V(2160), "1440": _V(1440),
    "1080p60": ["-f", "bv*[height<=1080][fps>30]+ba/bv*[height<=1080]+ba/b", "--merge-output-format", "mp4"],
    "1080": _V(1080), "720": _V(720), "480": _V(480),
    "best": ["-f", "bv*+ba/b", "--merge-output-format", "mkv"],
}
AUDIO = {"opus", "mp3-320", "mp3-256", "mp3-128", "flac", "m4a", "wav", "ogg"}
SUB_LANGS = "en.*,-live_chat"
EXTS = {".opus", ".mp3", ".flac", ".m4a", ".mp4", ".mkv", ".webm", ".ogg", ".wav"}
ID_RE = re.compile(r"\[([A-Za-z0-9_-]{6,})\]\.\w+$")
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)

def _fetch(url, timeout=15):
    """HTTP GET that survives macOS Python's missing CA certificates (certifi, then curl fallback)."""
    ua = "Mozilla/5.0 LocalMusicAndVideo/2.0"
    ctx = None
    try:
        import certifi, ssl
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception: pass
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=timeout, context=ctx).read()
    except urllib.error.HTTPError: raise
    except Exception:
        r = subprocess.run(["curl", "-fsSL", "--max-time", str(timeout), "-A", ua, url], capture_output=True, creationflags=NOWIN)
        if r.returncode == 0: return r.stdout
        raise

class Engine:
    def __init__(self):
        self.logs, self.cache = [], {}
        self.jobs, self.procs, self.cancel = {}, {}, set()
        self.queue, self.working = collections.deque(), False
        self.lock = threading.Lock()

    def log(self, s):
        with self.lock: self.logs = (self.logs + [s.rstrip()])[-3000:]

    def state(self, since=0):
        with self.lock:
            jobs = {}
            for k, j in self.jobs.items():
                o = dict(j)
                o["overall"] = ((max(0, j["item"] - 1) + j["pct"] / 100) / j["total"] * 100) if j["total"] else j["pct"]
                jobs[k] = o
            busy = any(j["status"] in ("queued", "running") for j in self.jobs.values())
            return dict(logs=self.logs[since:], next=len(self.logs), busy=busy, jobs=jobs)

    # ---- dependencies ----
    def deps(self):
        return {"yt-dlp": bool(shutil.which("yt-dlp")), "ffmpeg": bool(shutil.which("ffmpeg"))}

    def install_deps(self):
        d = scripts_dir()
        if sys.platform == "win32":
            subprocess.Popen(["cmd", "/c", "start", "powershell", "-NoExit", "-ExecutionPolicy", "Bypass",
                              "-File", str(d / "install_deps_win.ps1")])
        elif sys.platform == "darwin":
            s = str(d / "install_deps_mac.sh"); subprocess.run(["chmod", "+x", s])
            subprocess.Popen(["osascript", "-e", f'tell application "Terminal" to do script "bash \\"{s}\\""',
                              "-e", 'tell application "Terminal" to activate'])
        self.log("Installer opened in a terminal window.")

    # ---- inspect / scan ----
    def inspect(self, url):
        r = subprocess.run(["yt-dlp", "--flat-playlist", "--dump-single-json", "--no-warnings", url],
                           capture_output=True, text=True, creationflags=NOWIN)
        try: d = json.loads(r.stdout)
        except ValueError:
            return {"error": (r.stderr.strip().splitlines() or ["Could not read this link."])[-1]}
        ents = d.get("entries"); is_pl = ents is not None
        ents = [e for e in (ents if is_pl else [d]) if e and e.get("id")]
        thumb = d.get("thumbnail") or ((d.get("thumbnails") or [{}])[-1].get("url")) or \
            (f"https://i.ytimg.com/vi/{ents[0]['id']}/hqdefault.jpg" if ents else "")
        info = dict(title=d.get("title") or "Untitled", uploader=d.get("uploader") or d.get("channel") or "",
                    thumbnail=thumb, count=len(ents), seconds=sum(e.get("duration") or 0 for e in ents),
                    is_playlist=is_pl)
        self.cache[url] = dict(info, tracks=[(e["id"], (e.get("ie_key") or e.get("extractor_key") or "Youtube").lower()) for e in ents])
        return info

    def _local(self, folder):
        out = {}
        p = Path(folder)
        if p.is_dir():
            for f in p.iterdir():
                m = ID_RE.search(f.name)
                if f.is_file() and f.suffix.lower() in EXTS and m: out[m[1]] = f
        return out

    def scan(self, url, folder):
        info = self.cache.get(url) or self.inspect(url)
        if "error" in info: return info
        online = {t[0] for t in self.cache[url]["tracks"]}; local = self._local(folder)
        return dict(matched=len(online & set(local)), missing_local=len(online - set(local)),
                    missing_online=len(set(local) - online))

    def _adopt(self, url, folder):
        """Mark tracks already on disk as downloaded so yt-dlp skips them."""
        Path(folder).mkdir(parents=True, exist_ok=True)
        arc, local = Path(folder) / ".archive.txt", self._local(folder)
        have = set(arc.read_text().split("\n")) if arc.exists() else set()
        add = [f"{k} {i}" for i, k in self.cache[url]["tracks"] if i in local and f"{k} {i}" not in have]
        if add:
            with open(arc, "a") as f: f.write("\n".join(add) + "\n")
            self.log(f"Adopted {len(add)} existing files - they will be skipped.")
        return arc

    # ---- vault ----
    def _cover(self, thumb):
        try:
            b = _fetch(thumb)
            return "data:image/jpeg;base64," + base64.b64encode(b).decode()
        except Exception: return ""

    def vault_add(self, url, folder, media, fmt):
        info = self.cache.get(url) or self.inspect(url)
        if "error" in info: return info
        Path(folder).mkdir(parents=True, exist_ok=True)
        pid = db.upsert_playlist(info["title"], url, folder, media, fmt, self._cover(info["thumbnail"]))
        return dict(id=pid, **self.scan(url, folder))

    def vault_status(self, pid):
        pl = db.get_playlist(pid)
        self.cache.pop(pl["url"], None)
        r = self.scan(pl["url"], pl["path"])
        if not pl.get("cover") and "error" not in r:      # backfill missing artwork
            c = self._cover(self.cache[pl["url"]]["thumbnail"])
            if c: db.set_auto_cover(pid, c); r["cover"] = c
        return r

    # ---- yt-dlp runner ----
    def _set(self, key, **kw):
        if key in self.jobs: self.jobs[key].update(kw)

    def _stopped(self, key): return key in self.cancel

    def _run(self, url, dest, fmt, archive, key):
        Path(dest).mkdir(parents=True, exist_ok=True)
        cmd = ["yt-dlp", "--newline", "--ignore-errors", "--no-colors", "--embed-metadata", "--embed-thumbnail",
               *(["--write-subs", "--convert-subs", "lrc"] if fmt in AUDIO else ["--write-subs", "--embed-subs"]),
               "--sub-langs", SUB_LANGS, "--download-archive", str(archive),
               "--progress-template", "download:PROG|%(progress._percent_str)s|%(progress._eta_str)s|%(progress._speed_str)s|%(progress._total_bytes_str)s",
               "-o", "%(title)s [%(id)s].%(ext)s", *FORMATS[fmt], url]
        self.log("$ " + " ".join(cmd))
        self._set(key, stage="Downloading", pct=0)
        p = subprocess.Popen(cmd, cwd=dest, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, creationflags=NOWIN)
        self.procs[key] = p
        for ln in p.stdout:
            if ln.startswith("PROG|"):
                f = (ln.strip().split("|") + [""] * 5)[1:5]
                try: self._set(key, pct=float(f[0].strip().rstrip("%")))
                except ValueError: pass
                self._set(key, eta=f[1].strip(), speed=f[2].strip(), size=f[3].strip())
                continue
            self.log(ln)
            m = re.search(r"Downloading item (\d+) of (\d+)", ln)
            if m: self._set(key, item=int(m[1]), total=int(m[2]), pct=0)
        p.wait(); self.procs.pop(key, None)
        if self._stopped(key): return
        if fmt in AUDIO:
            self._fix_lrc(dest); self._lyrics(dest, key)

    def _fix_lrc(self, dest):
        """Title [id].en.lrc -> Title [id].lrc so players like Poweramp pair it with the audio file."""
        for f in Path(dest).glob("*.lrc"):
            m = re.match(r"^(.*\[[^\]]+\])\.[\w-]+\.lrc$", f.name)
            if m: f.replace(f.with_name(m[1] + ".lrc"))

    # ---- online lyrics (LRCLIB: free, open, synced + plain, no API key) ----
    @staticmethod
    def _clean(s):
        s = re.sub(r"[\(\[][^\)\]]*(official|lyric|video|audio|visuali[sz]er|\bhd\b|4k|\bmv\b|remaster)[^\)\]]*[\)\]]", "", s, flags=re.I)
        s = re.sub(r"\s*[\(\[]?\s*(feat\.?|ft\.?)\s.*$", "", s, flags=re.I)
        return re.sub(r"\s+", " ", s).strip(" -\u2013|")

    def _lrclib(self, artist, track, dur):
        """Returns (result|None, reachable)."""
        def get(path, **q):
            u = "https://lrclib.net/api/" + path + "?" + urllib.parse.urlencode(q)
            try:
                return json.loads(_fetch(u, 12))
            except urllib.error.HTTPError as e: return [] if e.code == 404 else None
            except Exception: return None
        if artist and dur:
            r = get("get", artist_name=artist, track_name=track, duration=int(dur))
            if isinstance(r, dict): return r, True
        res = get("search", track_name=track, artist_name=artist)
        if not res: res = get("search", q=f"{artist} {track}".strip())
        if res is None: return None, False
        if dur: res = [x for x in res if abs((x.get("duration") or 0) - dur) <= 3]
        res.sort(key=lambda x: not x.get("syncedLyrics"))
        return (res[0] if res else None), True

    def _embed(self, f, text):
        import mutagen
        n = f.suffix.lower()
        if n == ".mp3":
            from mutagen.id3 import ID3, USLT, ID3NoHeaderError
            try: t = ID3(f)
            except ID3NoHeaderError: t = ID3()
            t.delall("USLT"); t.add(USLT(encoding=3, lang="eng", desc="", text=text)); t.save(f)
        else:
            m = mutagen.File(f)
            if m is None: return
            if n == ".m4a": m["\xa9lyr"] = [text]
            else: m["lyrics"] = [text]
            m.save()

    def _lyrics(self, dest, key=None):
        try: import mutagen
        except ImportError: return self.log("Lyrics skipped: run  pip install mutagen  in the .venv")
        self._set(key, stage="Fetching lyrics")
        done_f = Path(dest) / ".lyrics_done.txt"
        seen = set(done_f.read_text().split()) if done_f.exists() else set()
        for i, f in self._local(dest).items():
            if self._stopped(key): break
            if i in seen or f.suffix.lower() not in (".opus", ".mp3", ".flac", ".m4a", ".ogg"): continue
            try:
                m = mutagen.File(f, easy=True); tg = m.tags or {}
                artist = re.sub(r"\s*-\s*Topic$", "", (tg.get("artist") or [""])[0])
                title = (tg.get("title") or [f.stem])[0]
                if " - " in title: artist, title = title.split(" - ", 1)
                artist, title = self._clean(artist), self._clean(title)
                r, ok = self._lrclib(artist, title, m.info.length)
                if not ok: continue              # offline: retry next time
                seen.add(i)
                if not r or r.get("instrumental"): self.log(f"Lyrics: none found for {artist} - {title}"); continue
                synced, plain = r.get("syncedLyrics"), r.get("plainLyrics")
                if synced:
                    f.with_suffix(".lrc").write_text(synced, encoding="utf-8")
                    plain = plain or re.sub(r"(?m)^\[[^\]]*\]\s*", "", synced)
                if plain: self._embed(f, plain)
                self.log(f"Lyrics: {'synced' if synced else 'plain'} for {artist} - {title}")
            except Exception as e: self.log(f"Lyrics error for {f.name}: {e}")
        done_f.write_text("\n".join(sorted(seen)) + "\n")

    # ---- job queue: one worker, every job individually stoppable ----
    def _enqueue(self, key, name, fn):
        with self.lock:
            j = self.jobs.get(key)
            if j and j["status"] in ("queued", "running"): return False
            self.jobs[key] = dict(status="queued", stage="Queued", name=name, pct=0, eta="", speed="", size="", item=0, total=0)
            self.cancel.discard(key); self.queue.append((key, fn))
            start = not self.working; self.working = True
        if start: threading.Thread(target=self._work, daemon=True).start()
        return True

    def _work(self):
        while True:
            with self.lock:
                if not self.queue: self.working = False; return
                key, fn = self.queue.popleft()
            j = self.jobs[key]; j.update(status="running", stage="Starting")
            try: fn(key)
            except Exception as e: self.log(f"ERROR: {e}"); j["stage"] = f"Error: {e}"; j["status"] = "error"
            if j["status"] == "running":
                stopped = key in self.cancel
                j.update(status="stopped" if stopped else "done", stage="Stopped" if stopped else "Done")
                if not stopped: j["pct"], j["item"] = 100, j["total"]

    def stop(self, key):
        with self.lock:
            j = self.jobs.get(key)
            if not j: return False
            if j["status"] == "queued":
                self.queue = collections.deque(x for x in self.queue if x[0] != key)
                j.update(status="stopped", stage="Stopped"); return True
        if j["status"] == "running":
            self.cancel.add(key); self.log(f"Stopping {j['name']}...")
            p = self.procs.get(key)
            if p: p.terminate()
        return True

    def stop_all(self):
        for k in list(self.jobs): self.stop(k)

    def download(self, url, dest, media, fmt, track=False):
        def go(key):
            if url not in self.cache: self._set(key, stage="Reading link"); self.inspect(url)
            if track: self.vault_add(url, dest, media, fmt)
            self._run(url, dest, fmt, self._adopt(url, dest), key)
            if self._stopped(key): return
            pl = next((p for p in db.list_playlists() if p["url"] == url), None)
            if pl: db.touch(pl["id"])
            self.log("Done.")
        return self._enqueue("quick", "Quick download", go)

    def _sync_one(self, pl, key):
        self.log(f"== Syncing {pl['name']} ==")
        self._set(key, stage="Checking online list")
        self.cache.pop(pl["url"], None)
        if "error" in self.inspect(pl["url"]) or not self.cache[pl["url"]]["tracks"]:
            self._set(key, stage="Skipped: list unreachable")
            return self.log("Online list unreachable or empty - skipped, nothing deleted.")
        if self._stopped(key): return
        online = {t[0] for t in self.cache[pl["url"]]["tracks"]}
        self._set(key, stage="Comparing with local files")
        arc = self._adopt(pl["url"], pl["path"]); gone = set()
        for i, f in self._local(pl["path"]).items():
            if i not in online:
                self._set(key, stage="Pruning removed tracks")
                self.log(f"Prune: {f.name}"); f.unlink(); f.with_suffix(".lrc").unlink(missing_ok=True); gone.add(i)
        if gone and arc.exists():
            arc.write_text("\n".join(l for l in arc.read_text().splitlines() if l.split()[-1] not in gone) + "\n")
        if self._stopped(key): return
        self._run(pl["url"], pl["path"], pl["fmt"], arc, key)
        if not self._stopped(key): db.touch(pl["id"])

    def sync(self, pid):
        pl = db.get_playlist(pid)
        return bool(pl) and self._enqueue(f"pl{pid}", pl["name"], lambda k: self._sync_one(pl, k))

    def sync_all(self):
        for pl in db.list_playlists(): self.sync(pl["id"])
        return True
