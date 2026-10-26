// Generates the Android project (once) and injects the native LocalMusic and Video plugins. Safe to re-run.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
const win = process.platform === "win32";
const run = (...a) => { const r = spawnSync(a[0], a.slice(1), { stdio: "inherit", shell: win }); if (r.status) process.exit(r.status); };
if (!existsSync("web_dist")) run("npx", "vite", "build");
if (!existsSync("android")) run("npx", "cap", "add", "android");

// Put the Java files in the package the Android project REALLY uses (its namespace), not a guessed one.
const gradleText = existsSync("android/app/build.gradle") ? readFileSync("android/app/build.gradle", "utf8") : "";
const pkg = (gradleText.match(/namespace\s*=?\s*["']([\w.]+)["']/) || gradleText.match(/applicationId\s*=?\s*["']([\w.]+)["']/) || [])[1] || "com.localmusic.video";
const javaRoot = "android/app/src/main/java", dir = `${javaRoot}/${pkg.replace(/\./g, "/")}`; mkdirSync(dir, { recursive: true });
// Write our files first (so the target folder can never be pruned as 'empty'), then clean up.
for (const f of ["LmvEnginePlugin.java", "LocalSendPlugin.java", "DownloadService.java", "MainActivity.java"])
  writeFileSync(`${dir}/${f}`, readFileSync("mobile/" + f, "utf8").replace(/^package\s+[\w.]+;/m, `package ${pkg};`));
// Remove stale copies of OUR files left in any other package folder (e.g. an older run used a different package).
// A leftover DownloadService.java without its MainActivity is exactly what broke the build before.
const OURS = ["LmvEnginePlugin.java", "LocalSendPlugin.java", "DownloadService.java", "MainActivity.java"];
const norm = (p) => p.replace(/\\/g, "/");
(function sweep(d) {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) sweep(p);
    else if (OURS.includes(f) && !norm(p).startsWith(dir + "/")) { unlinkSync(p); console.log("Removed stale copy:", norm(p)); }
  }
})(javaRoot);
(function prune(d) {   // drop folders the sweep emptied
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) prune(p); }
  if (d !== javaRoot && readdirSync(d).length === 0) rmdirSync(d);
})(javaRoot);
// Lyrics: the shared Python module + the yt-dlp plugin wrapper become ONE asset the app installs into yt-dlp's plugin folder.
const assets = "android/app/src/main/assets"; mkdirSync(assets, { recursive: true });
writeFileSync(`${assets}/lmv_lyrics.py`, readFileSync("backend/lyrics.py", "utf8") + "\n\n" + readFileSync("mobile/lmv_pp.py", "utf8"));
// Best effort: vendor the kanji (pykakasi) and hanzi (pypinyin) romanizers so they work on the phone too. Needs internet once.
const libs = `${assets}/pylibs`;
if (!existsSync(`${libs}/stamp.txt`) && !process.env.LMV_SKIP_VENDOR) {
  const py = [".venv/bin/python", ".venv/Scripts/python.exe"].find((p) => existsSync(p)) || (win ? "python" : "python3");
  const r = spawnSync(py, ["-m", "pip", "install", "--quiet", "--no-compile", "--upgrade", "--target", libs, "pykakasi", "pypinyin"], { stdio: "inherit", timeout: 300000 });
  if (r.status === 0 && existsSync(libs)) writeFileSync(`${libs}/stamp.txt`, String(Date.now()));
  else console.warn("Could not vendor pykakasi/pypinyin (offline?). Kanji/hanzi romanization will be off on Android; kana, Hangul and translation still work.");
}
const main = readFileSync(`${dir}/MainActivity.java`, "utf8");
for (const plug of ["LmvEnginePlugin", "LocalSendPlugin"]) if (!main.includes(`registerPlugin(${plug}.class)`)) { console.error(`FATAL: MainActivity does not register ${plug}`); process.exit(1); }
console.log(`MainActivity registers LmvEnginePlugin + LocalSendPlugin (package ${pkg}).`);

const edit = (p, fn) => { if (!existsSync(p)) return; const s = readFileSync(p, "utf8"), n = fn(s); if (n !== s) writeFileSync(p, n); };
edit("android/app/build.gradle", (s) => {
  const deps = [];
  if (!s.includes("youtubedl-android")) deps.push("implementation 'io.github.junkfood02.youtubedl-android:library:0.18.1'", "implementation 'io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1'");
  if (!s.includes("nanohttpd")) deps.push("implementation 'org.nanohttpd:nanohttpd:2.3.1'");
  if (deps.length) s = s.replace(/dependencies\s*\{/, "dependencies {\n    " + deps.join("\n    "));
  if (!s.includes("useLegacyPackaging")) s = s.replace(/android\s*\{/, "android {\n    packagingOptions { jniLibs { useLegacyPackaging = true } }");   // yt-dlp/ffmpeg ship as native libs
  if (!s.includes("abiFilters")) s = s.replace(/defaultConfig\s*\{/, "defaultConfig {\n        ndk { abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86_64' }");   // every CPU type: 32-bit phones, 64-bit phones, emulators
  s = s.replace(/abiFilters[^\n}]*/, "abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86_64' ");   // also upgrades projects created with the old list
  s = s.replace(/(youtubedl-android:(?:library|ffmpeg):)[\d.]+/g, (m, p) => p + "0.18.1");   // upgrade projects that were generated with an older version
  return s;
});
edit("android/variables.gradle", (s) => s.replace(/minSdkVersion\s*=\s*\d+/, "minSdkVersion = 29"));   // MediaStore RELATIVE_PATH needs Android 10+
edit("android/app/src/main/AndroidManifest.xml", (s) => {
  const perms = ["ACCESS_WIFI_STATE", "CHANGE_WIFI_MULTICAST_STATE", "READ_MEDIA_AUDIO", "READ_MEDIA_VIDEO", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_DATA_SYNC", "POST_NOTIFICATIONS", "WAKE_LOCK"]
    .filter((p) => !s.includes(`android.permission.${p}"`)).map((p) => `<uses-permission android:name="android.permission.${p}" />`);
  if (!s.includes("READ_EXTERNAL_STORAGE")) perms.push('<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />');
  if (!s.includes("WRITE_EXTERNAL_STORAGE")) perms.push('<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />');   // legacy only; Android 10+ saves through MediaStore
  if (perms.length) s = s.replace("<application", perms.join("\n    ") + "\n    <application");
  if (!s.includes("usesCleartextTraffic")) s = s.replace("<application", '<application android:usesCleartextTraffic="true"');
  s = s.replace(/\s*android:extractNativeLibs="[^"]*"/g, "");   // Gradle sets this itself (useLegacyPackaging); the manifest attribute is deprecated
  if (!s.includes("DownloadService")) s = s.replace("</application>", '<service android:name=".DownloadService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>');
  if (!s.includes("screenOrientation")) s = s.replace("<activity", '<activity android:screenOrientation="portrait"');             // portrait lock
  return s;
});
// Debug signing with ONE fixed key kept in the repo (mobile/debug.keystore). Without it every computer and every CI run invents a new random
// debug key, and Android refuses to install a build over the previous one ("App not installed as package conflicts with an existing package").
// Standard Android debug credentials, not a secret. For real releases use the release key (README > Signing).
const DK = "mobile/debug.keystore";
if (!existsSync(DK)) {
  const k = spawnSync("keytool", ["-genkeypair", "-keystore", DK, "-storepass", "android", "-alias", "androiddebugkey", "-keypass", "android",
    "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Android Debug,O=Android,C=US"], { stdio: "pipe", shell: win });
  if (k.status === 0) {
    console.log(`Created ${DK}. COMMIT this file so every build (yours and GitHub's) is signed with the same key and updates install over each other.`);
    if (process.env.GITHUB_ACTIONS) console.log("::warning title=New debug key::mobile/debug.keystore was missing and had to be generated, so this APK's signature differs from earlier builds. Commit the file to the repository.");
  } else console.warn("keytool was not found (install a JDK). Debug builds use a random per-machine key until mobile/debug.keystore exists.");
}
// Version: package.json is the single source. versionCode must grow with every release or Android refuses to install the update over the old app.
const meta = JSON.parse(readFileSync("package.json", "utf8")), [vMa, vMi, vPa] = String(meta.version).split(/[.-]/).map((n) => parseInt(n) || 0);
edit("android/app/build.gradle", (g) => {
  g = g.replace(/versionCode\s+\d+/, `versionCode ${vMa * 10000 + vMi * 100 + vPa}`).replace(/versionName\s+"[^"]*"/, `versionName "${meta.version}"`);
  // Release signing with YOUR fixed key (env KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD). Without them the build is unsigned/debug.
  // An update only installs over an older version when both are signed with the same key.
  if (!g.includes("signingConfigs")) {
    g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            if (System.getenv("KEYSTORE_FILE")) { signingConfig signingConfigs.release }');
    g = g.replace(/buildTypes\s*\{/, `signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {`);
  }
  if (existsSync(DK) && !g.includes("androiddebugkey")) {   // use the fixed key for debug builds
    g = g.replace(/signingConfigs\s*\{/, `signingConfigs {
        debug {
            storeFile file("../../mobile/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }`);
  }
  return g;
});
console.log("Android project ready (portrait, MediaStore, yt-dlp + FFmpeg).");
