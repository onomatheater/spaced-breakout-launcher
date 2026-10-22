const T = {
  ru: {
    download: "Скачать / обновить сборку", play: "Играть", folder: "Папка модов", cancel: "Отмена",
    idle: "Готов.", needCfg: "Нет bundle_url — впиши ссылку в Настройках.", dl: "Скачиваю сборку...",
    verify: "Проверяю файлы...", done: "Готово. Моды на месте, можно играть.",
    playSt: "Запускаю Factorio...", noExe: "Не найден factorio.exe — укажи путь в Настройках.",
    save: "Сохранить", find: "Найти автоматически", pickExe: "Выбрать вручную", pickMods: "Выбрать",
    search: "Поиск мода...", main: "Главная", settings: "Настройки", credits: "Credits",
    update: "Проверить обновления", upToDate: "Обновлений нет — сборка актуальна.",
    updateAvail: "Доступно обновление сборки — жми Скачать.", checking: "Проверяю обновления...",
    errNoBundle: "Нет bundle_url — впиши ссылку в Настройках.",
    errSize: "Скачанный файл не того размера — попробуй скачать еще раз.",
    errBundleSha: "SHA1 бандла не сошлась — файл битый, качай заново.",
    errCancelled: "Скачивание отменено.",
    errNet: "Ошибка сети: ",
    errFile: "Проверка не прошла: ",
  },
  en: {
    download: "Download / update pack", play: "Play", folder: "Mods folder", cancel: "Cancel",
    idle: "Ready.", needCfg: "No bundle_url — set it in Settings.", dl: "Downloading bundle...",
    verify: "Verifying files...", done: "Done. Mods are in place, ready to play.",
    playSt: "Launching Factorio...", noExe: "factorio.exe not found — set the path in Settings.",
    save: "Save", find: "Auto-detect", pickExe: "Browse", pickMods: "Browse",
    search: "Search mods...", main: "Main", settings: "Settings", credits: "Credits",
    update: "Check for updates", upToDate: "Up to date — no new bundle.",
    updateAvail: "New bundle available — hit Download.", checking: "Checking for updates...",
    errNoBundle: "No bundle_url — set it in Settings.",
    errSize: "Downloaded file has wrong size — try downloading again.",
    errBundleSha: "Bundle SHA1 mismatch — file is corrupt, download again.",
    errCancelled: "Download cancelled.",
    errNet: "Network error: ",
    errFile: "Verification failed: ",
  },
};

function errMsg(e) {
  const m = String((e && e.message) || e || "");
  if (m.includes("no-bundle-url")) return tr("errNoBundle");
  if (m.includes("size-mismatch")) return tr("errSize");
  if (m.includes("bundle-sha1-mismatch")) return tr("errBundleSha");
  if (m.includes("cancelled")) return tr("errCancelled");
  if (m.includes("SHA1 mismatch")) return tr("errFile") + m;
  if (m.includes("HTTP")) return tr("errNet") + m;
  return m;
}
let lang = "ru";
let state = null;
const $ = (id) => document.getElementById(id);

function tr(k) { return T[lang][k] ?? k; }
function status(s) { $("status").textContent = s; }
function guarded(fn) {
  return (...a) => {
    try {
      return Promise.resolve(fn(...a)).catch((e) => status(errMsg(e)));
    } catch (e) {
      status(errMsg(e));
    }
  };
}

function applyLang() {
  document.querySelectorAll("nav button").forEach((b) => (b.textContent = tr(b.dataset.view)));
  $("btnDl").textContent = tr("download");
  $("btnPlay").textContent = tr("play");
  $("btnUpd").textContent = tr("update");
  $("btnFolder").textContent = tr("folder");
  $("btnCancel").textContent = tr("cancel");
  $("btnSave").textContent = tr("save");
  $("btnFind").textContent = tr("find");
  $("btnPickExe").textContent = tr("pickExe");
  $("btnPickMods").textContent = tr("pickMods");
  $("q").placeholder = tr("search");
  const m = state && state.manifest;
  $("subtitle").textContent = m
    ? `Factorio ${m.factorio_version} · v${m.version} · ${m.count} mods`
    : "";
}

function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("view-" + view).classList.remove("hidden");
  if (view === "credits") loadCredits().catch((e) => status(errMsg(e)));
}
document.querySelectorAll("nav button").forEach((b) => (b.onclick = guarded(async () => show(b.dataset.view))));
$("lang").onchange = guarded(async (e) => {
  lang = e.target.value;
  await window.api.saveSettings({ lang });
  applyLang();
});

async function refresh() {
  state = await window.api.getState();
  lang = state.lang || "ru";
  $("lang").value = lang;
  applyLang();
  $("gamePath").textContent = state.gameExe || tr("noExe");
  $("modsPath").textContent = state.modsDir;
  $("inpBundle").value = state.bundle_url || "";
  $("inpManifest").value = state.manifest_url || "";
  $("inpCredits").value = state.credits_url || "";
  if (!state.hasBundleUrl) status(tr("needCfg"));
  else if (!$("status").textContent) status(tr("idle"));
}

$("btnDl").onclick = async () => {
  if (!state.hasBundleUrl) return status(tr("needCfg"));
  setBusy(true);
  try {
    status(tr("dl"));
    await window.api.download();
    status(tr("verify"));
    await window.api.install({});
    status(tr("done"));
    await refresh();
  } catch (e) {
    status(errMsg(e));
  } finally {
    setBusy(false);
  }
};
$("btnUpd").onclick = async () => {
  setBusy(true);
  try {
    status(tr("checking"));
    const r = await window.api.checkUpdate();
    if (r.reason === "no-manifest-url") return status(tr("needCfg"));
    status(r.update ? `${tr("updateAvail")} (v${r.remote})` : tr("upToDate"));
  } catch (e) {
    status(errMsg(e));
  } finally {
    setBusy(false);
  }
};
$("btnCancel").onclick = guarded(() => window.api.cancelDownload());
$("btnPlay").onclick = async () => {
  try {
    await window.api.play();
    status(tr("playSt"));
  } catch (e) {
    status(state.gameExe ? errMsg(e) : tr("noExe"));
  }
};
$("btnFolder").onclick = guarded(() => window.api.openModsDir());
$("btnPickExe").onclick = guarded(async () => { await window.api.pickGameExe(); await refresh(); });
$("btnPickMods").onclick = guarded(async () => { await window.api.pickModsDir(); await refresh(); });
$("btnFind").onclick = guarded(async () => {
  await window.api.saveSettings({ factorio_exe: "" });
  await refresh();
});
$("btnSave").onclick = guarded(async () => {
  await window.api.saveSettings({ bundle_url: $("inpBundle").value.trim(), manifest_url: $("inpManifest").value.trim(), credits_url: $("inpCredits").value.trim() });
  await refresh();
});

function setBusy(b) {
  document.querySelectorAll("button").forEach((x) => (x.disabled = b));
  $("lang").disabled = b;
  $("btnCancel").disabled = !b;
  if (!b) {
    $("bar").value = 0;
    $("barV").value = 0;
  }
}

window.api.onProgress((v) => {
  if (v.phase === "download" && v.total) {
    const mb = (n) => (n / 1048576).toFixed(0) + " MB";
    $("bar").value = v.ratio || 0;
    status(`${tr("dl")} ${mb(v.got)} / ${mb(v.total)}`);
  } else if (v.phase === "verify") {
    $("barV").value = v.ratio || 0;
    status(`${tr("verify")} ${v.file || ""}`);
  }
});
window.api.onStatus((v) => {
  if (v.key === "done") status(tr("done"));
  if (v.key === "play") status(tr("playSt"));
});

async function loadCredits() {
  const c = await window.api.getCredits();
  const mods = Array.isArray(c.mods) ? c.mods : [];
  const q = ($("q").value || "").toLowerCase();
  const box = $("credits");
  box.innerHTML = "";
  const card = (m) => {
    const d = document.createElement("div");
    d.className = "card";
    const links = [
      m.portal_url && `<a href="${m.portal_url}">portal</a>`,
      m.repo_url && `<a href="${m.repo_url}">repo</a>`,
      m.discord_url && `<a href="${m.discord_url}">discord</a>`,
    ]
      .filter(Boolean)
      .join("");
    const cls = m.license_flag === "ok" || m.license_flag === "own" ? "ok" : "warn";
    d.innerHTML = `<b>${m.mod}</b> ${m.version} · ${m.author} <span class="badge ${cls}">${m.license}</span><div class="links">${links}</div>`;
    d.querySelectorAll("a").forEach((a) => {
      a.onclick = (e) => {
        e.preventDefault();
        const href = a.getAttribute("href");
        if (href) window.api.openUrl(href).catch((e) => status(errMsg(e)));
      };
    });
    return d;
  };
  mods
    .filter((m) => (m.mod + " " + m.author).toLowerCase().includes(q))
    .forEach((m) => box.appendChild(card(m)));
  if (c.not_in_bundle?.length) {
    const h = document.createElement("h3");
    h.textContent = "NOT in bundle";
    box.appendChild(h);
    c.not_in_bundle.forEach((m) => box.appendChild(card(m)));
  }
}
$("q").oninput = guarded(loadCredits);

refresh().catch((e) => status(errMsg(e)));
