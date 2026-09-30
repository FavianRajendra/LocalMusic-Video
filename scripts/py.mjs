// Runs Python from a local .venv (created + populated on first use). Cross-platform.
import { existsSync } from "fs";
import { spawnSync } from "child_process";
const win = process.platform === "win32";
const py = win ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
if (!existsSync(py)) {
  spawnSync(win ? "python" : "python3", ["-m", "venv", ".venv"], { stdio: "inherit" });
  spawnSync(py, ["-m", "pip", "install", "-r", "requirements.txt"], { stdio: "inherit" });
}
process.exit(spawnSync(py, process.argv.slice(2), { stdio: "inherit" }).status ?? 1);
