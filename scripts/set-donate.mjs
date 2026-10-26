// Usage: npm run set-donate -- <buymeacoffee-name> [--repo <github-user>/<repo>]
// Rewrites your Buy Me a Coffee name (and optionally your GitHub repo) in every place it appears. Safe to run again.
import { existsSync, readFileSync, writeFileSync } from "fs";
const args = process.argv.slice(2);
const name = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--repo");
const repo = args[args.indexOf("--repo") + 1];
if (!name && !repo) { console.error("Usage: npm run set-donate -- <buymeacoffee-name> [--repo <github-user>/<repo>]"); process.exit(1); }
const edit = (file, fn) => { if (!existsSync(file)) return; const s = readFileSync(file, "utf8"), n = fn(s); if (n !== s) { writeFileSync(file, n); console.log("updated", file); } };
if (name) {
  edit("src/config.js", (s) => s.replace(/(BMC_USERNAME\s*=\s*)"[^"]*"/, `$1"${name}"`));
  edit("README.md", (s) => s.replace(/https:\/\/www\.buymeacoffee\.com\/[A-Za-z0-9_.-]+/g, `https://www.buymeacoffee.com/${name}`));
  writeFileSync(".github/FUNDING.yml", `buy_me_a_coffee: ${name}\n`); console.log("updated .github/FUNDING.yml");
}
if (repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { console.error('--repo must look like "user/repo"'); process.exit(1); }
  // Replace exactly the repo that config.js currently points to (never other github.com links such as the credits), so this can be re-run any time.
  const cur = (/REPO_URL\s*=\s*"https:\/\/github\.com\/([^"]+)"/.exec(readFileSync("src/config.js", "utf8")) || [])[1];
  if (!cur) { console.error("Could not find REPO_URL in src/config.js"); process.exit(1); }
  const swap = (s) => s.split("github.com/" + cur).join("github.com/" + repo);
  edit("src/config.js", swap); edit("README.md", swap); edit("package.json", swap);
}
console.log("Done. Rebuild the app to see it.");
