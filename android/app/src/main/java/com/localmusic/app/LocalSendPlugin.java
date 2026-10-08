package com.localmusic.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import fi.iki.elonen.NanoHTTPD;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.*;
import org.json.*;

/** Native LocalSend v2 receiver + discovery. Receives into MediaStore (Music/ or Movies/), visible to Poweramp. */
@CapacitorPlugin(name = "LocalSend")
public class LocalSendPlugin extends Plugin {
    static final int PORT = 53317;
    static final String MCAST = "224.0.0.167";
    static final Pattern ID = Pattern.compile("\\[([A-Za-z0-9_-]{6,})\\]\\.\\w+$");

    final String fp = UUID.randomUUID().toString().replace("-", "");
    final Map<String, JSONObject> peers = new ConcurrentHashMap<>();
    final Map<String, Map<String, String[]>> sessions = new ConcurrentHashMap<>();   // sid -> fileId -> [name, dir, token, mime]
    final Map<String, Integer> recv = new ConcurrentHashMap<>();
    volatile boolean on = false, allow = false;
    MulticastSocket sock; WifiManager.MulticastLock mlock; Srv srv;
    final String alias = "Android " + Build.MODEL;

    JSONObject me(boolean announce) throws JSONException {
        return new JSONObject().put("alias", alias).put("version", "2.0").put("deviceModel", "LocalMusicAndVideo")
            .put("deviceType", "mobile").put("fingerprint", fp).put("port", PORT).put("protocol", "http")
            .put("download", false).put("announce", announce).put("lmv", "2.0").put("os", "Android");
    }

    JSONObject addPeer(String ip, JSONObject m) {
        try {
            String f = m.optString("fingerprint", "");
            if (f.isEmpty() || f.equals(fp)) return null;
            m.put("fp", f).put("ip", ip);
            boolean lmv = m.has("lmv"); String os = m.optString("os", "");
            m.put("lmv", lmv).put("kind", lmv ? ("Android".equals(os) ? "Android APK" : (os.isEmpty() ? "Desktop" : os)) : "LocalSend");
            peers.put(f, m); return m;
        } catch (JSONException e) { return null; }
    }

    @PluginMethod public void net_start(PluginCall c) {
        if (on) { c.resolve(new JSObject().put("ok", true)); return; }
        try {
            WifiManager w = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            mlock = w.createMulticastLock("lmv"); mlock.setReferenceCounted(false); mlock.acquire();
            srv = new Srv(); srv.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            sock = new MulticastSocket(null); sock.setReuseAddress(true); sock.bind(new InetSocketAddress(PORT));
            sock.joinGroup(InetAddress.getByName(MCAST));
            on = true;
            new Thread(this::listen).start(); new Thread(this::announceLoop).start();
            c.resolve(new JSObject().put("ok", true));
        } catch (Exception e) { quiet(); c.resolve(new JSObject().put("error", "Could not start: " + e.getMessage())); }
    }

    void quiet() {
        on = false;
        try { if (sock != null) sock.close(); } catch (Exception ignored) {}
        try { if (srv != null) srv.stop(); } catch (Exception ignored) {}
        try { if (mlock != null && mlock.isHeld()) mlock.release(); } catch (Exception ignored) {}
        peers.clear();
    }

    @PluginMethod public void net_stop(PluginCall c) { quiet(); c.resolve(); }
    @PluginMethod public void net_share(PluginCall c) { allow = Boolean.TRUE.equals(c.getBoolean("value", false)); c.resolve(); }
    @PluginMethod public void net_scan(PluginCall c) { peers.clear(); announce(); c.resolve(); }
    @PluginMethod public void net_state(PluginCall c) {
        JSArray p = new JSArray(); for (JSONObject o : peers.values()) p.put(o);
        JSArray r = new JSArray(); for (Map.Entry<String, Integer> e : recv.entrySet()) r.put(new JSObject().put("name", e.getKey()).put("pct", e.getValue()));
        c.resolve(new JSObject().put("enabled", on).put("share", allow).put("alias", alias).put("peers", p).put("recv", r));
    }

    void announce() {
        try {
            byte[] b = me(true).toString().getBytes("UTF-8");
            sock.send(new DatagramPacket(b, b.length, InetAddress.getByName(MCAST), PORT));
        } catch (Exception ignored) {}
    }
    void announceLoop() { int n = 0; while (on) { announce(); try { Thread.sleep(n++ < 3 ? 1500 : 6000); } catch (Exception e) { return; } } }
    void listen() {
        byte[] buf = new byte[4096];
        while (on) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length); sock.receive(p);
                JSONObject m = new JSONObject(new String(p.getData(), 0, p.getLength(), "UTF-8"));
                boolean ann = m.optBoolean("announce"); JSONObject peer = addPeer(p.getAddress().getHostAddress(), m);
                if (peer != null && ann) new Thread(() -> registerBack(peer)).start();
            } catch (Exception ignored) {}
        }
    }
    void registerBack(JSONObject peer) {
        try {   // http peers only: we cannot verify self-signed https certificates here
            if (!"http".equals(peer.optString("protocol"))) return;
            HttpURLConnection h = (HttpURLConnection) new URL("http://" + peer.getString("ip") + ":" + peer.optInt("port", PORT) + "/api/localsend/v2/register").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(3000); h.setRequestProperty("Content-Type", "application/json");
            h.getOutputStream().write(me(false).toString().getBytes("UTF-8")); h.getResponseCode(); h.disconnect();
        } catch (Exception ignored) {}
    }

    static String clean(String rel) { return rel.replace("\\", "/").replaceAll("(^|/)\\.\\.(?=/|$)", "").replaceAll("^/+", "").replaceAll("/+$", ""); }
    static String mime(String name, String hint) {
        String n = name.toLowerCase(); if (n.endsWith(".opus")) return "audio/ogg";
        String ext = MimeTypeMap.getFileExtensionFromUrl(name.replace(" ", "_"));
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null ? m : (hint != null && hint.contains("/") ? hint : "audio/mpeg");
    }

    JSONObject manifest() throws JSONException {
        JSONArray ids = new JSONArray(); ContentResolver cr = getContext().getContentResolver();
        Uri[] cols = { MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) };
        for (Uri u : cols) try (Cursor q = cr.query(u, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
            while (q != null && q.moveToNext()) { Matcher m = ID.matcher(q.getString(0)); if (m.find()) ids.put(m.group(1)); }
        }
        return new JSONObject().put("playlists", new JSONArray()).put("ids", ids);
    }

    class Srv extends NanoHTTPD {
        Srv() { super(PORT); }
        NanoHTTPD.Response json(JSONObject o) { return newFixedLengthResponse(Response.Status.OK, "application/json", o.toString()); }
        NanoHTTPD.Response err(Response.IStatus st, String msg) { return newFixedLengthResponse(st, "application/json", "{\"message\":\"" + msg.replace("\"", "'") + "\"}"); }
        String body(IHTTPSession s) throws IOException {
            int n = Integer.parseInt(s.getHeaders().getOrDefault("content-length", "0")); byte[] b = new byte[n]; int r = 0;
            while (r < n) { int k = s.getInputStream().read(b, r, n - r); if (k < 0) break; r += k; }
            return new String(b, 0, r, "UTF-8");
        }
        @Override public Response serve(IHTTPSession s) {
            try {
                String u = s.getUri(); Map<String, String> q = s.getParms(); String ip = s.getHeaders().get("remote-addr");
                if (u.endsWith("/info")) return json(me(false));
                if (u.endsWith("/register")) { addPeer(ip, new JSONObject(body(s))); return json(me(false)); }
                if (!allow) return err(Response.Status.FORBIDDEN, "Incoming access is switched off");
                if (u.endsWith("/prepare-upload")) return prepare(new JSONObject(body(s)));
                if (u.endsWith("/upload")) return upload(s, q);
                if (u.endsWith("/cancel")) { sessions.remove(q.get("sessionId")); return json(new JSONObject()); }
                if (u.equals("/api/lmv/v1/manifest")) return json(manifest());
                return err(Response.Status.NOT_FOUND, "Not found");
            } catch (Exception e) { return err(Response.Status.INTERNAL_ERROR, String.valueOf(e)); }
        }
        Response prepare(JSONObject b) throws Exception {
            JSONObject files = b.getJSONObject("files"), out = new JSONObject(); Map<String, String[]> m = new HashMap<>();
            for (Iterator<String> it = files.keys(); it.hasNext();) {
                String id = it.next(); JSONObject f = files.getJSONObject(id); String tok = UUID.randomUUID().toString().replace("-", "");
                String fn = f.getString("fileName").replace("\\", "/"), dest = f.optString("destination", "");
                int i = fn.lastIndexOf('/'); String name = i >= 0 ? fn.substring(i + 1) : fn;
                m.put(id, new String[]{ name, dest.isEmpty() ? (i >= 0 ? fn.substring(0, i) : "") : dest, tok, f.optString("fileType", "") });
                out.put(id, tok);
            }
            String sid = UUID.randomUUID().toString().replace("-", ""); sessions.put(sid, m);
            return json(new JSONObject().put("sessionId", sid).put("files", out));
        }
        Response upload(IHTTPSession s, Map<String, String> q) throws Exception {
            Map<String, String[]> m = sessions.get(q.get("sessionId")); String[] f = m == null ? null : m.get(q.get("fileId"));
            if (f == null || !f[2].equals(q.get("token"))) return err(Response.Status.FORBIDDEN, "Invalid token");
            long total = Long.parseLong(s.getHeaders().getOrDefault("content-length", "0")), left = total;
            String mt = mime(f[0], f[3]); boolean video = mt.startsWith("video/");
            String rel = (video ? "Movies" : "Music") + (clean(f[1]).isEmpty() ? "" : "/" + clean(f[1]));
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, f[0]); v.put(MediaStore.MediaColumns.MIME_TYPE, mt);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel); v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            ContentResolver cr = getContext().getContentResolver();
            Uri col = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) : MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri uri = cr.insert(col, v); if (uri == null) return err(Response.Status.INTERNAL_ERROR, "MediaStore refused " + rel);
            try (OutputStream o = cr.openOutputStream(uri)) {
                byte[] buf = new byte[256 * 1024];
                while (left > 0) { int k = s.getInputStream().read(buf, 0, (int) Math.min(buf.length, left)); if (k < 0) break; o.write(buf, 0, k); left -= k; recv.put(f[0], (int) ((total - left) * 100 / Math.max(total, 1))); }
            }
            if (left > 0) { cr.delete(uri, null, null); recv.remove(f[0]); return err(Response.Status.BAD_REQUEST, "Truncated upload"); }
            v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING, 0); cr.update(uri, v, null, null);
            if (recv.size() > 20) recv.clear();
            return json(new JSONObject());
        }
    }
}
