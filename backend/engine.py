import base64, collections, importlib.util, json, re, shutil, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from pathlib import Path
from . import db, lyrics
from .paths import scripts_dir, resource_dir

# music NEVER pulls a video stream: only the audio-only stream is requested, then remuxed/converted
_A = lambda *a: ["-f", "bestaudio", "-x", "--audio-format", *a]
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
ERR_RE = re.compile(r"^ERROR: (?:\[[^\]]+\] )?([A-Za-z0-9_-]{6,}): (.*)$")
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
        self.tracks, self.failed, self.recent, self.paused_keys = {}, {}, [], set()
        self.gate = threading.Event(); self.gate.set()          # cleared = queue paused

    def log(self, s):
        with self.lock: self.logs = (self.logs + [s.rstrip()])[-3000:]

    def state(self, since=0):
        with self.lock:
            jobs = {}
            for k, j in self.jobs.items():
                o = dict(j)
                o["overall"] = ((max(0, j["item"] - 1) + j["pct"] / 100) / j["total"] * 100) if j["total"] else j["pct"]
                jobs[k] = o
            busy = any(j["status"] in ("queued", "running", "paused") for j in self.jobs.values())
            return dict(logs=self.logs[since:], next=len(self.logs), busy=busy, jobs=jobs,
                        paused=not self.gate.is_set(), recent=[list(x) for x in self.recent])

    # ---- dependencies ----
    def _ytdlp(self):
        """Bundled yt-dlp first (packaged app), then the pip module (dev), then PATH."""
        exe = resource_dir() / "bin" / ("yt-dlp.exe" if sys.platform == "win32" else "yt-dlp")
        if exe.exists():
            try: exe.chmod(0o755)
            except OSError: pass
            return [str(exe)]
        if importlib.util.find_spec("yt_dlp"): return [sys.executable, "-m", "yt_dlp"]
        return ["yt-dlp"] if shutil.which("yt-dlp") else None

    def _ffdir(self):
        """Folder holding a canonically named ffmpeg: the copy bundled via imageio-ffmpeg, else PATH."""
        try:
            import imageio_ffmpeg
            src = Path(imageio_ffmpeg.get_ffmpeg_exe())
        except Exception:
            w = shutil.which("ffmpeg"); return str(Path(w).parent) if w else None
        d = Path(tempfile.gettempdir()) / "lmv-bin"; d.mkdir(exist_ok=True)
        dst = d / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst); dst.chmod(0o755)
        return str(d)

    def deps(self):
        return {"yt-dlp": self._ytdlp() is not None, "ffmpeg": self._ffdir() is not None}

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
        r = subprocess.run([*(self._ytdlp() or ["yt-dlp"]), "--flat-playlist", "--dump-single-json", "--no-warnings", url],
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
        meta = {e["id"]: dict(title=e.get("title") or "", artist=re.sub(r"\s*-\s*Topic$", "", e.get("artist") or e.get("uploader") or e.get("channel") or "")) for e in ents}
        urls = {e["id"]: (e.get("webpage_url") or e.get("url")) for e in ents if str(e.get("webpage_url") or e.get("url") or "").startswith("http")}
        self.cache[url] = dict(info, at=time.time(), meta=meta, urls=urls, tracks=[(e["id"], (e.get("ie_key") or e.get("extractor_key") or "Youtube").lower()) for e in ents])
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
        """Make yt-dlp's download archive an EXACT mirror of the files really on disk.
        A stale entry (file deleted/moved, or archived but never saved) makes yt-dlp silently skip a track we still need."""
        Path(folder).mkdir(parents=True, exist_ok=True)
        arc, local = Path(folder) / ".archive.txt", self._local(folder)
        old = [l for l in arc.read_text().splitlines() if l.strip()] if arc.exists() else []
        stale = [l for l in old if l.split()[-1] not in local]
        lines = [f"{k} {i}" for i, k in self.cache[url]["tracks"] if i in local]
        arc.write_text("\n".join(lines) + ("\n" if lines else ""))
        if stale: self.log(f"Cleared {len(stale)} stale archive entries - those tracks will be downloaded again.")
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
        j = self.jobs.get(f"pl{pid}")
        c = self.cache.get(pl["url"]); fresh = c is not None and time.time() - c.get("at", 0) < 900
        if not (j and j["status"] in ("queued", "running", "paused")) and not fresh: self.cache.pop(pl["url"], None)
        r = self.scan(pl["url"], pl["path"])
        if not pl.get("cover") and "error" not in r and time.time() - self.__dict__.setdefault("_cover_tried", {}).get(pid, 0) > 3600:      # backfill missing artwork
            self._cover_tried[pid] = time.time()                  # a failed cover fetch is retried at most hourly
            c = self._cover(self.cache[pl["url"]]["thumbnail"])
            if c: db.set_auto_cover(pid, c); r["cover"] = c
        return r

    # ---- yt-dlp runner ----
    def _set(self, key, **kw):
        if key in self.jobs: self.jobs[key].update(kw)

    def _stopped(self, key): return key in self.cancel

    @staticmethod
    def _friendly(msg):
        m = msg.lower()
        if "country" in m or "geo" in m: return "Geo-blocked in your region"
        if "private" in m: return "Private video"
        if "age" in m and ("restrict" in m or "confirm" in m): return "Age-restricted (sign-in needed)"
        if "copyright" in m: return "Removed for copyright"
        if "unavailable" in m or "removed" in m or "deleted" in m or "terminated" in m: return "Unavailable or removed"
        return msg.strip()[:140]

    def _run(self, url, dest, fmt, archive, key, items=None, total=0, per_track=False):
        """One yt-dlp invocation. Returns (exit_code, last_output_lines). per_track=True: the caller owns item/total."""
        Path(dest).mkdir(parents=True, exist_ok=True)
        cmd = [*(self._ytdlp() or ["yt-dlp"]), "--newline", "--ignore-errors", "--no-colors", "--no-quiet", "--no-simulate",
               *(["--ffmpeg-location", ff] if (ff := self._ffdir()) else []),
               "--embed-metadata", "--embed-thumbnail",
               *(["--write-subs", "--convert-subs", "lrc"] if fmt in AUDIO else ["--write-subs", "--embed-subs"]),
               "--sub-langs", SUB_LANGS, "--download-archive", str(archive),
               "--print", "before_dl:META|%(id)s|%(artist,creator,uploader)s|%(track,title)s",
               "--print", "after_move:DONE|%(id)s",
               "--progress-template", "download:PROG|%(progress._percent_str)s|%(progress._eta_str)s|%(progress._speed_str)s|%(progress._total_bytes_str)s",
               "-o", "%(title)s [%(id)s].%(ext)s", *FORMATS[fmt]]
        if items: cmd += ["--playlist-items", ",".join(map(str, items))]
        cmd.append(url)
        if per_track: self._set(key, stage="Downloading", pct=0)
        else: self._set(key, stage="Downloading", pct=0, total=total or (len(items) if items else 0))
        tr, n, tail, rc = self.tracks.setdefault(key, {}), 0, collections.deque(maxlen=8), -1
        while True:
            if not self.gate.is_set():       # queue paused before (re)launching yt-dlp: hold here
                self._set(key, status="paused", stage="Paused - resume to continue", speed="", eta="")
                while not self.gate.wait(0.5):
                    if self._stopped(key): return -1, ""
                self._set(key, status="running", stage="Resuming")
            self.log("$ " + " ".join(cmd))
            p = subprocess.Popen(cmd, cwd=dest, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, creationflags=NOWIN)
            self.procs[key] = p
            for ln in p.stdout:
                ln = ln.rstrip()
                if ln.startswith("PROG|"):
                    f = (ln.split("|") + [""] * 5)[1:5]
                    try: self._set(key, pct=float(f[0].strip().rstrip("%")))
                    except ValueError: pass
                    self._set(key, eta=f[1].strip(), speed=f[2].strip(), size=f[3].strip()); continue
                if ln.startswith("META|"):
                    _, vid, art, ttl = (ln.split("|", 3) + ["", "", ""])[:4]
                    art = "" if art == "NA" else re.sub(r"\s*-\s*Topic$", "", art); ttl = "" if ttl == "NA" else ttl
                    tr[vid] = dict(title=ttl, artist=art, status="downloading", msg=""); n += 1
                    self._set(key, pct=0, current=dict(artist=art, title=ttl))
                    if not per_track: self._set(key, item=n)
                    continue
                if ln.startswith("DONE|"):
                    vid = ln.split("|")[1]
                    if vid in tr: tr[vid]["status"] = "done"
                    continue
                m = ERR_RE.match(ln)
                if m:
                    t = tr.setdefault(m[1], dict(title="", artist="", status="", msg=""))
                    if t["status"] != "error" and key in self.jobs: self.jobs[key]["errors"] += 1
                    t.update(status="error", msg=self._friendly(m[2]))
                if ln.strip(): tail.append(ln)
                self.log(ln)
            p.wait(); rc = p.returncode; self.procs.pop(key, None)
            if self._stopped(key): return rc, "\n".join(tail)
            if key not in self.paused_keys: break
            # Paused: yt-dlp was stopped but its .part files are kept. Loop back: we wait for resume, then relaunch and it continues them.
            self.paused_keys.discard(key)
            n = max(0, n - 1)
        if fmt in AUDIO and not self._stopped(key):
            self._fix_lrc(dest); self._lyrics(dest, key)
        return rc, "\n".join(tail)

    def _run_tracks(self, src_url, info, ids, dest, fmt, archive, key):
        """Download TRACK BY TRACK. A bad track (geo-block, rate limit, yt-dlp crash) is recorded and SKIPPED;
        the loop always moves on, so one failure can never abandon the rest of the playlist."""
        order = {t[0]: (n, t[1]) for n, t in enumerate(info["tracks"], 1)}
        tr = self.tracks.setdefault(key, {})
        self._set(key, total=len(ids), item=0)
        for n, vid in enumerate(ids, 1):
            if self._stopped(key): return
            m = info["meta"].get(vid, {})
            tr[vid] = dict(title=m.get("title", ""), artist=m.get("artist", ""), status="downloading", msg="")
            self._set(key, item=n, pct=0, current=dict(artist=m.get("artist", ""), title=m.get("title", "")))
            pos, ie = order[vid]
            turl = info.get("urls", {}).get(vid) or (f"https://www.youtube.com/watch?v={vid}" if ie == "youtube" else None)
            try:
                rc, tail = self._run(turl, dest, fmt, archive, key, per_track=True) if turl else \
                           self._run(src_url, dest, fmt, archive, key, items=[pos], per_track=True)
            except Exception as e:                       # e.g. yt-dlp could not even start
                rc, tail = -1, str(e)
            if self._stopped(key): return
            t = tr[vid]
            if vid in self._local(dest): t["status"] = "done"; continue
            if t["status"] != "error":                   # no ERROR line matched, but nothing was saved: still record it and move on
                t.update(status="error", msg=self._friendly(tail.splitlines()[-1]) if tail.strip() else f"yt-dlp exited with code {rc}")
                if key in self.jobs: self.jobs[key]["errors"] += 1
            self.log(f"Skipped: {t['title'] or vid} ({t['msg']})")

    def _fix_lrc(self, dest):
        """Title [id].en.lrc -> Title [id].lrc so players like Poweramp pair it with the audio file."""
        for f in Path(dest).glob("*.lrc"):
            m = re.match(r"^(.*\[[^\]]+\])\.[\w-]+\.lrc$", f.name)
            if m: f.replace(f.with_name(m[1] + ".lrc"))

    # ---- lyrics: LRCLIB + romanization (kanji/kana/Hangul/hanzi) + optional translation; shared with Android: backend/lyrics.py ----
    def _lyrics(self, dest, key=None):
        if db.get_setting("lyrics_on", "1") != "1": return
        try: import mutagen  # noqa: F401
        except ImportError: return self.log("Lyrics skipped: run  pip install mutagen  in the .venv")
        opts = dict(romaji=db.get_setting("lyrics_romaji", "1") == "1", translate=db.get_setting("lyrics_translate", "0") == "1", sidecar=True)
        sig = f"r{int(opts['romaji'])}t{int(opts['translate'])}"      # changing the options re-processes songs done earlier
        self._set(key, stage="Fetching lyrics")
        done_f = Path(dest) / ".lyrics_done.txt"
        seen = dict((l.split("|", 1) + [""])[:2] for l in done_f.read_text().split()) if done_f.exists() else {}
        for i, f in self._local(dest).items():
            if self._stopped(key): break
            if seen.get(i) == sig or f.suffix.lower() not in (".opus", ".mp3", ".flac", ".m4a", ".ogg"): continue
            try: st = lyrics.apply_to_file(f, opts, self.log)
            except Exception as e: self.log(f"Lyrics error for {f.name}: {e}"); continue
            if st == "offline": continue                               # try again next time
            seen[i] = sig; self.log(f"Lyrics: {st} - {f.stem}")
        done_f.write_text("\n".join(f"{k}|{v}" for k, v in sorted(seen.items())) + "\n")

    # ---- job queue: one worker, every job individually stoppable, whole queue pausable ----
    def _enqueue(self, key, name, fn, auto=False):
        with self.lock:
            j = self.jobs.get(key)
            if j and j["status"] in ("queued", "running", "paused"): return False
            self.jobs[key] = dict(status="queued", stage="Queued", name=name, pct=0, eta="", speed="", size="",
                                  item=0, total=0, errors=0, current=None, auto=auto)
            self.tracks[key] = {}; self.cancel.discard(key); self.queue.append((key, fn))
            start = not self.working; self.working = True
        if start: threading.Thread(target=self._work, daemon=True).start()
        return True

    def _work(self):
        while True:
            while not self.gate.wait(0.5): pass
            with self.lock:
                if not self.queue: self.working = False; return
                key, fn = self.queue.popleft()
            j = self.jobs.get(key)
            if not j: continue
            j.update(status="running", stage="Starting")
            try: fn(key)
            except Exception as e: self.log(f"ERROR: {e}"); j["stage"] = f"Error: {e}"; j["status"] = "error"
            if j["status"] in ("running", "paused"):
                stopped, bad = key in self.cancel, j.get("errors", 0)
                j.update(status="stopped" if stopped else "done",
                         stage="Stopped" if stopped else ("Done" if not bad else f"Done - {bad} failed"))
                if not stopped: j["pct"], j["item"] = 100, j["total"]

    def stop(self, key):
        with self.lock:
            j = self.jobs.get(key)
            if not j: return False
            if j["status"] == "queued":
                self.queue = collections.deque(x for x in self.queue if x[0] != key)
                j.update(status="stopped", stage="Stopped"); return True
        if j["status"] in ("running", "paused"):
            self.cancel.add(key); self.log(f"Stopping {j['name']}...")
            p = self.procs.get(key)
            if p: p.terminate()
        return True

    def stop_all(self):
        for k in list(self.jobs): self.stop(k)

    def pause(self):
        self.gate.clear()
        for k, j in list(self.jobs.items()):
            p = self.procs.get(k)
            if j["status"] == "running" and p:
                self.paused_keys.add(k); j.update(status="paused", stage="Pausing..."); p.terminate()
        self.log("Paused. Partial downloads are kept and will continue on resume.")

    def resume(self):
        self.gate.set(); self.log("Resumed.")

    def _bump(self, pid, n):
        old = dict(self.recent).get(pid, 0)
        self.recent = [(pid, old + n)] + [x for x in self.recent if x[0] != pid]

    def ack_recent(self, pid):
        self.recent = [x for x in self.recent if x[0] != pid]

    # ---- playlist view + review ----
    def tracklist(self, pid):
        pl = db.get_playlist(pid)
        if not pl: return dict(error="Playlist not found")
        url = pl["url"]
        if url not in self.cache:
            r = self.inspect(url)
            if "error" in r: return r
        info, local = self.cache[url], self._local(pl["path"])
        skips, failed, live = db.get_skips(pid), self.failed.get(pid, {}), self.tracks.get(f"pl{pid}", {})
        rows, online = [], set()
        for vid, _ in info["tracks"]:
            online.add(vid); m, lv = info["meta"].get(vid, {}), live.get(vid)
            row = dict(id=vid, title=(lv or {}).get("title") or m.get("title") or vid,
                       artist=(lv or {}).get("artist") or m.get("artist", ""),
                       state="present" if vid in local else "missing", skipped=vid in skips)
            if lv and lv["status"] in ("downloading", "error"): row.update(job=lv["status"], msg=lv["msg"])
            elif vid in failed and vid not in local: row.update(job="error", msg=failed[vid])
            rows.append(row)
        for vid, f in local.items():
            if vid not in online:
                rows.append(dict(id=vid, title=re.sub(r" \[[^\]]+\]\.\w+$", "", f.name), artist="", state="extra", skipped=False))
        return dict(tracks=rows)

    def set_skips(self, pid, skip, unskip):
        db.set_skips(pid, skip, unskip)
        if unskip: self.failed.get(pid, {}).clear()

    # ---- jobs ----
    def download(self, url, dest, media, fmt, track=False):
        def go(key):
            if url not in self.cache:
                self._set(key, stage="Reading link"); r = self.inspect(url)
                if "error" in r: raise RuntimeError(r["error"])
            if track: self.vault_add(url, dest, media, fmt)
            info, arc = self.cache[url], self._adopt(url, dest)
            have = self._local(dest)
            ids = [t[0] for t in info["tracks"] if t[0] not in have]
            if ids: self._run_tracks(url, info, ids, dest, fmt, arc, key)
            else: self._set(key, stage="Already downloaded")
            if self._stopped(key): return
            pl = next((p for p in db.list_playlists() if p["url"] == url), None)
            if pl: db.touch(pl["id"])
            self.log("Done.")
        return self._enqueue("quick", "Quick download", go)

    def _sync_one(self, pl, key, auto=False):
        pid, url, path = pl["id"], pl["url"], pl["path"]
        self._set(key, stage="Checking online list")
        old, r = self.cache.pop(url, None), {}
        for attempt in range(3):                         # a flaky connection must not skip the whole playlist
            r = self.inspect(url)
            if "error" not in r and self.cache[url]["tracks"]: break
            if self._stopped(key): return
            time.sleep(2 * (attempt + 1))
        if url not in self.cache or not self.cache[url]["tracks"]:
            if old and old["tracks"]:
                self.cache[url] = old; self.log(f"Could not refresh {pl['name']}; using the last known track list.")
            else:
                why = r.get("error") or "the playlist is empty"
                self._set(key, stage="Skipped: " + why[:60])
                if not auto: self.log(f"Skipped {pl['name']}: {why}")
                return
        if self._stopped(key): return
        info, local = self.cache[url], self._local(path)
        online, skips, failed = {t[0] for t in info["tracks"]}, db.get_skips(pid), self.failed.get(pid, {})
        want = [t[0] for t in info["tracks"] if t[0] not in local and t[0] not in skips and not (auto and t[0] in failed)]
        gone = [] if auto else [i for i in local if i not in online]      # auto-sync never deletes anything
        if auto and not want: self.jobs.pop(key, None); return           # nothing new: stay silent
        self.log(f"== {'Auto-sync' if auto else 'Syncing'} {pl['name']} ==")
        self._set(key, stage="Comparing with local files")
        arc = self._adopt(url, path)
        for i in gone:
            self._set(key, stage="Pruning removed tracks")
            f = local[i]; self.log(f"Prune: {f.name}"); f.unlink(); f.with_suffix(".lrc").unlink(missing_ok=True)
        if self._stopped(key): return
        if want: self._run_tracks(url, info, want, path, pl["fmt"], arc, key)
        else: self._set(key, stage="Already up to date")
        if self._stopped(key): return
        errs = {i: t["msg"] for i, t in self.tracks.get(key, {}).items() if t["status"] == "error"}
        self.failed[pid] = {**failed, **errs} if auto else errs
        db.touch(pid)
        new = len(set(self._local(path)) - set(local))
        if new: db.touch_added(pid); self._bump(pid, new)                # bumps the playlist to the top of the Vault

    def sync(self, pid, auto=False):
        pl = db.get_playlist(pid)
        return bool(pl) and self._enqueue(f"pl{pid}", pl["name"], lambda k: self._sync_one(pl, k, auto), auto)

    def sync_all(self):
        for pl in db.list_playlists(): self.sync(pl["id"])
        return True

    # ---- background auto-sync ----
    def auto_tick(self):
        if not all(self.deps().values()) or not self.gate.is_set(): return 0
        return sum(bool(self.sync(pl["id"], auto=True)) for pl in db.list_playlists())

    def start_auto(self):
        def loop():
            last = time.time()
            while True:
                time.sleep(15)
                mins = int(db.get_setting("auto_sync", "0") or 0)
                if mins and time.time() - last >= mins * 60: last = time.time(); self.auto_tick()
        threading.Thread(target=loop, daemon=True).start()
