// Spaced Breakout launcher — main process. No hacks:
// mod identity only from info.json inside zips, manifest.json is single source of truth.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const AdmZip = require("adm-zip");
const { fetchJson, downloadFile, sha1File } = require("./lib/net");

const ROOT = path.join(__dirname, "..");
const SHIPPED_MANIFEST = path.join(ROOT, "manifest.json");
const SHIPPED_CREDITS = path.join(ROOT, "credits.json");

let win = null;
let cancelFlag = false;

function userConfigPath() {
  return path.join(app.getPath("userData"), "launcher-config.json");
}

async function readUserConfig() {
  try {
    return JSON.parse(await fsp.readFile(userConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

async function writeUserConfig(cfg) {
  await fsp.mkdir(path.dirname(userConfigPath()), { recursive: true });
  await fsp.writeFile(userConfigPath(), JSON.stringify(cfg, null, 2), "utf-8");
}

function shippedManifest() {
  return JSON.parse(fs.readFileSync(SHIPPED_MANIFEST, "utf-8"));
}

// --- paths ---------------------------------------------------------------

function defaultModsDir() {
  return path.join(app.getPath("appData"), "Factorio", "mods");
}

async function resolveModsDir(cfg) {
  if (cfg.modsDir && fs.existsSync(cfg.modsDir)) return cfg.modsDir;
  const d = defaultModsDir();
  await fsp.mkdir(d, { recursive: true });
  return d;
}

function candidateGameExes() {
  return [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio\\bin\\x64\\factorio.exe",
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Factorio\\bin\\x64\\factorio.exe"),
  ];
}

function resolveGameExe(cfg) {
  if (cfg.factorio_exe && fs.existsSync(cfg.factorio_exe)) return cfg.factorio_exe;
  for (const c of candidateGameExes()) if (fs.existsSync(c)) return c;
  return null;
}

// --- download (resume + retry live in lib/net) ---------------------------------

function modNameFromZip(zipPath) {
  const z = new AdmZip(zipPath);
  const e = z.getEntries().find((x) => x.entryName.toLowerCase().endsWith("/info.json") || x.entryName.toLowerCase() === "info.json");
  if (!e) return null;
  return JSON.parse(e.getData().toString("utf-8")).name;
}

// --- install -------------------------------------------------------------

async function installBundle(bundleZip, manifest, modsDir, wantOptional, onProg) {
  const z = new AdmZip(bundleZip);
  const byName = new Map(z.getEntries().map((e) => [e.entryName, e]));
  const find = (name) =>
    byName.get(name) || z.getEntries().find((e) => e.entryName.endsWith("/" + name));

  const wanted = manifest.files.filter((f) => !f.optional || wantOptional.includes(f.name));
  if (!wanted.length) throw new Error("No mods in bundle");

  const mlPath = path.join(modsDir, "mod-list.json");
  let modList = { mods: [] };
  try {
    modList = JSON.parse(await fsp.readFile(mlPath, "utf-8"));
  } catch {}
  await fsp.copyFile(mlPath, mlPath + ".bak").catch(() => {});
  await fsp.copyFile(path.join(modsDir, "mod-settings.dat"), path.join(modsDir, "mod-settings.dat.bak")).catch(() => {});
  const known = new Set(modList.mods.map((m) => m.name));

  let i = 0;
  for (const f of wanted) {
    i++;
    onProg({ phase: "verify", ratio: i / wanted.length, file: f.name });
    const entry = find(f.name);
    if (!entry) throw new Error("Bundle is broken or incomplete: " + f.name);
    const dest = path.join(modsDir, path.basename(f.name));
    await fsp.writeFile(dest, entry.getData());
    const hash = (await sha1File(dest)).toLowerCase();
    if (hash !== String(f.sha1).toLowerCase()) throw new Error("SHA1 mismatch: " + f.name);
    const modName = modNameFromZip(dest);
    if (modName && !known.has(modName)) {
      modList.mods.push({ name: modName, enabled: true });
      known.add(modName);
    }
  }
  // cleanup stale duplicates of the same mods (keep newest per base name)
  const seen = new Set();
  for (const f of [...wanted].reverse()) {
    const base = f.name.replace(/_[\d.]+\.zip$/, "");
    if (seen.has(base)) await fsp.unlink(path.join(modsDir, path.basename(f.name))).catch(() => {});
    else seen.add(base);
  }
  await fsp.writeFile(mlPath, JSON.stringify(modList, null, 2), "utf-8");
}

// --- window --------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 640,
    height: 720,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function sendStatus(key, extra) {
  win?.webContents.send("status", { key, ...extra });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// --- IPC -----------------------------------------------------------------

ipcMain.handle("get-state", async () => {
  const cfg = await readUserConfig();
  const m = shippedManifest();
  return {
    manifest: { name: m.name, version: m.version, factorio_version: m.factorio_version, count: m.files.length },
    modsDir: await resolveModsDir(cfg),
    gameExe: resolveGameExe(cfg),
    hasBundleUrl: Boolean(cfg.bundle_url),
    bundle_url: cfg.bundle_url || "",
    manifest_url: cfg.manifest_url || "",
    credits_url: cfg.credits_url || "",
    lang: cfg.lang || "ru",
  };
});

ipcMain.handle("check-update", async () => {
  const cfg = await readUserConfig();
  const local = shippedManifest();
  if (!cfg.manifest_url) return { update: false, reason: "no-manifest-url", local: local.version };
  const remote = await fetchJson(cfg.manifest_url);
  return {
    update: remote.bundle_sha1 !== local.bundle_sha1,
    local: local.version,
    remote: remote.version,
    remoteManifest: remote,
  };
});

ipcMain.handle("download", async () => {
  const cfg = await readUserConfig();
  if (!cfg.bundle_url) throw new Error("no-bundle-url");
  const tmp = path.join(app.getPath("temp"), "spaced-breakout-bundle.zip");
  cancelFlag = false;
  const onProg = (v) => win?.webContents.send("progress", v);
  const r = await downloadFile(cfg.bundle_url, tmp, onProg, () => cancelFlag);
  const m = shippedManifest();
  const st = await fsp.stat(tmp);
  if (m.bundle_size && st.size !== m.bundle_size) throw new Error("size-mismatch");
  const hash = await sha1File(tmp);
  if (m.bundle_sha1 && hash.toLowerCase() !== String(m.bundle_sha1).toLowerCase()) throw new Error("bundle-sha1-mismatch");
  return { tmp, ...r };
});

ipcMain.handle("cancel-download", async () => {
  cancelFlag = true;
  return true;
});

ipcMain.handle("install", async (_e, { wantOptional = [] } = {}) => {
  const cfg = await readUserConfig();
  const m = shippedManifest();
  const tmp = path.join(app.getPath("temp"), "spaced-breakout-bundle.zip");
  const modsDir = await resolveModsDir(cfg);
  await installBundle(tmp, m, modsDir, wantOptional, (v) => win?.webContents.send("progress", v));
  sendStatus("done");
  return { modsDir };
});

ipcMain.handle("play", async () => {
  const cfg = await readUserConfig();
  const exe = resolveGameExe(cfg);
  if (!exe) throw new Error("no-exe");
  sendStatus("play");
  spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  return true;
});

ipcMain.handle("open-mods-dir", async () => {
  const cfg = await readUserConfig();
  shell.openPath(await resolveModsDir(cfg));
  return true;
});

ipcMain.handle("pick-game-exe", async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: "Factorio", extensions: ["exe"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const cfg = await readUserConfig();
  cfg.factorio_exe = r.filePaths[0];
  await writeUserConfig(cfg);
  return cfg.factorio_exe;
});

ipcMain.handle("pick-mods-dir", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const cfg = await readUserConfig();
  cfg.modsDir = r.filePaths[0];
  await writeUserConfig(cfg);
  return cfg.modsDir;
});

ipcMain.handle("save-settings", async (_e, s) => {
  const cfg = await readUserConfig();
  Object.assign(cfg, s);
  await writeUserConfig(cfg);
  return true;
});

ipcMain.handle("get-credits", async () => {
  const cfg = await readUserConfig();
  if (cfg.credits_url) {
    try {
      return await fetchJson(cfg.credits_url);
    } catch {}
  }
  return JSON.parse(await fsp.readFile(SHIPPED_CREDITS, "utf-8"));
});

ipcMain.handle("open-url", async (_e, url) => {
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("bad-url");
  await shell.openExternal(url);
  return true;
});
