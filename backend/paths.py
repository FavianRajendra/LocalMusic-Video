import sys, os
from pathlib import Path

def base_dir() -> Path:
    """Folder for user-facing data (data.db, downloads/) - outside the bundle.
    Falls back to ~/LocalMusicAndVideo if the app sits somewhere read-only (e.g. /Applications)."""
    if not getattr(sys, "frozen", False):
        return Path(__file__).resolve().parent.parent
    exe = Path(sys.executable).resolve()
    d = exe.parents[3] if sys.platform == "darwin" and ".app/" in str(exe) else exe.parent
    if os.access(d, os.W_OK): return d
    d = Path.home() / "LocalMusicAndVideo"; d.mkdir(exist_ok=True); return d

def resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", base_dir()))
    return Path(__file__).resolve().parent.parent

def scripts_dir() -> Path:
    return resource_dir() / "scripts"

def fix_path():
    """GUI apps on macOS don't inherit Homebrew's PATH."""
    extra = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"]
    os.environ["PATH"] = os.pathsep.join(extra + [os.environ.get("PATH", "")])
