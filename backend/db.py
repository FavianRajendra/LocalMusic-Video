import sqlite3, time
from .paths import base_dir
DB = base_dir() / "data.db"

def conn():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row; return c

def init():
    with conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS playlists(id INTEGER PRIMARY KEY, name TEXT, url TEXT UNIQUE,
            path TEXT, last_synced TEXT, media TEXT, fmt TEXT, cover TEXT, custom_cover INTEGER DEFAULT 0)""")
        for col in ("cover TEXT", "custom_cover INTEGER DEFAULT 0"):
            try: c.execute(f"ALTER TABLE playlists ADD COLUMN {col}")
            except sqlite3.OperationalError: pass
        c.execute("CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)")

def get_setting(k, d=None):
    with conn() as c: r = c.execute("SELECT v FROM settings WHERE k=?", (k,)).fetchone()
    return r["v"] if r else d

def set_setting(k, v):
    with conn() as c: c.execute("INSERT OR REPLACE INTO settings VALUES(?,?)", (k, v))

def list_playlists():
    with conn() as c: return [dict(r) for r in c.execute("SELECT * FROM playlists ORDER BY name")]

def get_playlist(pid):
    with conn() as c: r = c.execute("SELECT * FROM playlists WHERE id=?", (pid,)).fetchone()
    return dict(r) if r else None

def upsert_playlist(name, url, path, media, fmt, cover):
    with conn() as c:
        c.execute("""INSERT INTO playlists(name,url,path,media,fmt,cover) VALUES(?,?,?,?,?,?)
            ON CONFLICT(url) DO UPDATE SET name=?,path=?,media=?,fmt=?,
            cover=CASE WHEN custom_cover=1 THEN cover ELSE ? END""",
            (name, url, path, media, fmt, cover, name, path, media, fmt, cover))
        return c.execute("SELECT id FROM playlists WHERE url=?", (url,)).fetchone()["id"]

def set_cover(pid, data_uri):
    with conn() as c: c.execute("UPDATE playlists SET cover=?, custom_cover=1 WHERE id=?", (data_uri, pid))

def set_auto_cover(pid, data_uri):
    with conn() as c: c.execute("UPDATE playlists SET cover=? WHERE id=? AND custom_cover=0", (data_uri, pid))

def remove_playlist(pid):
    with conn() as c: c.execute("DELETE FROM playlists WHERE id=?", (pid,))

def touch(pid):
    with conn() as c: c.execute("UPDATE playlists SET last_synced=? WHERE id=?", (time.strftime("%Y-%m-%d %H:%M"), pid))
