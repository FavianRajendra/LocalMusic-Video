"""Step 1 (vite build, run by `npm run build`) minified the UI into web_dist/.
Step 2 obfuscates Python with PyArmor. Step 3 packages with PyInstaller (.app / .exe)."""
import os, shutil, subprocess, sys
from pathlib import Path
R = Path(__file__).parent.resolve(); B = R / "build_tmp"; sep = os.pathsep
def run(*a): print("$", " ".join(map(str, a))); subprocess.check_call(list(map(str, a)))
assert (R / "web_dist" / "index.html").exists(), "Run `npm run build`, not build.py directly."
shutil.rmtree(B, ignore_errors=True); obf = B / "obf"
run(sys.executable, "-m", "pyarmor.cli", "gen", "-O", obf, "-r", R / "main.py", R / "backend")

# Added --hidden-import mimetypes to the PyInstaller arguments
# Added --hidden-import webview to the PyInstaller arguments
args = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--name", "LocalMusicAndVideo",
        "--windowed", "--paths", obf, "--distpath", R / "dist", "--workpath", B / "work", "--specpath", B,
        "--hidden-import", "mimetypes", "--hidden-import", "webview",
        "--add-data", f"{R/'web_dist'}{sep}web_dist", "--add-data", f"{R/'scripts'}{sep}scripts"]

for rt in obf.glob("pyarmor_runtime_*"): args += ["--add-data", f"{rt}{sep}{rt.name}"]
run(*args, obf / "main.py")
(R / "dist" / "downloads").mkdir(exist_ok=True)   # user-facing folder stays outside the bundle
print("Built into dist/. data.db is created next to the app on first launch.")