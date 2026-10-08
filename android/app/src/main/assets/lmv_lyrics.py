"""LocalMusic and Video - lyrics.

LRCLIB lookup + romanization (Japanese kana AND kanji, Korean Hangul, Chinese hanzi) + optional English translation.
Plain Python (stdlib). mutagen / pykakasi / pypinyin are used when installed. The desktop engine imports this module and the
Android build concatenates it into a yt-dlp plugin, so both platforms behave identically."""
import importlib.util, json, re, shutil, ssl, subprocess, unicodedata, urllib.error, urllib.parse, urllib.request
from pathlib import Path

UA = "LocalMusicAndVideo/2.0"
KANA = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]")
HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
HANGUL = re.compile(r"[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]")
TS_LINE = re.compile(r"^((?:\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$")
META_LINE = re.compile(r"^\s*\[[A-Za-z]+:[^\]]*\]\s*$")

def has_cjk(s): return bool(KANA.search(s) or HAN.search(s) or HANGUL.search(s))
def song_lang(text):
    if KANA.search(text): return "ja"
    if HANGUL.search(text): return "ko"
    return "zh" if HAN.search(text) else ""

# ---------------------------------------------------------------- network
def http(url, data=None, timeout=12):
    """GET (or POST form data) -> bytes. Falls back to curl when Python's certificates are broken (macOS python.org builds)."""
    try:
        import certifi; ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception: ctx = None
    body = None if data is None else urllib.parse.urlencode(data).encode()
    try:
        return urllib.request.urlopen(urllib.request.Request(url, data=body, headers={"User-Agent": UA}), timeout=timeout, context=ctx).read()
    except urllib.error.HTTPError: raise
    except Exception:
        if not shutil.which("curl"): raise
        cmd = ["curl", "-fsSL", "--max-time", str(timeout), "-A", UA]
        for k, v in (data or {}).items(): cmd += ["--data-urlencode", f"{k}={v}"]
        r = subprocess.run(cmd + [url], capture_output=True)
        if r.returncode == 0: return r.stdout
        raise

def fetch(artist, title, duration=0):
    """LRCLIB lookup. Returns (result|None, reachable)."""
    def get(path, **q):
        try: return json.loads(http("https://lrclib.net/api/" + path + "?" + urllib.parse.urlencode(q)))
        except urllib.error.HTTPError as e: return [] if e.code == 404 else None
        except Exception: return None
    if artist and duration:
        r = get("get", artist_name=artist, track_name=title, duration=int(duration))
        if isinstance(r, dict): return r, True
    res = get("search", track_name=title, artist_name=artist)
    if not res: res = get("search", q=f"{artist} {title}".strip())
    if res is None: return None, False
    if duration: res = [x for x in res if abs((x.get("duration") or 0) - duration) <= 3]
    res.sort(key=lambda x: not x.get("syncedLyrics"))
    return (res[0] if res else None), True

def clean(s):
    s = re.sub(r"[\(\[][^\)\]]*(official|lyric|video|audio|visuali[sz]er|\bhd\b|4k|\bmv\b|remaster)[^\)\]]*[\)\]]", "", s, flags=re.I)
    s = re.sub(r"\s*[\(\[]?\s*(feat\.?|ft\.?)\s.*$", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip(" -\u2013|")

def guess(artist, title):
    artist = re.sub(r"\s*-\s*Topic$", "", artist or "")
    if " - " in (title or ""): artist, title = title.split(" - ", 1)
    return clean(artist), clean(title or "")

# ---------------------------------------------------------------- romanization
_KANA = {p[0]: p[1:] for p in ("あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto "
    "なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro "
    "わwa ゐi ゑe をo んn がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo "
    "ぱpa ぴpi ぷpu ぺpe ぽpo ゔvu").split()}
_SMALL = {"ゃ": "a", "ゅ": "u", "ょ": "o", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o"}

def kana_romaji(text):
    """Hepburn romaji for hiragana + katakana (no dictionary needed). Kanji are left untouched."""
    t = unicodedata.normalize("NFKC", text)
    t = "".join(chr(ord(c) - 0x60) if "\u30a1" <= c <= "\u30f6" else c for c in t)          # katakana -> hiragana
    out, i, gem = [], 0, False
    while i < len(t):
        c = t[i]
        if c == "っ": gem = True; i += 1; continue
        if c == "ー":
            if out and out[-1][-1:] in tuple("aiueo"): out.append(out[-1][-1])
            i += 1; continue
        r = _KANA.get(c); i += 1
        if r is None: out.append(c); gem = False; continue
        if i < len(t) and t[i] in _SMALL:
            s = t[i]; v = _SMALL[s]; i += 1
            if r in ("shi", "chi", "ji"): r = r[:-1] + v                                  # sha, cha, ja, che ...
            elif s in "ゃゅょ": r = r[:-1] + "y" + v                                        # kya, nyu ...
            elif r == "u": r = "w" + v                                                     # wi, we
            else: r = r[:-1] + v                                                           # fa, ti, va
        if r == "n" and i < len(t) and t[i] in "あいうえおやゆよ": r = "n'"
        if gem and r[0] not in "aiueo'": r = ("t" if r.startswith("ch") else r[0]) + r
        gem = False; out.append(r)
    return "".join(out)

_L = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
_V = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
_T = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]
_LIA = {1: (0, "g"), 2: (0, "kk"), 3: (1, "ss"), 4: (0, "n"), 5: (4, "j"), 6: (4, ""), 7: (0, "d"), 8: (0, "r"), 9: (8, "g"), 10: (8, "m"),
        11: (8, "b"), 12: (8, "s"), 13: (8, "t"), 14: (8, "p"), 15: (8, ""), 16: (0, "m"), 17: (0, "b"), 18: (17, "s"), 19: (0, "s"),
        20: (0, "ss"), 22: (0, "j"), 23: (0, "ch"), 24: (0, "k"), 25: (0, "t"), 26: (0, "p"), 27: (0, "")}

def hangul_rr(text):
    """Revised Romanization of Korean, including the common sound changes (liaison, nasalization, ㄹ assimilation)."""
    syl = []
    for c in text:
        if "\uac00" <= c <= "\ud7a3":
            n = ord(c) - 0xAC00; syl.append({"L": n // 588, "V": n % 588 // 28, "T": n % 28, "on": None, "co": None})
        else: syl.append({"raw": c})
    for a, b in zip(syl, syl[1:]):
        if "raw" in a or "raw" in b: continue
        T, c = a["T"], _T[a["T"]]
        if T and T != 21 and b["L"] == 11:                                # liaison: 한국어 -> hangugeo
            a["T"], on = _LIA[T]
            b["on"] = "ch" if on == "t" and b["V"] == 20 else "j" if on == "d" and b["V"] == 20 else on   # 같이 -> gachi
        elif c in ("k", "t", "p") and b["L"] in (2, 6): a["co"] = {"k": "ng", "t": "n", "p": "m"}[c]     # 국물 -> gungmul
        elif c == "l" and b["L"] == 2: b["on"] = "l"                      # 설날 -> seollal
        elif c == "n" and b["L"] == 5: a["co"], b["on"] = "l", "l"        # 신라 -> silla
    return "".join(s["raw"] if "raw" in s else
                   (_L[s["L"]] if s["on"] is None else s["on"]) + _V[s["V"]] + (s["co"] if s["co"] is not None else _T[s["T"]]) for s in syl)

_kks = None
def _jp(text):
    """Kanji + kana -> romaji. Uses pykakasi when installed (kanji readings); otherwise kana only."""
    global _kks
    try:
        if _kks is None:
            import pykakasi; _kks = pykakasi.kakasi()
        return " ".join(i["hepburn"] for i in _kks.convert(text) if i["hepburn"]).strip()
    except Exception: return kana_romaji(text)

def _zh(text):
    try:
        from pypinyin import lazy_pinyin, Style
        return " ".join(lazy_pinyin(text, style=Style.TONE)).strip()
    except Exception: return text

def romanize(line, lang):
    """Romanized line, or "" when the line has nothing to romanize or part of it can't be (never a half-converted line)."""
    if not has_cjk(line): return ""
    t = line
    if HANGUL.search(t): t = hangul_rr(t)
    if KANA.search(t) or (lang == "ja" and HAN.search(t)): t = _jp(t)
    elif HAN.search(t) and lang != "ko": t = _zh(t)
    if has_cjk(t): return ""
    t = re.sub(r"\s+", " ", t).strip()
    return "" if t.lower() == line.strip().lower() else t

def romanizers():
    return {m: importlib.util.find_spec(m) is not None for m in ("pykakasi", "pypinyin")}

# ---------------------------------------------------------------- translation (unofficial Google Translate endpoint, best effort)
GT = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl="

def _gt(lines, target):
    data = json.loads(http(GT + target, data={"q": "\n".join(lines)}, timeout=15))
    return "".join(s[0] for s in (data[0] or []) if s and s[0])

def translate_map(texts, target="en"):
    """{line: translation} for lines that need one. Batches lines; falls back to one request per line if the batch misaligns."""
    out, batch, size = {}, [], 0
    def flush():
        nonlocal batch, size
        if not batch: return
        try:
            got = _gt(batch, target).rstrip("\n").split("\n")
            if len(got) != len(batch): raise ValueError("misaligned")
        except Exception:
            got = []
            for t in batch:
                try: got.append(_gt([t], target).strip())
                except Exception: got.append("")
        out.update({t: g.strip() for t, g in zip(batch, got) if g.strip() and g.strip().lower() != t.lower()})
        batch, size = [], 0
    for t in texts:
        if size + len(t) > 1200: flush()
        batch.append(t); size += len(t) + 1
    flush()
    return out

# ---------------------------------------------------------------- compose
def build(synced, plain, opts):
    """(lrc_text|None, plain_text): each original line is followed by its romanization and/or translation.
    In synced lyrics the added lines repeat the original timestamp."""
    entries = []                                                       # [prefix|None, text]
    for raw in (synced or plain or "").splitlines():
        m = TS_LINE.match(raw) if synced else None
        entries.append([m.group(1), m.group(2).strip()] if m else [None if (synced and META_LINE.match(raw)) else "", raw.strip()])
    body = [t for p, t in entries if p is not None and t]
    lang = song_lang("\n".join(body))
    need = sorted({t for t in body if has_cjk(t)})
    rom = {t: romanize(t, lang) for t in need} if opts.get("romaji", True) else {}
    tr = translate_map(need) if opts.get("translate") and need else {}
    lrc, txt = [], []
    for p, t in entries:
        if p is None: lrc.append(t); continue
        extra = [x for x in (rom.get(t), tr.get(t)) if x]
        lrc += [p + t] + [p + x for x in extra]
        txt += [t] + extra if t else [""]
    txt = re.sub(r"\n{3,}", "\n\n", "\n".join(txt)).strip()
    return ("\n".join(lrc) + "\n" if synced else None), txt

def embed(f, text):
    import mutagen
    n = Path(f).suffix.lower()
    if n == ".mp3":
        from mutagen.id3 import ID3, USLT, ID3NoHeaderError
        try: t = ID3(str(f))
        except ID3NoHeaderError: t = ID3()
        t.delall("USLT"); t.add(USLT(encoding=3, lang="eng", desc="", text=text)); t.save(str(f)); return True
    m = mutagen.File(str(f))
    if m is None: return False
    if n == ".m4a": m["\xa9lyr"] = [text]
    else: m["lyrics"] = [text]
    m.save(); return True

def read_tags(f):
    try:
        import mutagen
        m = mutagen.File(str(f), easy=True); tg = m.tags or {}
        return (tg.get("artist") or [""])[0], (tg.get("title") or [Path(f).stem])[0], getattr(m.info, "length", 0) or 0
    except Exception: return "", Path(f).stem, 0

def apply_to_file(f, opts, log=print, meta=None):
    """Find lyrics for the audio file `f`, add romaji/translation, write the .lrc sidecar (opts["sidecar"]) and embed them in the tags.
    meta = dict(artist, title, duration) when the caller knows them (yt-dlp info); otherwise they are read from the tags.
    Returns a short status ("offline" means: try again later)."""
    f = Path(f)
    artist, title, dur = (meta["artist"], meta["title"], meta.get("duration") or 0) if meta else read_tags(f)
    artist, title = guess(artist, title)
    r, ok = fetch(artist, title, dur)
    if not ok: return "offline"
    if not r or r.get("instrumental"): return "no lyrics found"
    synced, plain = r.get("syncedLyrics"), r.get("plainLyrics")
    lrc, txt = build(synced, plain, opts)
    tags = []
    if lrc and opts.get("sidecar", True): f.with_suffix(".lrc").write_text(lrc, encoding="utf-8"); tags.append("synced .lrc")
    if txt:
        try: tags.append("embedded" if embed(f, txt) else "could not embed")
        except Exception as e: tags.append(f"embed failed: {e}")
    body = "\n".join(re.sub(r"^\s*(\[[^\]]*\])+", "", x) for x in (synced or plain or "").splitlines())
    lang = song_lang(body)
    if lang and opts.get("romaji", True):
        miss = [m for m, have in romanizers().items() if not have and (m == "pykakasi") == (lang == "ja") and (m == "pypinyin") == (lang == "zh")]
        if lang in ("ja", "zh") and miss and HAN.search(body): log(f"Note: kanji/hanzi can't be romanized without {miss[0]} (kana and Hangul still are).")
        tags.append("romanized")
    if opts.get("translate") and lang: tags.append("translated")
    return ", ".join(tags) or "nothing to add"


# ---- yt-dlp plugin (Android): runs the shared lyrics code above on every finished track, inside yt-dlp's own Python ----
import os, sys
from yt_dlp.postprocessor.common import PostProcessor


class LmvLyricsPP(PostProcessor):
    """--use-postprocessor "LmvLyrics:when=after_move;romaji=1;translate=0;sidecar=1;log=PATH;libs=PATH" """

    def __init__(self, downloader=None, **kw):
        super().__init__(downloader)
        self.kw = kw

    def _log(self, msg):
        try:
            with open(self.kw["log"], "a", encoding="utf-8") as f:
                f.write(msg.replace("\n", " ") + "\n")
        except Exception:
            pass

    def _tags(self, path, info):
        """When ffmpeg could not write tags (raw-stream fallback), write title/artist with mutagen so players still show them."""
        try:
            import mutagen
            m = mutagen.File(path, easy=True)
            if m is None:
                return
            if m.tags is None:
                m.add_tags()
            t = str(info.get("track") or info.get("title") or "")
            a = str(info.get("artist") or info.get("creator") or info.get("uploader") or "")
            if t:
                m["title"] = [t]
            if a:
                m["artist"] = [a]
            m.save()
        except Exception as e:
            self._log(f"{info.get('id', '?')}|tags error: {e}")

    def _done(self, vid, path):
        """Tell the app this track is finished (the file is complete, lyrics embedded). yt-dlp's own print runs BEFORE this step."""
        d = self.kw.get("done")
        if d and path:
            try:
                with open(d, "a", encoding="utf-8") as f:
                    f.write(f"{vid}|{path}\n")
            except Exception:
                pass

    def run(self, info):
        vid = info.get("id", "?")
        path = info.get("filepath")
        try:
            path = info.get("filepath")
            libs = self.kw.get("libs")
            if libs and os.path.isdir(libs) and libs not in sys.path:
                sys.path.insert(0, libs)           # vendored pykakasi / pypinyin (optional)
            if path and self.kw.get("tags") == "1" and os.path.exists(path):
                self._tags(path, info)
            if path and os.path.splitext(path)[1].lower() in (".opus", ".mp3", ".flac", ".m4a", ".ogg"):
                opts = {"romaji": self.kw.get("romaji") == "1", "translate": self.kw.get("translate") == "1", "sidecar": self.kw.get("sidecar") == "1"}
                meta = {"artist": str(info.get("artist") or info.get("creator") or info.get("uploader") or ""),
                        "title": str(info.get("track") or info.get("title") or ""), "duration": info.get("duration") or 0}
                self._log(f"{vid}|{apply_to_file(path, opts, lambda m: self._log(f'{vid}|{m}'), meta)}")
        except Exception as e:                      # lyrics must never break a download
            self._log(f"{vid}|lyrics error: {e}")
        finally:
            self._done(vid, path)
        return [], info
