package com.localmusic.app;

import android.app.Activity;
import android.app.Application;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.media.MediaScannerConnection;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import org.json.*;

/**
 * LocalMusic and Video - native Android engine.
 * Runs the real yt-dlp + FFmpeg (youtubedl-android) and publishes every finished file into PUBLIC MediaStore
 * folders (Music/<Playlist>/ or Movies/<Playlist>/), never app-private storage, so Poweramp and other players index it.
 * The web UI talks to it through ONE method, rpc(fn, args), using the same names as the desktop Python API.
 */
@CapacitorPlugin(name = "LmvEngine")
public class LmvEnginePlugin extends Plugin {
    static final Pattern ID = Pattern.compile("\\[([A-Za-z0-9_-]{6,})\\]\\.\\w+$");
    static final Pattern ERR = Pattern.compile("^ERROR: (?:\\[[^\\]]+\\] )?([A-Za-z0-9_-]{6,}): (.*)$", Pattern.MULTILINE);
    static final Pattern SPEED = Pattern.compile("at\\s+(\\S+/s)");
    static final Set<String> AUDIO = new HashSet<>(Arrays.asList("opus", "mp3-320", "mp3-256", "mp3-128", "flac", "m4a", "wav", "ogg"));
    static final Map<String, String[]> FMT = new HashMap<>();
    /** Music: ONLY the audio stream is requested (-f bestaudio), then extracted/remuxed. No video is ever downloaded. */
    static String[] A(String... x) { List<String> l = new ArrayList<>(Arrays.asList("-f", "bestaudio", "-x", "--audio-format")); l.addAll(Arrays.asList(x)); return l.toArray(new String[0]); }
    static String[] V(int h) { return new String[]{"-f", "bv*[height<=" + h + "]+ba/b[height<=" + h + "]", "--merge-output-format", "mp4"}; }
    static {
        FMT.put("opus", A("opus")); FMT.put("mp3-320", A("mp3", "--audio-quality", "320K")); FMT.put("mp3-256", A("mp3", "--audio-quality", "256K"));
        FMT.put("mp3-128", A("mp3", "--audio-quality", "128K")); FMT.put("flac", A("flac")); FMT.put("m4a", A("m4a")); FMT.put("wav", A("wav")); FMT.put("ogg", A("vorbis"));
        FMT.put("2160", V(2160)); FMT.put("1440", V(1440)); FMT.put("1080", V(1080)); FMT.put("720", V(720)); FMT.put("480", V(480));
        FMT.put("1080p60", new String[]{"-f", "bv*[height<=1080][fps>30]+ba/bv*[height<=1080]+ba/b", "--merge-output-format", "mp4"});
        FMT.put("best", new String[]{"-f", "bv*+ba/b", "--merge-output-format", "mkv"});
    }

    // ---------------- small types ----------------
    static JSONObject J(Object... kv) { JSONObject o = new JSONObject(); try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (JSONException ignored) {} return o; }
    interface Fn { void run(String key) throws Exception; }
    static class T { volatile String title = "", artist = "", status = "", msg = ""; }
    static class Local { Uri uri; String name; boolean saf; }
    static class Info {
        String title, uploader, thumb; int count; double seconds; boolean isPl;
        List<String[]> tracks = new ArrayList<>(); Map<String, String[]> meta = new HashMap<>(); Map<String, String> urls = new HashMap<>(); long at = System.currentTimeMillis();
        JSONObject json() { return J("title", title, "uploader", uploader, "thumbnail", thumb, "count", count, "seconds", seconds, "is_playlist", isPl); }
    }
    static class Job {
        volatile String status = "queued", stage = "Queued", name = "", eta = "", speed = "", size = "", cArtist = "", cTitle = "";
        volatile double pct; volatile int item, total, errors; boolean auto;
        JSONObject json() {
            double overall = total > 0 ? ((Math.max(0, item - 1) + pct / 100) / total * 100) : pct;
            return J("status", status, "stage", stage, "name", name, "pct", pct, "eta", eta, "speed", speed, "size", size, "item", item, "total", total,
                "errors", errors, "auto", auto, "overall", overall, "current", cTitle.isEmpty() ? JSONObject.NULL : J("artist", cArtist, "title", cTitle));
        }
    }
    static class Run { File tmp, meta, done, lyr; int mi, di, li, started; String rel; boolean video, alt, noLyrics; Map<String, T> tr; Job j; }

    // ---------------- database (app-private, like data.db on desktop) ----------------
    static class Db extends SQLiteOpenHelper {
        Db(Context c) { super(c, "data.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase d) {
            d.execSQL("CREATE TABLE playlists(id INTEGER PRIMARY KEY, name TEXT, url TEXT UNIQUE, path TEXT, last_synced TEXT, media TEXT, fmt TEXT, cover TEXT, custom_cover INTEGER DEFAULT 0, remote_path TEXT, last_added TEXT)");
            d.execSQL("CREATE TABLE skips(pid INTEGER, vid TEXT, PRIMARY KEY(pid, vid))");
            d.execSQL("CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT)");
        }
        @Override public void onUpgrade(SQLiteDatabase d, int a, int b) {}
        void exec(String sql, Object... a) { getWritableDatabase().execSQL(sql, a); }
        String get(String k) { try (Cursor c = getReadableDatabase().rawQuery("SELECT v FROM settings WHERE k=?", new String[]{k})) { return c.moveToFirst() ? c.getString(0) : null; } }
        void set(String k, String v) { exec("INSERT OR REPLACE INTO settings VALUES(?,?)", k, v); }
        JSONObject row(Cursor c) {
            JSONObject o = new JSONObject();
            try { for (int i = 0; i < c.getColumnCount(); i++) { int t = c.getType(i); if (t == Cursor.FIELD_TYPE_INTEGER) o.put(c.getColumnName(i), c.getLong(i)); else if (t == Cursor.FIELD_TYPE_STRING) o.put(c.getColumnName(i), c.getString(i)); } } catch (JSONException ignored) {}
            return o;
        }
        JSONArray all() { JSONArray a = new JSONArray(); try (Cursor c = getReadableDatabase().rawQuery("SELECT * FROM playlists ORDER BY name", null)) { while (c.moveToNext()) a.put(row(c)); } return a; }
        JSONObject one(int id) { try (Cursor c = getReadableDatabase().rawQuery("SELECT * FROM playlists WHERE id=?", new String[]{String.valueOf(id)})) { return c.moveToFirst() ? row(c) : null; } }
        Set<String> skips(int pid) { Set<String> s = new HashSet<>(); try (Cursor c = getReadableDatabase().rawQuery("SELECT vid FROM skips WHERE pid=?", new String[]{String.valueOf(pid)})) { while (c.moveToNext()) s.add(c.getString(0)); } return s; }
        int upsert(String name, String url, String path, String media, String fmt, String cover) {
            SQLiteDatabase d = getWritableDatabase(); ContentValues v = new ContentValues();
            v.put("name", name); v.put("path", path); v.put("media", media); v.put("fmt", fmt);
            try (Cursor c = d.rawQuery("SELECT id, custom_cover FROM playlists WHERE url=?", new String[]{url})) {
                if (c.moveToFirst()) { if (c.getInt(1) == 0 && !cover.isEmpty()) v.put("cover", cover); d.update("playlists", v, "id=?", new String[]{String.valueOf(c.getInt(0))}); return c.getInt(0); }
            }
            v.put("url", url); v.put("cover", cover); return (int) d.insert("playlists", null, v);
        }
    }

    // ---------------- state ----------------
    Db db; volatile boolean ready, paused; String initError;
    final List<String> logs = Collections.synchronizedList(new ArrayList<>());
    final Object lock = new Object(), gate = new Object();
    final Map<String, Job> jobs = new LinkedHashMap<>();
    final Deque<Object[]> queue = new ArrayDeque<>();
    boolean working;
    final Set<String> cancel = ConcurrentHashMap.newKeySet(), pausedKeys = ConcurrentHashMap.newKeySet(), procs = ConcurrentHashMap.newKeySet();
    final Map<String, Map<String, T>> tracks = new ConcurrentHashMap<>();
    final Map<Integer, Map<String, String>> failed = new ConcurrentHashMap<>();
    final Map<String, Info> cache = new ConcurrentHashMap<>();
    final List<int[]> recent = new CopyOnWriteArrayList<>();
    final ExecutorService rpcPool = Executors.newCachedThreadPool();

    void log(String s) { logs.add(s); }
    static String now() { return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()); }
    static String safe(String s) { String r = s.replaceAll("[\\\\/:*?\"<>|]", "_").trim(); return r.isEmpty() ? "Playlist" : r; }
    static String eta(long s) { return String.format(Locale.US, "%02d:%02d", s / 60, s % 60); }
    Job job(String key) { synchronized (lock) { return jobs.get(key); } }
    static boolean active(Job j) { return j != null && ("queued".equals(j.status) || "running".equals(j.status) || "paused".equals(j.status)); }
    Map<String, String> failedOf(int pid) { return failed.computeIfAbsent(pid, k -> new ConcurrentHashMap<>()); }

    @Override public void load() {
        db = new Db(getContext());
        startEngine();
        new Thread(this::installLyrics).start();
        try {   // lets us see media that already exists in Music/ and Movies/ (files this app created are always visible)
            String[] perms = Build.VERSION.SDK_INT >= 33 ? new String[]{"android.permission.READ_MEDIA_AUDIO", "android.permission.READ_MEDIA_VIDEO", "android.permission.POST_NOTIFICATIONS"} : new String[]{"android.permission.READ_EXTERNAL_STORAGE"};
            ActivityCompat.requestPermissions(getActivity(), perms, 77);
        } catch (Exception ignored) {}
        startAuto();
        syncService();
    }

    // ---------------- engine start-up (reported to the UI, retryable) ----------------
    volatile boolean initializing; volatile String initStage = "Starting...";
    void startEngine() {
        if (initializing || ready) return;
        initializing = true; initError = null; initStage = "Unpacking yt-dlp (the first start can take a minute)...";
        new Thread(() -> {
            String[] step = {"yt-dlp"};
            try {
                Application app = (Application) getContext().getApplicationContext();
                YoutubeDL.getInstance().init(app);
                step[0] = "FFmpeg"; initStage = "Unpacking FFmpeg...";
                FFmpeg.getInstance().init(app);
                long last = 0; try { last = Long.parseLong(String.valueOf(db.get("ytdlp_updated"))); } catch (Exception ignored) {}
                if (System.currentTimeMillis() - last > 12L * 3600_000L) {   // YouTube changes constantly: an old yt-dlp returns empty playlists
                    initStage = "Updating yt-dlp (needs internet, up to a minute)...";
                    Thread ut = new Thread(() -> updateYtDlp(false)); ut.start(); ut.join(60000);
                }
                ready = true; initStage = "Ready"; log("yt-dlp and FFmpeg are ready.");
            } catch (Throwable t) {   // Throwable on purpose: UnsatisfiedLinkError / NoClassDefFoundError are Errors, not Exceptions
                initError = step[0] + " failed to start: " + t.getClass().getSimpleName() + ": " + t.getMessage();
                log(initError); android.util.Log.e("LocalMusicAndVideo", initError, t);
            } finally { initializing = false; }
        }).start();
    }

    // ---------------- lyrics: a yt-dlp plugin (Python) installed from the APK's assets ----------------
    volatile boolean lyricsReady;
    static void copy(InputStream in, OutputStream o) throws IOException { byte[] b = new byte[64 * 1024]; int k; while ((k = in.read(b)) > 0) o.write(b, 0, k); }
    static void deleteTree(File f) { File[] k = f.listFiles(); if (k != null) for (File c : k) deleteTree(c); f.delete(); }
    String readAsset(String n) { try (InputStream in = getContext().getAssets().open(n)) { return new String(readAll(in), "UTF-8").trim(); } catch (Exception e) { return ""; } }
    void copyAssets(String path, File dest) throws IOException {
        String[] kids = getContext().getAssets().list(path);
        if (kids == null || kids.length == 0) { try (InputStream in = getContext().getAssets().open(path); OutputStream o = new FileOutputStream(dest)) { copy(in, o); } return; }
        dest.mkdirs(); for (String k : kids) copyAssets(path + "/" + k, new File(dest, k));
    }
    void installLyrics() {
        try {
            File dir = new File(getContext().getFilesDir(), "ytplugins/lmv/yt_dlp_plugins/postprocessor"); dir.mkdirs();
            try (InputStream in = getContext().getAssets().open("lmv_lyrics.py"); OutputStream o = new FileOutputStream(new File(dir, "lmv_lyrics.py"))) { copy(in, o); }
            String[] libs = getContext().getAssets().list("pylibs");   // optional kanji (pykakasi) / hanzi (pypinyin) romanizers
            if (libs != null && libs.length > 0) {
                File dst = new File(getContext().getFilesDir(), "pylibs"), st = new File(dst, "stamp.txt");
                String have = ""; try (InputStream in = new FileInputStream(st)) { have = new String(readAll(in), "UTF-8").trim(); } catch (Exception ignored) {}
                if (!readAsset("pylibs/stamp.txt").equals(have)) { deleteTree(dst); copyAssets("pylibs", dst); }
            }
            lyricsReady = true;
        } catch (Exception e) { log("Lyrics plugin not installed: " + e.getMessage()); }
    }
    int flag(String k, boolean def) { String v = db.get(k); return v == null ? (def ? 1 : 0) : ("1".equals(v) ? 1 : 0); }
    /** 0 = full (thumbnail + tags + conversion), 1 = no thumbnail, 2 = no tags, 3 = the raw stream with NO ffmpeg step at all.
     *  If ffmpeg cannot do a step on this phone ("Conversion failed"), we step down and keep going instead of giving up. */
    volatile int ppLevel = 0;
    static final String[] LEVELS = {"all steps", "without the embedded thumbnail", "without embedded tags", "the raw stream (no ffmpeg at all)"};
    static boolean convFail(String s) {
        String m = s.toLowerCase(Locale.ROOT);
        return m.contains("conversion failed") || m.contains("postprocessing") || m.contains("ffmpeg") || m.contains("ffprobe") || m.contains("unknown encoder") || m.contains("audio conversion");
    }
    static String tail(String s, int n) { s = s.trim().replace("\n", " | "); return s.length() > n ? "..." + s.substring(s.length() - n) : s; }
    volatile boolean ffOk;   // set after the first successfully saved track
    static boolean finalAudio(String name) { return name.toLowerCase(Locale.ROOT).matches(".*\\.(opus|m4a|mp3|flac|ogg|wav|aac)$"); }
    /** yt-dlp can print an error for an optional step and still leave a finished file behind: find it instead of losing the track. */
    static File salvage(File dir, String id, boolean any, boolean video) {
        File[] fs = dir.listFiles(); if (fs == null) return null;
        List<String> good = video ? Arrays.asList("mp4", "mkv") : Arrays.asList("opus", "m4a", "mp3", "flac", "ogg", "wav", "aac");
        File best = null; int rank = 99;
        for (File f : fs) {
            String n = f.getName().toLowerCase(Locale.ROOT);
            if (!f.getName().contains("[" + id + "]") || f.length() == 0 || n.matches(".*(\\.part|\\.ytdl|\\.jpg|\\.jpeg|\\.png|\\.webp|\\.lrc|\\.json|\\.vtt|\\.srt)$")
                || n.contains(".temp.") || n.matches(".*\\.f[0-9]+\\..*")) continue;
            String ext = n.substring(n.lastIndexOf('.') + 1); int r = good.indexOf(ext);
            if (r < 0 && any && Arrays.asList("webm", "weba", "mka", "mp4", "mkv").contains(ext)) r = 50;
            if (r >= 0 && r < rank) { best = f; rank = r; }
        }
        return best;
    }
    static void cleanLeftovers(File dir, String id) { File[] fs = dir.listFiles(); if (fs != null) for (File f : fs) if (f.getName().contains("[" + id + "]")) f.delete(); }
    /** The lines of yt-dlp's verbose output that say WHY ffmpeg failed. */
    static String ffLines(String err) {
        StringBuilder sb = new StringBuilder(); int n = 0;
        for (String l : err.split("\n")) {
            String m = l.toLowerCase(Locale.ROOT);
            if (n < 8 && !m.contains("command-line config") && (m.contains("ffmpeg") || m.contains("encoder") || m.contains("muxer") || m.contains("invalid") || m.contains("could not") || m.contains("error") || m.contains("unknown") || m.contains("no such"))) { sb.append(l.trim()).append(" | "); n++; }
        }
        return sb.toString();
    }
    /** What to download when ffmpeg is out of the picture: audio as m4a (plays everywhere, tags can still be written), video as one ready-made file. */
    static String[] rawArgs(boolean video) { return video ? new String[]{"-f", "b[ext=mp4]/b"} : new String[]{"-f", "bestaudio[ext=m4a]/bestaudio"}; }
    boolean lyricsOn(Run r) { return lyricsReady && !r.noLyrics && !r.video && flag("lyrics_on", true) == 1; }
    /** The .lrc next to a track can only be stored in a folder you picked (MediaStore refuses non-audio files in Music/). */
    void importSidecar(File f, String rel) throws Exception {
        ContentResolver cr = getContext().getContentResolver(); Uri dir = safDir(rel, true), tree = safTree(rel);
        Uri old = child(tree, dir, f.getName()); if (old != null) DocumentsContract.deleteDocument(cr, old);
        Uri out = DocumentsContract.createDocument(cr, dir, "application/octet-stream", f.getName());
        if (out == null) throw new IOException("the folder refused " + f.getName());
        try (InputStream in = new FileInputStream(f); OutputStream o = cr.openOutputStream(out)) { copy(in, o); }
        f.delete();
    }
    /** Android reports how hot the phone is (API 29+). Warm: slow down. Hot: wait until it cools. */
    volatile boolean thermalForce;   // "Run anyway": ignore the heat protection until the current batch ends
    boolean heatOff() { return thermalForce || flag("heat_guard", true) == 0; }
    void thermalGuard(Job j, String key) throws InterruptedException {
        if (heatOff()) return;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        int s = pm.getCurrentThermalStatus();   // 0 none, 1 light, 2 moderate, 3 severe, 4+ critical
        if (s >= 3) {
            log("The phone is hot: pausing downloads until it cools down.");
            while (pm.getCurrentThermalStatus() >= 3 && !cancel.contains(key) && !heatOff()) { j.stage = "Cooling down - the phone is hot"; notifyService(); Thread.sleep(1000); }
            j.stage = "Downloading";
        } else if (s == 2) Thread.sleep(4000);   // gentle pace while it is warm
    }

    // ---------------- RPC bridge ----------------
    @PluginMethod public void rpc(PluginCall c) {
        String fn = c.getString("fn"); JSArray a = c.getArray("args", new JSArray());
        rpcPool.submit(() -> {
            try { c.resolve(new JSObject().put("r", dispatch(fn, a))); }
            catch (Throwable t) {   // Throwable on purpose: an Error (native library, missing class...) must still answer, or the UI waits forever
                log("ERROR in " + fn + ": " + t); android.util.Log.e("LocalMusicAndVideo", "rpc " + fn, t);
                c.reject(String.valueOf(t.getMessage() != null ? t.getMessage() : t));
            }
        });
    }

    Object dispatch(String fn, JSArray a) throws Exception {
        switch (fn) {
            case "deps": return J("yt-dlp", ready, "ffmpeg", ready, "error", initError == null ? "" : initError, "stage", initStage);
            case "retry_init": startEngine(); return null;
            case "install_deps": return null;
            case "settings": return J("dest", label("audio"), "audio", label("audio"), "video", label("video"));
            case "reset_folder": { String k = kindOf(a.getString(0)); db.set("saf_" + k, ""); db.set("label_" + k, ""); return null; }
            case "update_ytdlp": return updateYtDlp(true);
            case "force_run": thermalForce = true; log("Heat protection overridden: running anyway."); return null;
            case "flag": return "1".equals(db.get("flag_" + a.getString(0)));
            case "set_flag": db.set("flag_" + a.getString(0), "1"); return null;
            case "get_setting": return db.get(a.getString(0));
            case "set_setting": db.set(a.getString(0), a.getString(1)); if ("auto_sync".equals(a.getString(0))) { syncService(); notifyService(); } return null;
            case "state": return state(a.optInt(0, 0));
            case "inspect": return inspect(a.getString(0));
            case "scan": return scan(a.getString(0), a.optString(1, ""), a.optString(2, "audio"));
            case "download": return download(a.getString(0), a.optString(1, ""), a.optString(2, "audio"), a.getString(3), a.optBoolean(4, false));
            case "vault_add": return vaultAdd(a.getString(0), a.optString(1, ""), a.optString(2, "audio"), a.getString(3));
            case "vault_list": return db.all();
            case "vault_status": return vaultStatus(a.getInt(0));
            case "vault_remove": db.exec("DELETE FROM playlists WHERE id=?", a.getInt(0)); db.exec("DELETE FROM skips WHERE pid=?", a.getInt(0)); return null;
            case "set_remote_path": db.exec("UPDATE playlists SET remote_path=? WHERE id=?", a.getString(1), a.getInt(0)); return null;
            case "sync": return sync(a.getInt(0), false);
            case "sync_all": { JSONArray l = db.all(); for (int i = 0; i < l.length(); i++) sync(l.getJSONObject(i).getInt("id"), false); return true; }
            case "stop": return stop(a.getString(0));
            case "stop_all": { List<String> ks; synchronized (lock) { ks = new ArrayList<>(jobs.keySet()); } for (String k : ks) stop(k); return null; }
            case "pause": pause(); return null;
            case "resume": resume(); return null;
            case "tracklist": return tracklist(a.getInt(0));
            case "set_skips": setSkips(a.getInt(0), a.getJSONArray(1), a.getJSONArray(2)); return null;
            case "ack_recent": { int pid = a.getInt(0); recent.removeIf(x -> x[0] == pid); return null; }
            default: throw new IOException("Not available on Android: " + fn);
        }
    }

    JSONObject state(int since) {
        JSONObject jj = new JSONObject(); boolean busy = false;
        synchronized (lock) { for (Map.Entry<String, Job> e : jobs.entrySet()) { try { jj.put(e.getKey(), e.getValue().json()); } catch (JSONException ignored) {} if (active(e.getValue())) busy = true; } }
        JSONArray lg = new JSONArray(); synchronized (logs) { for (int i = Math.max(0, since); i < logs.size(); i++) lg.put(logs.get(i)); }
        JSONArray rc = new JSONArray(); for (int[] x : recent) rc.put(new JSONArray().put(x[0]).put(x[1]));
        return J("logs", lg, "next", logs.size(), "busy", busy, "jobs", jj, "paused", paused, "recent", rc);
    }

    // ---------------- save location: Music/Movies by default, or ANY folder you pick ----------------
    static String rootOf(String media) { return "video".equals(media) ? "Movies" : "Music"; }
    static String kindOf(String media) { return "video".equals(media) ? "video" : "audio"; }
    String label(String media) { String l = db.get("label_" + kindOf(media)); return l == null || l.isEmpty() ? rootOf(media) : l; }
    /** "ms:Music" (public MediaStore folder, no setup) or "saf:<tree uri>" (any folder chosen with the system picker). */
    String target(String media) { String t = db.get("saf_" + kindOf(media)); return t != null && !t.isEmpty() ? "saf:" + t : "ms:" + rootOf(media); }
    static String labelOf(Uri tree) {
        String id = DocumentsContract.getTreeDocumentId(tree); int k = id.indexOf(':');
        String vol = k < 0 ? id : id.substring(0, k), path = k < 0 ? "" : id.substring(k + 1);
        return ("primary".equals(vol) ? "Internal storage" : "SD card (" + vol + ")") + (path.isEmpty() ? "" : "/" + path);
    }
    @PluginMethod public void pickFolder(PluginCall c) {   // the real Android file explorer: any folder, internal storage or SD card
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(c, i, "folderPicked");
    }
    @ActivityCallback private void folderPicked(PluginCall c, ActivityResult r) {
        if (c == null) return;
        try {
            Intent d = r.getData();
            if (r.getResultCode() != Activity.RESULT_OK || d == null || d.getData() == null) { c.resolve(new JSObject().put("cancelled", true)); return; }
            Uri tree = d.getData();
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);   // survives reboots
            String kind = kindOf(c.getString("value", "audio")), lab = labelOf(tree);
            db.set("saf_" + kind, tree.toString()); db.set("label_" + kind, lab);
            c.resolve(new JSObject().put("path", lab).put("kind", kind));
        } catch (Exception e) { c.reject(String.valueOf(e.getMessage())); }
    }

    // ---------------- storage backends ----------------
    static boolean isSaf(String loc) { return loc.startsWith("saf:"); }
    static String msRel(String loc) { return loc.startsWith("ms:") ? loc.substring(3) : loc; }   // rows saved by older versions have no prefix: they are MediaStore paths
    static Uri safTree(String loc) { String r = loc.substring(4); return Uri.parse(r.substring(0, r.lastIndexOf('|'))); }
    static String safSub(String loc) { return loc.substring(loc.lastIndexOf('|') + 1); }
    static Uri treeRoot(Uri tree) { return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)); }
    Uri child(Uri tree, Uri parent, String name) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(parent));
        try (Cursor q = getContext().getContentResolver().query(kids, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            while (q != null && q.moveToNext()) if (name.equals(q.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, q.getString(0));
        }
        return null;
    }
    Uri safDir(String loc, boolean create) throws IOException {
        Uri tree = safTree(loc), root = treeRoot(tree); String sub = safSub(loc);
        if (sub.isEmpty()) return root;
        Uri d = child(tree, root, sub);
        if (d == null && create) d = DocumentsContract.createDocument(getContext().getContentResolver(), root, DocumentsContract.Document.MIME_TYPE_DIR, sub);
        return d;
    }
    static String docPath(String docId) {
        int k = docId.indexOf(':'); String vol = k < 0 ? "primary" : docId.substring(0, k), rest = k < 0 ? docId : docId.substring(k + 1);
        return "primary".equals(vol) ? "/storage/emulated/0/" + rest : "/storage/" + vol + "/" + rest;
    }
    void deleteLocal(Local l) throws Exception {
        if (l.saf) DocumentsContract.deleteDocument(getContext().getContentResolver(), l.uri); else getContext().getContentResolver().delete(l.uri, null, null);
    }

    // ---------------- cover art ----------------
    @PluginMethod public void pickCover(PluginCall c) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("image/*");
        startActivityForResult(c, i, "coverPicked");
    }
    @ActivityCallback private void coverPicked(PluginCall c, ActivityResult r) {
        if (c == null) return;
        try {
            Intent d = r.getData();
            if (r.getResultCode() != Activity.RESULT_OK || d == null || d.getData() == null) { c.resolve(new JSObject().put("ok", false)); return; }
            byte[] raw; try (InputStream in = getContext().getContentResolver().openInputStream(d.getData())) { raw = readAll(in); }
            Bitmap b = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (b == null) { c.resolve(new JSObject().put("ok", false)); return; }
            float s = Math.min(1f, 640f / Math.max(b.getWidth(), b.getHeight()));     // keep DB rows small
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * s), Math.round(b.getHeight() * s), true).compress(Bitmap.CompressFormat.JPEG, 82, o);
            db.exec("UPDATE playlists SET cover=?, custom_cover=1 WHERE id=?", "data:image/jpeg;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP), c.getInt("value", 0));
            c.resolve(new JSObject().put("ok", true));
        } catch (Exception e) { c.reject(String.valueOf(e.getMessage())); }
    }
    static byte[] readAll(InputStream in) throws IOException { ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int k; while ((k = in.read(b)) > 0) o.write(b, 0, k); return o.toByteArray(); }
    String fetchCover(String u) {
        if (u == null || u.isEmpty()) return "";
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(12000); c.setRequestProperty("User-Agent", "Mozilla/5.0");
            try (InputStream in = c.getInputStream()) { return "data:image/jpeg;base64," + Base64.encodeToString(readAll(in), Base64.NO_WRAP); }
        } catch (Exception e) { return ""; }
    }

    // ---------------- inspect / scan (MediaStore is the source of truth for "what is on disk") ----------------
    final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    volatile boolean updatedThisRun;
    /** Updates the bundled yt-dlp to the newest release (an old one returns EMPTY playlists once YouTube changes).
     *  Reflection keeps this compiling whichever UpdateChannel type the library version uses. */
    synchronized String updateYtDlp(boolean force) {
        if (updatedThisRun && !force) return "already updated";
        updatedThisRun = true; log("Updating yt-dlp... (needs internet)");
        try {
            java.lang.reflect.Method pick = null;
            for (java.lang.reflect.Method m : YoutubeDL.class.getMethods())
                if (m.getName().equals("updateYoutubeDL") && (pick == null || m.getParameterTypes().length < pick.getParameterTypes().length)) pick = m;
            if (pick == null) return "this library version has no updater";
            Class<?>[] pt = pick.getParameterTypes(); Object[] args = new Object[pt.length]; args[0] = getContext().getApplicationContext();
            if (pt.length > 1) args[1] = channelStable(pt[1]);
            Object res = pick.invoke(YoutubeDL.getInstance(), args);
            db.set("ytdlp_updated", String.valueOf(System.currentTimeMillis())); log("yt-dlp update: " + res);
            return String.valueOf(res);
        } catch (Throwable t) { Throwable c = t.getCause() != null ? t.getCause() : t; log("yt-dlp update failed: " + c); return "update failed: " + c.getMessage(); }
    }
    static Object channelStable(Class<?> type) throws Exception {
        for (String n : new String[]{"STABLE", "_STABLE"}) {
            try { return type.getField(n).get(null); } catch (NoSuchFieldException ignored) {}
            try { return Class.forName(type.getName() + "$" + n).getField("INSTANCE").get(null); } catch (ClassNotFoundException | NoSuchFieldException ignored) {}
        }
        if (type.isEnum()) for (Object o : type.getEnumConstants()) if (o.toString().contains("STABLE")) return o;
        throw new IllegalStateException("no STABLE update channel in " + type);
    }
    static String hint(String err, String fallback) {
        String best = ""; for (String l : err.split("\n")) if (l.contains("ERROR") || l.contains("WARNING")) best = l.trim();
        return best.isEmpty() ? fallback : (best.length() > 220 ? best.substring(0, 220) : best);
    }
    JSONObject inspect(String url) {
        if (!ready) return J("error", initError != null ? initError : "The engine is still starting. Try again in a moment.");
        JSONObject r = inspectOnce(url);
        if (r.optBoolean("retry") && !updatedThisRun) { updateYtDlp(false); r = inspectOnce(url); }   // outdated yt-dlp is the usual cause: update once, try again
        return r;
    }
    final Semaphore inspectGate = new Semaphore(1);   // one lookup at a time: each one starts a whole Python process
    JSONObject inspectOnce(String url) {
        try { inspectGate.acquire(); } catch (InterruptedException e) { return J("error", "Interrupted"); }
        try { return inspectLocked(url); } finally { inspectGate.release(); }
    }
    JSONObject inspectLocked(String url) {
        String pid = "inspect-" + System.nanoTime(); boolean[] timedOut = {false};
        ScheduledFuture<?> dog = timer.schedule(() -> { timedOut[0] = true; log("Reading the link took too long; stopping it."); kill(pid); }, 90, TimeUnit.SECONDS);
        try {
            YoutubeDLRequest q = new YoutubeDLRequest(url);
            q.addOption("--flat-playlist"); q.addOption("--dump-single-json"); q.addOption("--ignore-errors");
            q.addOption("--socket-timeout", "20"); q.addOption("--retries", "3");
            YoutubeDLResponse resp = YoutubeDL.getInstance().execute(q, pid, null);
            String out = resp.getOut() == null ? "" : resp.getOut(), err = resp.getErr() == null ? "" : resp.getErr();
            if (out.indexOf('{') < 0) return J("error", hint(err, "yt-dlp returned nothing for this link."), "retry", true);
            Info i = parse(out);
            if (i.tracks.isEmpty()) {   // NEVER pretend an empty result is a playlist: say why
                log("yt-dlp found 0 tracks. Output began: " + out.substring(0, Math.min(300, out.length())) + (err.isEmpty() ? "" : " | stderr: " + err.substring(Math.max(0, err.length() - 300))));
                return J("error", hint(err, "yt-dlp found no tracks for this link (private, empty or region-blocked playlist?)."), "retry", true);
            }
            cache.put(url, i); return i.json();
        } catch (Throwable e) {
            log("Could not read the link: " + e); android.util.Log.e("LocalMusicAndVideo", "inspect", e);
            if (timedOut[0]) return J("error", "Reading the link timed out. Check the connection and try again.");
            String m = String.valueOf(e.getMessage()).trim(); String[] ls = m.split("\n");
            return J("error", m.isEmpty() || "null".equals(m) ? e.getClass().getSimpleName() : hint(m, ls[ls.length - 1]), "retry", m.contains("xtract"));
        } finally { dog.cancel(false); }
    }
    static String first(JSONObject o, String... ks) { for (String k : ks) { String v = o.optString(k, ""); if (!v.isEmpty() && !"null".equals(v)) return v; } return ""; }
    void collect(JSONArray ents, Info i) throws JSONException {
        for (int k = 0; k < ents.length(); k++) {
            JSONObject e = ents.optJSONObject(k); if (e == null) continue;
            JSONArray sub = e.optJSONArray("entries"); if (sub != null) { collect(sub, i); continue; }   // e.g. a channel's tabs: flatten them
            String id = e.optString("id", ""), eu = first(e, "webpage_url", "url");
            if (id.isEmpty() || "null".equals(id)) { Matcher m = Pattern.compile("(?:v=|youtu\\.be/|/shorts/)([A-Za-z0-9_-]{11})").matcher(eu); if (m.find()) id = m.group(1); else continue; }
            String key = first(e, "ie_key", "extractor_key").toLowerCase(Locale.ROOT); if (key.isEmpty()) key = "youtube";
            i.tracks.add(new String[]{id, key}); i.seconds += e.optDouble("duration", 0);
            if (eu.startsWith("http")) i.urls.put(id, eu);
            i.meta.put(id, new String[]{e.optString("title", ""), first(e, "artist", "uploader", "channel").replaceAll("\\s*-\\s*Topic$", "")});
        }
    }
    Info parse(String out) throws JSONException {
        JSONObject d = new JSONObject(out.substring(out.indexOf('{')));
        JSONArray ents = d.optJSONArray("entries"); boolean pl = ents != null; if (!pl) ents = new JSONArray().put(d);
        Info i = new Info(); i.isPl = pl; i.title = d.optString("title", "Untitled"); i.uploader = first(d, "uploader", "channel");
        collect(ents, i);
        i.count = i.tracks.size();
        JSONArray th = d.optJSONArray("thumbnails");
        i.thumb = !d.optString("thumbnail", "").isEmpty() ? d.optString("thumbnail") : th != null && th.length() > 0 ? th.getJSONObject(th.length() - 1).optString("url", "")
            : i.count > 0 ? "https://i.ytimg.com/vi/" + i.tracks.get(0)[0] + "/hqdefault.jpg" : "";
        return i;
    }
    /** Audio -> Music/<Playlist>, video -> Movies/<Playlist>. Single videos go to .../Singles. */
    /** Where this playlist lives: ms:Music/<Playlist> by default, or saf:<picked folder>|<Playlist>. (`base` is only a UI label.) */
    String relFor(Info i, String media, String base) {
        String sub = i.isPl ? safe(i.title) : "Singles", t = target(media);
        return isSaf(t) ? t + "|" + sub : t + "/" + sub;
    }
    Uri col(boolean video) { return video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) : MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY); }
    Map<String, Local> local(String loc) {
        if (isSaf(loc)) return localSaf(loc);
        String rel = msRel(loc); Map<String, Local> m = new HashMap<>(); Uri c = col(rel.startsWith("Movies"));
        try (Cursor q = getContext().getContentResolver().query(c, new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME},
                MediaStore.MediaColumns.RELATIVE_PATH + "=?", new String[]{rel + "/"}, null)) {
            while (q != null && q.moveToNext()) {
                Matcher mt = ID.matcher(q.getString(1));
                if (mt.find()) { Local l = new Local(); l.uri = ContentUris.withAppendedId(c, q.getLong(0)); l.name = q.getString(1); m.put(mt.group(1), l); }
            }
        }
        return m;
    }
    Map<String, Local> localSaf(String loc) {
        Map<String, Local> m = new HashMap<>();
        try {
            Uri tree = safTree(loc), dir = safDir(loc, false); if (dir == null) return m;
            Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(dir));
            try (Cursor q = getContext().getContentResolver().query(kids, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                while (q != null && q.moveToNext()) {
                    Matcher mt = ID.matcher(q.getString(1));
                    if (mt.find()) { Local l = new Local(); l.uri = DocumentsContract.buildDocumentUriUsingTree(tree, q.getString(0)); l.name = q.getString(1); l.saf = true; m.put(mt.group(1), l); }
                }
            }
        } catch (Exception e) { log("Cannot read the chosen folder (" + e.getMessage() + "). Pick it again with Choose folder."); }
        return m;
    }
    JSONObject scan(String url, String base, String media) {
        if (!cache.containsKey(url)) { JSONObject r = inspect(url); if (r.has("error")) return r; }
        return scanRel(url, relFor(cache.get(url), media, base));
    }
    JSONObject scanRel(String url, String rel) {
        if (!cache.containsKey(url)) { JSONObject r = inspect(url); if (r.has("error")) return r; }
        Info i = cache.get(url); Map<String, Local> loc = local(rel); Set<String> online = new HashSet<>();
        for (String[] t : i.tracks) online.add(t[0]);
        int matched = 0, extra = 0;
        for (String id : online) if (loc.containsKey(id)) matched++;
        for (String id : loc.keySet()) if (!online.contains(id)) extra++;
        return J("matched", matched, "missing_local", online.size() - matched, "missing_online", extra);
    }

    // ---------------- vault ----------------
    JSONObject vaultAdd(String url, String base, String media, String fmt) throws Exception {
        if (!cache.containsKey(url)) { JSONObject r = inspect(url); if (r.has("error")) return r; }
        Info i = cache.get(url); String rel = relFor(i, media, base);
        int id = db.upsert(i.title, url, rel, media, fmt, fetchCover(i.thumb));
        return scanRel(url, rel).put("id", id);
    }
    JSONObject vaultStatus(int pid) throws Exception {
        JSONObject pl = db.one(pid); if (pl == null) return J("error", "Playlist not found");
        String url = pl.getString("url");
        Info c0 = cache.get(url);   // a fresh track list is reused (a lookup = a whole Python process); it is refreshed by Sync or after 15 minutes
        if (!active(job("pl" + pid)) && (c0 == null || System.currentTimeMillis() - c0.at > 15 * 60_000L)) cache.remove(url);
        JSONObject r = scanRel(url, pl.getString("path"));
        if (!r.has("error") && pl.optString("cover", "").isEmpty() && cache.containsKey(url)) {
            String c = fetchCover(cache.get(url).thumb);
            if (!c.isEmpty()) { db.exec("UPDATE playlists SET cover=? WHERE id=? AND custom_cover=0", c, pid); r.put("cover", c); }
        }
        return r;
    }
    void setSkips(int pid, JSONArray skip, JSONArray unskip) throws JSONException {
        for (int i = 0; i < skip.length(); i++) db.exec("INSERT OR IGNORE INTO skips VALUES(?,?)", pid, skip.getString(i));
        for (int i = 0; i < unskip.length(); i++) db.exec("DELETE FROM skips WHERE pid=? AND vid=?", pid, unskip.getString(i));
        if (unskip.length() > 0) failedOf(pid).clear();
    }
    JSONObject tracklist(int pid) throws Exception {
        JSONObject pl = db.one(pid); if (pl == null) return J("error", "Playlist not found");
        String url = pl.getString("url");
        if (!cache.containsKey(url)) { JSONObject r = inspect(url); if (r.has("error")) return r; }
        Info i = cache.get(url); Map<String, Local> loc = local(pl.getString("path")); Set<String> skips = db.skips(pid);
        Map<String, String> fl = failedOf(pid); Map<String, T> live = tracks.get("pl" + pid);
        JSONArray rows = new JSONArray(); Set<String> online = new HashSet<>();
        for (String[] t : i.tracks) {
            online.add(t[0]); String[] m = i.meta.get(t[0]); T lv = live == null ? null : live.get(t[0]);
            JSONObject row = J("id", t[0], "title", lv != null && !lv.title.isEmpty() ? lv.title : (m[0].isEmpty() ? t[0] : m[0]),
                "artist", lv != null && !lv.artist.isEmpty() ? lv.artist : m[1], "state", loc.containsKey(t[0]) ? "present" : "missing", "skipped", skips.contains(t[0]));
            if (lv != null && ("downloading".equals(lv.status) || "error".equals(lv.status))) { row.put("job", lv.status); row.put("msg", lv.msg); }
            else if (fl.containsKey(t[0]) && !loc.containsKey(t[0])) { row.put("job", "error"); row.put("msg", fl.get(t[0])); }
            rows.put(row);
        }
        for (Map.Entry<String, Local> e : loc.entrySet()) if (!online.contains(e.getKey()))
            rows.put(J("id", e.getKey(), "title", e.getValue().name.replaceAll(" \\[[^\\]]+\\]\\.\\w+$", ""), "artist", "", "state", "extra", "skipped", false));
        return J("tracks", rows);
    }

    // ---------------- job queue: one worker, per-job stop, whole-queue pause ----------------
    boolean enqueue(String key, String name, boolean auto, Fn fn) {
        boolean start;
        synchronized (lock) {
            Job j = jobs.get(key); if (active(j)) return false;
            j = new Job(); j.name = name; j.auto = auto; jobs.put(key, j);
            tracks.put(key, new ConcurrentHashMap<>()); cancel.remove(key); queue.add(new Object[]{key, fn});
            start = !working; working = true;
        }
        if (start) new Thread(this::work).start();
        syncService();
        return true;
    }
    void gateWait(String key) throws InterruptedException { synchronized (gate) { while (paused && (key == null || !cancel.contains(key))) gate.wait(500); } }
    void work() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);   // yt-dlp children inherit this: efficiency cores, cooler phone, smooth UI
        while (true) {
            try { gateWait(null); } catch (InterruptedException e) { return; }
            Object[] t; synchronized (lock) { t = queue.poll(); if (t == null) { working = false; thermalForce = false; return; } }   // the override ends with the batch
            String key = (String) t[0]; Job j = job(key); if (j == null) continue;
            j.status = "running"; j.stage = "Starting";
            try { ((Fn) t[1]).run(key); } catch (Exception e) { log("ERROR: " + e.getMessage()); j.stage = "Error: " + e.getMessage(); j.status = "error"; }
            if ("running".equals(j.status) || "paused".equals(j.status)) {
                boolean st = cancel.contains(key); j.status = st ? "stopped" : "done";
                j.stage = st ? "Stopped" : (j.errors > 0 ? "Done - " + j.errors + " failed" : "Done");
                if (!st) { j.pct = 100; j.item = j.total; }
            }
            syncService(); notifyService();
        }
    }
    void kill(String key) { try { YoutubeDL.getInstance().destroyProcessById(key); } catch (Exception ignored) {} }
    boolean stop(String key) {
        Job j;
        synchronized (lock) {
            j = jobs.get(key); if (j == null) return false;
            if ("queued".equals(j.status)) { queue.removeIf(x -> x[0].equals(key)); j.status = "stopped"; j.stage = "Stopped"; return true; }
        }
        if ("running".equals(j.status) || "paused".equals(j.status)) { cancel.add(key); log("Stopping " + j.name + "..."); kill(key); synchronized (gate) { gate.notifyAll(); } }
        return true;
    }
    void pause() {
        paused = true; List<String> ks; synchronized (lock) { ks = new ArrayList<>(jobs.keySet()); }
        for (String k : ks) { Job j = job(k); if (j != null && "running".equals(j.status) && procs.contains(k)) { pausedKeys.add(k); j.status = "paused"; j.stage = "Pausing..."; kill(k); } }
        log("Paused. Partial downloads are kept and continue on resume."); notifyService();
    }
    void resume() { paused = false; synchronized (gate) { gate.notifyAll(); } log("Resumed."); notifyService(); }
    void bump(int pid, int n) { int old = 0; for (int[] x : recent) if (x[0] == pid) old = x[1]; recent.removeIf(x -> x[0] == pid); recent.add(0, new int[]{pid, old + n}); }

    // ---------------- background service (keeps downloads alive with the screen off) ----------------
    volatile boolean svcOn;
    int autoMins() { try { return Integer.parseInt(String.valueOf(db.get("auto_sync"))); } catch (Exception e) { return 0; } }
    /** Service runs while any job is active, or while Auto-sync is on. Android 12+ only lets us START it while the app is visible. */
    synchronized void syncService() {
        boolean want = false;
        synchronized (lock) { for (Job j : jobs.values()) if (active(j)) { want = true; break; } }
        want = want || autoMins() > 0;
        if (want == svcOn) return;
        try {
            Context c = getContext(); Intent i = new Intent(c, DownloadService.class);
            if (want) ContextCompat.startForegroundService(c, i); else c.stopService(i);
            svcOn = want;
        } catch (Exception e) { log("Background service unavailable: " + e.getMessage()); }
    }
    String lastNote = "";
    void notifyService() {
        if (!svcOn) return;
        Job run = null; int queued = 0;
        synchronized (lock) { for (Job j : jobs.values()) { if ("running".equals(j.status) || "paused".equals(j.status)) run = j; else if ("queued".equals(j.status)) queued++; } }
        DownloadService.hold(run != null && "running".equals(run.status));   // the CPU wake lock is held ONLY while a download is really running
        String title = "LocalMusic and Video", text; int pct = -1;
        if (run == null) text = autoMins() > 0 ? "Auto-sync every " + autoMins() + " min" : "Idle";
        else {
            double ov = run.total > 0 ? ((Math.max(0, run.item - 1) + run.pct / 100) / run.total * 100) : run.pct;
            String now = run.cTitle.isEmpty() ? run.stage : (run.cArtist.isEmpty() ? "" : run.cArtist + " - ") + run.cTitle;
            title = run.name; pct = (int) Math.round(ov);
            text = ("paused".equals(run.status) ? "Paused - " : "") + now + (run.total > 0 ? "  (" + run.item + "/" + run.total + ")" : "") + (queued > 0 ? "  +" + queued + " queued" : "");
        }
        String sig = title + "|" + text + "|" + (pct / 5);   // update only when something visible changed (not twice a second)
        if (sig.equals(lastNote)) return;
        lastNote = sig; DownloadService.update(getContext(), title, text, pct);
    }

    // ---------------- downloading ----------------
    File archive(String rel) { File f = new File(getContext().getFilesDir(), "archives/" + Integer.toHexString(rel.hashCode()) + ".txt"); f.getParentFile().mkdirs(); return f; }
    static List<String> lines(File f) {
        List<String> l = new ArrayList<>(); if (!f.exists()) return l;
        try (BufferedReader r = new BufferedReader(new FileReader(f))) { String s; while ((s = r.readLine()) != null) l.add(s); } catch (IOException ignored) {}
        return l;
    }
    /** Make yt-dlp's archive an EXACT mirror of the public files. A stale entry (file deleted, or archived but the
     *  MediaStore import failed) would make yt-dlp silently skip a track we still need. */
    void adopt(String url, String rel) throws IOException {
        Info i = cache.get(url); Map<String, Local> loc = local(rel); StringBuilder sb = new StringBuilder();
        for (String[] t : i.tracks) if (loc.containsKey(t[0])) sb.append(t[1]).append(' ').append(t[0]).append('\n');
        try (FileWriter w = new FileWriter(archive(rel), false)) { w.write(sb.toString()); }
    }
    void dropFromArchive(String rel, List<String> gone) throws IOException {
        File arc = archive(rel); StringBuilder sb = new StringBuilder();
        for (String l : lines(arc)) { String[] p = l.split(" "); if (!gone.contains(p[p.length - 1])) sb.append(l).append('\n'); }
        try (FileWriter w = new FileWriter(arc, false)) { w.write(sb.toString()); }
    }
    static String mime(String n, boolean video) {
        n = n.toLowerCase(Locale.ROOT);
        if (n.endsWith(".opus") || n.endsWith(".ogg")) return "audio/ogg"; if (n.endsWith(".mp3")) return "audio/mpeg"; if (n.endsWith(".m4a")) return "audio/mp4";
        if (n.endsWith(".flac")) return "audio/flac"; if (n.endsWith(".wav")) return "audio/x-wav"; if (n.endsWith(".mkv")) return "video/x-matroska";
        if (n.endsWith(".webm")) return video ? "video/webm" : "audio/webm"; return n.endsWith(".mp4") ? "video/mp4" : "audio/mpeg";
    }
    /** Moves a finished file from the private work folder to its final PUBLIC place: a MediaStore folder or the folder you picked. */
    boolean importFile(File f, String rel, boolean video) throws Exception {
        Matcher mt = ID.matcher(f.getName());
        if (mt.find() && local(rel).containsKey(mt.group(1))) { f.delete(); return true; }   // already public
        if (!f.exists()) return false;
        ContentResolver cr = getContext().getContentResolver();
        if (isSaf(rel)) {
            Uri dir = safDir(rel, true); if (dir == null) throw new IOException("Cannot create the playlist folder in the chosen location");
            Uri out = DocumentsContract.createDocument(cr, dir, "application/octet-stream", f.getName());   // octet-stream keeps the exact file name
            if (out == null) throw new IOException("The chosen folder refused " + f.getName());
            try (InputStream in = new FileInputStream(f); OutputStream o = cr.openOutputStream(out)) { byte[] b = new byte[256 * 1024]; int k; while ((k = in.read(b)) > 0) o.write(b, 0, k); }
            f.delete();
            try { MediaScannerConnection.scanFile(getContext(), new String[]{docPath(DocumentsContract.getDocumentId(out))}, null, null); } catch (Exception ignored) {}   // players index it right away
            return true;
        }
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, f.getName()); v.put(MediaStore.MediaColumns.MIME_TYPE, mime(f.getName(), video));
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, msRel(rel) + "/"); v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri u = cr.insert(col(video), v);
        if (u == null) throw new IOException("MediaStore refused " + rel);
        try (InputStream in = new FileInputStream(f); OutputStream o = cr.openOutputStream(u)) { byte[] b = new byte[256 * 1024]; int k; while ((k = in.read(b)) > 0) o.write(b, 0, k); }
        v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING, 0); cr.update(u, v, null, null); f.delete();
        return true;
    }
    static String q(String s) { return "\"" + s + "\""; }
    /** One option per line in a yt-dlp config file: lets us repeat options and pass several arguments safely. */
    File config(Run r, String fmt, File arc, int[] items, boolean alt) throws IOException {
        int lv = ppLevel;
        List<String> c = new ArrayList<>(Arrays.asList("--ignore-errors", "--no-colors", "--no-quiet", "--no-simulate", "--newline"));
        if (lv < 2) c.add("--embed-metadata");
        if (lv < 1) c.add("--embed-thumbnail");
        if (alt) { c.add("--js-runtimes quickjs"); c.add("--remote-components ejs:github"); }   // retry path for YouTube JS challenges
        if (r.video && lv < 1) { c.add("--write-subs"); c.add("--embed-subs"); c.add("--sub-langs \"en.*,-live_chat\""); }
        c.add("--print-to-file " + q("before_dl:%(id)s|%(artist,creator,uploader)s|%(track,title)s") + " " + q(r.meta.getAbsolutePath()));
        boolean pp = lyricsOn(r);
        // The "finished" signal. With the lyrics plugin, the PLUGIN reports the file after embedding the lyrics. Otherwise yt-dlp prints it at after_move.
        // (filepath does not exist at after_video: it printed NA, so nothing was ever saved.)
        if (!pp) c.add("--print-to-file " + q("after_move:%(id)s|%(filepath)s") + " " + q(r.done.getAbsolutePath()));
        if (ppLevel > 0 || !ffOk) c.add("--verbose");   // until ffmpeg has worked once, capture its real error text (yt-dlp only shows its last line)
        if (pp) {
            c.add("--plugin-dirs " + q(new File(getContext().getFilesDir(), "ytplugins").getAbsolutePath()));
            c.add("--use-postprocessor " + q("LmvLyrics:when=after_move;romaji=" + flag("lyrics_romaji", true) + ";translate=" + flag("lyrics_translate", false)
                + ";sidecar=" + (isSaf(r.rel) ? 1 : 0) + ";log=" + r.lyr.getAbsolutePath() + ";done=" + r.done.getAbsolutePath() + ";tags=" + (lv >= 2 ? 1 : 0) + ";libs=" + new File(getContext().getFilesDir(), "pylibs").getAbsolutePath()));
        }
        c.add("-o " + q(r.tmp.getAbsolutePath() + "/%(title)s [%(id)s].%(ext)s"));
        String[] f = lv >= 3 ? rawArgs(r.video) : FMT.get(fmt);
        for (int i = 0; i < f.length; i++) c.add(i + 1 < f.length && !f[i + 1].startsWith("-") ? f[i] + " " + q(f[++i]) : f[i]);
        if (items != null && items.length > 0) { StringBuilder sb = new StringBuilder(); for (int n : items) sb.append(sb.length() > 0 ? "," : "").append(n); c.add("--playlist-items " + sb); }
        File cf = new File(r.tmp, "yt.conf");
        try (FileWriter w = new FileWriter(cf, false)) { for (String s : c) w.write(s + "\n"); }
        return cf;
    }
    static String friendly(String msg) {
        String m = msg.toLowerCase(Locale.ROOT);
        if (m.contains("confirm you") && m.contains("bot")) return "YouTube bot check: it wants a signed-in session";
        if (m.contains("javascript") || m.contains("challenge")) return "YouTube needs its JavaScript runtime (retried; still failing)";
        if (m.contains("country") || m.contains("geo")) return "Geo-blocked in your region";
        if (m.contains("private")) return "Private video";
        if (m.contains("age") && (m.contains("restrict") || m.contains("confirm"))) return "Age-restricted (sign-in needed)";
        if (m.contains("copyright")) return "Removed for copyright";
        if (m.contains("unavailable") || m.contains("removed") || m.contains("deleted") || m.contains("terminated")) return "Unavailable or removed";
        String t = msg.trim(); return t.length() > 140 ? t.substring(0, 140) : t;
    }
    void errors(String msg, Run r) {
        Matcher m = ERR.matcher(msg);
        while (m.find()) {
            T t = r.tr.get(m.group(1)); if (t == null) { t = new T(); r.tr.put(m.group(1), t); }
            if (!"error".equals(t.status)) r.j.errors++;
            t.status = "error"; t.msg = friendly(m.group(2));
        }
    }
    /** Reads what yt-dlp wrote to its print-to-file logs: live artist/title, and finished files to publish. */
    void poll(Run r) { synchronized (r) { pollLocked(r); } }
    void pollLocked(Run r) {
        List<String> m = lines(r.meta);
        for (; r.mi < m.size(); r.mi++) {
            String[] p = m.get(r.mi).split("\\|", 3); if (p.length < 3) continue;
            T t = r.tr.get(p[0]);
            if (t == null || !"downloading".equals(t.status)) { r.started++; }
            if (t == null) { t = new T(); r.tr.put(p[0], t); }
            t.artist = "NA".equals(p[1]) ? "" : p[1].replaceAll("\\s*-\\s*Topic$", ""); t.title = "NA".equals(p[2]) ? "" : p[2]; t.status = "downloading";
            r.j.cArtist = t.artist; r.j.cTitle = t.title; r.j.pct = 0;
        }
        List<String> d = lines(r.done);
        for (; r.di < d.size(); r.di++) {
            String[] p = d.get(r.di).split("\\|", 2); if (p.length < 2) continue;
            if (!r.video && !finalAudio(p[1])) { log("yt-dlp left an unconverted file (" + new File(p[1]).getName() + "); keeping it aside."); continue; }
            File lrc = new File(p[1].replaceFirst("\\.[^./]+$", ".lrc"));
            try { boolean got = importFile(new File(p[1]), r.rel, r.video); T t = r.tr.get(p[0]);
                  if (got && t != null) { t.status = "done"; ffOk = true; } else if (!got) log("yt-dlp reported a finished file that does not exist: " + new File(p[1]).getName()); }
            catch (Exception e) { log("Could not save " + p[1] + ": " + e.getMessage()); }
            try { if (lrc.exists()) { if (isSaf(r.rel)) importSidecar(lrc, r.rel); else lrc.delete(); } } catch (Exception e) { log("Could not save the lyrics file: " + e.getMessage()); }
        }
        List<String> ly = lines(r.lyr);
        for (; r.li < ly.size(); r.li++) {
            String[] p = ly.get(r.li).split("\\|", 2); T t = r.tr.get(p[0]);
            log("Lyrics: " + (t != null && !t.title.isEmpty() ? t.title : p[0]) + " - " + (p.length > 1 ? p[1] : ""));
        }
    }
    static boolean needsJs(String s) {
        String m = s.toLowerCase(Locale.ROOT);
        return m.contains("javascript") || m.contains("challenge") || m.contains("only images") || m.contains("requested format is not available");
    }
    static String lastLine(String s) { String[] ls = s.trim().split("\n"); return ls[ls.length - 1]; }
    static String keyOf(Info i, String id) { for (String[] t : i.tracks) if (t[0].equals(id)) return t[1]; return ""; }

    /** Downloads TRACK BY TRACK. A bad track (geo-block, rate limit, crash) is recorded and SKIPPED; the loop always
     *  moves on, so one failure can never abandon the rest of the playlist. */
    void runTracks(String src, Info info, List<String> ids, String rel, String fmt, String key) throws Exception {
        if (!ready) throw new IOException(initError != null ? initError : "The engine is still starting. Try again in a moment.");
        Run r = new Run(); r.rel = rel; r.video = !AUDIO.contains(fmt); r.j = job(key); r.tr = tracks.get(key);
        r.tmp = new File(getContext().getFilesDir(), "dl/" + Integer.toHexString(rel.hashCode())); r.tmp.mkdirs();   // persistent, so .part files survive pause/resume
        r.meta = new File(r.tmp, "meta.txt"); r.done = new File(r.tmp, "done.txt"); r.lyr = new File(r.tmp, "lyrics.log"); r.meta.delete(); r.done.delete(); r.lyr.delete();
        File arc = archive(rel); r.j.stage = "Downloading"; r.j.pct = 0; r.j.total = ids.size(); r.j.item = 0;
        Map<String, Integer> pos = new HashMap<>(); for (int k = 0; k < info.tracks.size(); k++) pos.put(info.tracks.get(k)[0], k + 1);
        Set<String> retried = new HashSet<>();
        boolean[] halt = {false};
        Thread poller = new Thread(() -> { while (!halt[0]) { poll(r); notifyService(); try { Thread.sleep(1500); } catch (InterruptedException e) { return; } } });
        poller.start();
        try {
            for (int idx = 0; idx < ids.size(); idx++) {
                if (cancel.contains(key)) break;
                thermalGuard(r.j, key);
                String id = ids.get(idx); String[] m = info.meta.get(id);
                T t = new T(); if (m != null) { t.title = m[0]; t.artist = m[1]; } t.status = "downloading"; r.tr.put(id, t);
                r.j.item = idx + 1; r.j.pct = 0; r.j.cTitle = t.title; r.j.cArtist = t.artist;
                r.alt = retried.contains(id);
                String turl = info.urls.get(id); int[] items = null;
                if (turl == null) {
                    if ("youtube".equals(keyOf(info, id))) turl = "https://www.youtube.com/watch?v=" + id;
                    else { turl = src; items = new int[]{pos.get(id)}; }
                }
                String err = "";
                while (true) {   // pause/resume loop for THIS track: yt-dlp continues from its .part file
                    if (paused) {
                        r.j.status = "paused"; r.j.stage = "Paused - resume to continue"; r.j.speed = ""; r.j.eta = "";
                        gateWait(key); if (cancel.contains(key)) break;
                        r.j.status = "running"; r.j.stage = "Resuming";
                    }
                    YoutubeDLRequest req = new YoutubeDLRequest(turl);
                    req.addOption("--config-locations", config(r, fmt, arc, items, r.alt).getAbsolutePath());
                    procs.add(key);
                    try {
                        YoutubeDL.getInstance().execute(req, key, (p, etaSec, line) -> {
                            if (p >= 0) r.j.pct = p;
                            if (etaSec >= 0) r.j.eta = eta(etaSec);
                            Matcher sm = SPEED.matcher(line == null ? "" : line); if (sm.find()) r.j.speed = sm.group(1);
                            return kotlin.Unit.INSTANCE;   // Kotlin's Unit, not void
                        });
                    } catch (Throwable e) {   // never let one track's failure escape the loop (and never swallow it silently)
                        err = String.valueOf(e.getMessage()); errors(err, r);
                        if (!pausedKeys.contains(key) && !cancel.contains(key)) log("yt-dlp failed for " + (t.title.isEmpty() ? id : t.title) + ": " + lastLine(err));
                    } finally { procs.remove(key); }
                    if (cancel.contains(key) || !pausedKeys.remove(key)) break;
                }
                if (cancel.contains(key)) break;
                poll(r);   // publish whatever finished into Music/ or Movies/
                T cur = r.tr.get(id);
                if (!"done".equals(cur.status)) {   // yt-dlp may report an error for an optional step and still leave a finished file: publish it instead of losing the track
                    File got = salvage(r.tmp, id, false, r.video);
                    if (got != null) try {
                        if (importFile(got, r.rel, r.video)) {
                            if ("error".equals(cur.status) && r.j.errors > 0) r.j.errors--; cur.status = "done"; cur.msg = ""; ffOk = true;
                            log("Recovered " + (cur.title.isEmpty() ? id : cur.title) + ": yt-dlp reported an error for an optional step, but the file was complete.");
                        }
                    } catch (Exception e) { log("Could not save " + got.getName() + ": " + e.getMessage()); }
                }
                if (!"done".equals(cur.status) && ppLevel < 3 && !err.contains("LmvLyrics") && convFail(err + " " + cur.msg)) {   // ffmpeg step failed: step down and retry THIS track
                    ppLevel++; log("Conversion failed. yt-dlp said: " + tail(err, 500)); String why = ffLines(err); if (!why.isEmpty()) log("FFmpeg details: " + why);
                    log("Retrying with fewer ffmpeg steps: " + LEVELS[ppLevel]);
                    if ("error".equals(cur.status) && r.j.errors > 0) r.j.errors--; cleanLeftovers(r.tmp, id); idx--; continue;
                }
                if (!"done".equals(cur.status) && !r.noLyrics && err.contains("LmvLyrics")) {   // a lyrics plugin that fails to load must never block downloads
                    r.noLyrics = true; log("The lyrics plugin failed to load; downloading without lyrics. (" + lastLine(err) + ")");
                    if ("error".equals(cur.status) && r.j.errors > 0) r.j.errors--; cleanLeftovers(r.tmp, id); idx--; continue;
                }
                if (!"done".equals(cur.status) && !retried.contains(id) && needsJs(err + " " + cur.msg)) {   // one retry with the JS runtime enabled
                    retried.add(id); if ("error".equals(cur.status) && r.j.errors > 0) r.j.errors--;
                    log("Retrying with the JavaScript runtime enabled: " + (cur.title.isEmpty() ? id : cur.title)); cleanLeftovers(r.tmp, id); idx--; continue;
                }
                if (!"done".equals(cur.status)) {   // last resort: keep whatever yt-dlp left (e.g. an unconverted .webm) rather than nothing
                    File any = salvage(r.tmp, id, true, r.video);
                    if (any != null) try {
                        if (importFile(any, r.rel, r.video)) {
                            if ("error".equals(cur.status) && r.j.errors > 0) r.j.errors--; cur.status = "done"; cur.msg = ""; ffOk = true;
                            log("Kept the unconverted file for " + (cur.title.isEmpty() ? id : cur.title) + " (" + any.getName().replaceAll(".*\\.", ".") + ").");
                        }
                    } catch (Exception e) { log("Could not save " + any.getName() + ": " + e.getMessage()); }
                }
                if (!"done".equals(cur.status) && !"error".equals(cur.status)) {   // nothing saved and no ERROR line matched: still record it
                    cur.status = "error"; cur.msg = err.trim().isEmpty() ? "No file was produced" : friendly(lastLine(err)); r.j.errors++;
                }
                if ("error".equals(cur.status)) log("Skipped: " + (cur.title.isEmpty() ? id : cur.title) + " (" + cur.msg + ")");
                cleanLeftovers(r.tmp, id);   // thumbnails and other leftovers must not pile up
            }
        } finally { halt[0] = true; poller.interrupt(); poller.join(); poll(r); }
    }

    boolean download(String url, String base, String media, String fmt, boolean track) {
        return enqueue("quick", "Quick download", false, key -> {
            Job j = job(key);
            if (!cache.containsKey(url)) { j.stage = "Reading link"; JSONObject r = inspect(url); if (r.has("error")) throw new IOException(r.optString("error")); }
            Info i = cache.get(url); if (i == null) throw new IOException("Could not read that link");
            String rel = relFor(i, media, base);
            if (track) vaultAdd(url, base, media, fmt);
            adopt(url, rel);
            Map<String, Local> have = local(rel); List<String> ids = new ArrayList<>();
            for (String[] t : i.tracks) if (!have.containsKey(t[0])) ids.add(t[0]);
            if (ids.isEmpty()) j.stage = "Already downloaded"; else runTracks(url, i, ids, rel, fmt, key);
            if (cancel.contains(key)) return;
            db.exec("UPDATE playlists SET last_synced=? WHERE url=?", now(), url); log("Done.");
        });
    }
    void syncOne(JSONObject pl, String key, boolean auto) throws Exception {
        int pid = pl.getInt("id"); String url = pl.getString("url"), rel = pl.getString("path"), fmt = pl.getString("fmt");
        Job j = job(key); j.stage = "Checking online list";
        Info old = cache.remove(url); JSONObject r = null;
        for (int attempt = 0; attempt < 3; attempt++) {   // a flaky connection must not skip the whole playlist
            r = inspect(url);
            if (!r.has("error") && cache.get(url) != null && !cache.get(url).tracks.isEmpty()) break;
            if (cancel.contains(key)) return;
            Thread.sleep(2000L * (attempt + 1));
        }
        Info i = cache.get(url);
        if (i == null || i.tracks.isEmpty()) {
            if (old != null && !old.tracks.isEmpty()) { i = old; cache.put(url, old); log("Could not refresh " + pl.getString("name") + "; using the last known track list."); }
            else {
                String why = r != null && r.has("error") ? r.optString("error") : "the playlist is empty";
                j.stage = "Skipped: " + (why.length() > 60 ? why.substring(0, 60) : why); if (!auto) log("Skipped " + pl.getString("name") + ": " + why); return;
            }
        }
        if (cancel.contains(key)) return;
        Map<String, Local> loc = local(rel); Set<String> skips = db.skips(pid); Map<String, String> fl = failedOf(pid);
        Set<String> online = new HashSet<>(); List<String> want = new ArrayList<>();
        for (String[] t : i.tracks) { online.add(t[0]); if (!loc.containsKey(t[0]) && !skips.contains(t[0]) && !(auto && fl.containsKey(t[0]))) want.add(t[0]); }
        List<String> gone = new ArrayList<>(); if (!auto) for (String id : loc.keySet()) if (!online.contains(id)) gone.add(id);   // auto-sync never deletes
        if (auto && want.isEmpty()) { synchronized (lock) { jobs.remove(key); } return; }                                      // nothing new: stay silent
        log("== " + (auto ? "Auto-sync " : "Syncing ") + pl.getString("name") + " ==");
        j.stage = "Comparing with local files"; adopt(url, rel);
        for (String id : gone) {
            j.stage = "Pruning removed tracks";
            try { deleteLocal(loc.get(id)); log("Prune: " + loc.get(id).name); }
            catch (Exception e) { log("Cannot delete " + loc.get(id).name + " (" + e.getMessage() + ")"); }
        }
        if (cancel.contains(key)) return;
        if (!want.isEmpty()) runTracks(url, i, want, rel, fmt, key); else j.stage = "Already up to date";
        if (cancel.contains(key)) return;
        Map<String, String> errs = new HashMap<>(); Map<String, T> tr = tracks.get(key);
        if (tr != null) for (Map.Entry<String, T> e : tr.entrySet()) if ("error".equals(e.getValue().status)) errs.put(e.getKey(), e.getValue().msg);
        if (!auto) fl.clear(); fl.putAll(errs);
        db.exec("UPDATE playlists SET last_synced=? WHERE id=?", now(), pid);
        int added = 0; for (String id : local(rel).keySet()) if (!loc.containsKey(id)) added++;
        if (added > 0) { db.exec("UPDATE playlists SET last_added=? WHERE id=?", now(), pid); bump(pid, added); }   // floats the playlist to the top
    }
    boolean sync(int pid, boolean auto) throws JSONException {
        JSONObject pl = db.one(pid); if (pl == null) return false;
        return enqueue("pl" + pid, pl.optString("name"), auto, key -> syncOne(pl, key, auto));
    }
    void startAuto() {
        new Thread(() -> {
            long last = System.currentTimeMillis();
            while (true) {
                try { Thread.sleep(15000); } catch (InterruptedException e) { return; }
                int mins = 0; try { mins = Integer.parseInt(String.valueOf(db.get("auto_sync"))); } catch (Exception ignored) {}
                if (mins > 0 && ready && !paused && System.currentTimeMillis() - last >= mins * 60000L) {
                    last = System.currentTimeMillis();
                    try { JSONArray a = db.all(); for (int k = 0; k < a.length(); k++) sync(a.getJSONObject(k).getInt("id"), true); } catch (Exception ignored) {}
                }
            }
        }).start();
    }
}
