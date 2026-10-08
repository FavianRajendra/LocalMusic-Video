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
