"""Build pipeline: vite (run by `npm run build`) -> PyArmor obfuscation -> PyInstaller -> smoke test.

WHY THIS FILE IS SHAPED THE WAY IT IS
PyArmor encrypts every module, so PyInstaller's import scanner can no longer see what they import.
That is what caused the endless "ModuleNotFoundError" (backend, mimetypes, webview ...).
So we never rely on scanning the obfuscated code. Instead we compute the complete module list from the
ORIGINAL source (AST scan, including lazy imports inside functions), add every submodule of our own
`backend` package from disk, collect the third-party packages wholesale, then prove it worked by
running the finished app with --selftest.

Usage:  python build.py [--dry-run] [--no-obfuscate] [--no-selftest]
"""
import ast, importlib, importlib.util, json, os, pkgutil, re, shutil, subprocess, sys
from pathlib import Path

R, B, SEP, NAME = Path(__file__).parent.resolve(), Path(__file__).parent.resolve() / "build_tmp", os.pathsep, "LocalMusicAndVideo"
DRY, NOOBF, NOTEST = "--dry-run" in sys.argv, "--no-obfuscate" in sys.argv, "--no-selftest" in sys.argv
ONEFILE = "--onefile" in sys.argv          # Windows: one single .exe (mac/Linux stay as .app / folder)
# Third-party packages bundled wholesale (code + data files + native libs), per platform.
THIRD_PARTY = ["webview", "mutagen", "certifi", "imageio_ffmpeg", "pykakasi", "pypinyin", "jaconv", "proxy_tools", "bottle", "typing_extensions"]   # imageio_ffmpeg ships the ffmpeg binary
if sys.platform == "darwin": THIRD_PARTY += ["objc", "Foundation", "AppKit", "WebKit", "Quartz", "CoreFoundation", "PyObjCTools"]
if sys.platform == "win32": THIRD_PARTY += ["clr_loader", "pythonnet", "clr"]
if sys.platform.startswith("linux"): THIRD_PARTY += ["qtpy", "PyQt6", "PyQt5"]   # pywebview[qt] backend
# Stdlib modules we rely on; listed explicitly as a belt-and-braces guard on top of the AST scan.
STDLIB = ["mimetypes", "http.server", "http.client", "socketserver", "ssl", "sqlite3", "urllib.request", "urllib.parse",
          "urllib.error", "json", "base64", "collections", "struct", "socket", "uuid", "platform", "threading", "subprocess", "shutil"]

def run(*a, cwd=None, env=None):
    a = [str(x) for x in a]
    print("$", " ".join(a[:12]) + (f" ... (+{len(a) - 12} args)" if len(a) > 12 else ""))
    if not DRY: subprocess.check_call(a, cwd=cwd, env=env)

def have(mod):
    try: return importlib.util.find_spec(mod) is not None
    except (ImportError, ValueError, AttributeError): return False

def local_modules():
    """`backend` and every module under it, read from disk (no importing, no PyArmor involved)."""
    return ["backend"] + [m.name for m in pkgutil.walk_packages([str(R / "backend")], "backend.")]

def scanned_imports():
    """Every module imported anywhere in our source, including imports inside functions."""
    found, local = set(), set(local_modules())
    for f in [R / "main.py", *sorted((R / "backend").rglob("*.py"))]:
        pkg = "backend" if f.parent.name == "backend" else ""
        for n in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            if isinstance(n, ast.Import): found.update(a.name for a in n.names)
            elif isinstance(n, ast.ImportFrom):
                base = n.module or ""
                if n.level: base = ".".join(x for x in (pkg, base) if x)        # `from . import db` -> backend.db
                if base: found.add(base)
                for a in n.names:                                               # `from x import submodule`
                    cand = f"{base}.{a.name}" if base else a.name
                    if cand in local or have(cand): found.add(cand)
    return sorted(m for m in found if m in local or have(m))

def submodules(pkg):
    if not have(pkg): return []
    try:
        from PyInstaller.utils.hooks import collect_submodules
        return list(collect_submodules(pkg))
    except Exception:
        m = importlib.import_module(pkg)
        return [pkg] + [x.name for x in pkgutil.walk_packages(getattr(m, "__path__", []), pkg + ".")]

def check_warnings(required):
    """PyInstaller lists modules it could not find; fail if any of OURS or a required one is among them."""
    warn = B / "work" / NAME / f"warn-{NAME}.txt"
    if not warn.exists(): return
    bad = [l for l in warn.read_text(errors="ignore").splitlines()
           if (m := re.match(r"missing module named ([\w.]+)", l)) and m.group(1) in required]
    if bad: sys.exit("Build FAILED - PyInstaller could not find:\n  " + "\n  ".join(bad))

def fetch_ytdlp():
    """Download the official standalone yt-dlp binary for THIS platform so the app needs no install."""
    asset = {"darwin": "yt-dlp_macos", "win32": "yt-dlp.exe"}.get(sys.platform, "yt-dlp_linux")
    dest = B / "bin" / ("yt-dlp.exe" if sys.platform == "win32" else "yt-dlp")
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset}"
    print("Bundling", url)
    if not DRY:
        import ssl, urllib.request
        try:
            import certifi; ctx = ssl.create_default_context(cafile=certifi.where())
        except Exception: ctx = None
        dest.write_bytes(urllib.request.urlopen(url, context=ctx, timeout=180).read()); dest.chmod(0o755)
    return dest

def app_binary():
    if ONEFILE and sys.platform == "win32": return R / "dist" / f"{NAME}.exe"
    if sys.platform == "darwin": return R / "dist" / f"{NAME}.app" / "Contents" / "MacOS" / NAME
    return R / "dist" / NAME / (NAME + (".exe" if sys.platform == "win32" else ""))

def main():
    if not DRY: assert (R / "web_dist" / "index.html").exists(), "Run `npm run build` (it runs vite first), not build.py directly."
    local, scanned = local_modules(), scanned_imports()
    hidden = sorted(set(local) | set(scanned) | set(STDLIB) | {m for p in THIRD_PARTY for m in submodules(p)})
    hidden = [h for h in hidden if h in local or have(h) or "." not in h]
    required = set(local) | {"webview", "mimetypes", "mutagen", "certifi"}
    print(f"{len(local)} local modules, {len(scanned)} scanned imports, {len(hidden)} hidden imports in total")

    shutil.rmtree(B, ignore_errors=True); B.mkdir(parents=True, exist_ok=True)
    # the smoke test reads this list from inside the built app (our modules + everything our code imports)
    (B / "selftest_modules.json").write_text(json.dumps(sorted(set(local) | set(scanned) | set(STDLIB) | {"mutagen", "certifi"})))

    env, paths = dict(os.environ), [R]
    if NOOBF:
        entry = R / "main.py"
    else:
        obf = B / "obf"
        run(sys.executable, "-m", "pyarmor.cli", "gen", "-O", obf, "-r", R / "main.py", R / "backend", cwd=R)
        entry, paths = obf / "main.py", [obf]
        env["PYTHONPATH"] = str(obf)                      # PyInstaller's helper processes must also see ONLY the obfuscated code
        runtimes = [p.name for p in obf.glob("pyarmor_runtime_*")] or ["pyarmor_runtime_000000"]
        hidden += runtimes

    ytdlp = fetch_ytdlp()
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--name", NAME, "--windowed",
           "--distpath", R / "dist", "--workpath", B / "work", "--specpath", B,
           "--add-data", f"{R / 'web_dist'}{SEP}web_dist", "--add-data", f"{R / 'scripts'}{SEP}scripts",
           "--add-data", f"{B / 'selftest_modules.json'}{SEP}.",
           "--add-binary", f"{ytdlp}{SEP}bin"]        # resolved at runtime by Engine._ytdlp()
    if ONEFILE and sys.platform == "win32": cmd.append("--onefile")
    for p in paths: cmd += ["--paths", p]
    for h in hidden: cmd += ["--hidden-import", h]
    for p in THIRD_PARTY:
        if have(p): cmd += ["--collect-all", p]
    if not NOOBF:
        for rt in runtimes: cmd += ["--collect-all", rt]
    if sys.platform == "darwin": cmd += ["--osx-bundle-identifier", "com.localmusic.video"]
    cmd.append(entry)
    # cwd=B keeps the UNobfuscated project folder off PyInstaller's search path, so the source can't leak in by accident
    run(*cmd, cwd=B, env=env)
    if DRY: return print("\n--dry-run: nothing was built.")

    check_warnings(required)
    (R / "dist" / "downloads").mkdir(exist_ok=True)       # user-facing folder stays outside the bundle
    print("Built:", R / "dist")
    if not NOTEST:
        print("Smoke test: launching the built app with --selftest ...")
        r = subprocess.run([str(app_binary()), "--selftest"], capture_output=True, text=True, timeout=180)
        print(r.stdout + r.stderr)
        if r.returncode: sys.exit("Build FAILED the self-test: a module is missing from the bundle (see list above).")
        print("Self-test passed: every required module imports inside the bundle.")

if __name__ == "__main__": main()
