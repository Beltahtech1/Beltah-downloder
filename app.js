(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "beltah_downloader_config_v1";
  const HISTORY_KEY = "beltah_downloader_history_v1";
  const DEFAULT_CONFIG = { primaryApi: "", fallbackApi: "", releases: { android: "", windows: "", macos: "", linux: "" } };
  const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  const state = {
    config: (() => { const v = readJson(STORAGE_KEY, {}); return { ...DEFAULT_CONFIG, ...v, releases: { ...DEFAULT_CONFIG.releases, ...(v.releases || {}) } }; })(),
    history: readJson(HISTORY_KEY, []),
    queue: [],
    searchController: null,
    downloadController: null,
    deferredPrompt: null,
    lastQuery: ""
  };

  const toast = (message) => {
    const el = $("toast"); if (!el) return;
    el.textContent = message; el.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add("hidden"), 2600);
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const safeUrl = (value) => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; } };
  const detectPlatform = (value) => {
    const s = String(value || "").toLowerCase();
    if (/youtube\.com|youtu\.be/.test(s)) return "YouTube";
    if (/tiktok\.com/.test(s)) return "TikTok";
    if (/instagram\.com/.test(s)) return "Instagram";
    if (/facebook\.com|fb\.watch/.test(s)) return "Facebook";
    if (/x\.com|twitter\.com/.test(s)) return "X";
    if (/reddit\.com/.test(s)) return "Reddit";
    if (/pinterest\.com|pin\.it/.test(s)) return "Pinterest";
    if (/soundcloud\.com/.test(s)) return "SoundCloud";
    return safeUrl(value) ? "Direct URL" : "Search";
  };
  const detectOS = () => {
    const ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return "Android";
    if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
    if (/windows/i.test(ua)) return "Windows";
    if (/macintosh|mac os x/i.test(ua)) return "macOS";
    if (/linux/i.test(ua)) return "Linux";
    return "Desktop / Web";
  };
  const extensionFor = (url) => {
    try { const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "download"); const m = name.match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : ""; } catch { return ""; }
  };
  const mediaType = (url, mime = "") => {
    const ext = extensionFor(url);
    if (/^(mp4|m4v|webm|mov|ogv|mkv)$/i.test(ext) || /^video\//i.test(mime)) return "video";
    if (/^(mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i.test(ext) || /^audio\//i.test(mime)) return "audio";
    return "file";
  };
  const formatBytes = (n) => {
    if (!Number.isFinite(n) || n <= 0) return "Size not supplied";
    const units = ["B","KB","MB","GB","TB"]; const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
  };
  function updateBadge() { $("detectedPlatformBadge").textContent = detectPlatform($("queryInput").value.trim()); }
  function saveHistory(term) {
    const value = term.trim(); if (!value) return;
    state.history = [value, ...state.history.filter(x => x !== value)].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); renderHistory();
  }
  function renderHistory() {
    const chips = $("historyChips"), list = $("historyList"), clear = $("clearHistoryBtn");
    chips.replaceChildren(); list.replaceChildren();
    clear.classList.toggle("hidden", state.history.length === 0);
    if (!state.history.length) { list.textContent = "Your recently checked links will appear here."; return; }
    state.history.forEach(term => {
      const chip = document.createElement("button"); chip.type = "button";
      chip.className = "px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 max-w-[220px] truncate";
      chip.textContent = term; chip.addEventListener("click", () => { $("queryInput").value = term; updateBadge(); runSearch(term); }); chips.append(chip);
      const row = document.createElement("button"); row.type = "button";
      row.className = "w-full text-left px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 truncate";
      row.textContent = term; row.addEventListener("click", () => { $("queryInput").value = term; updateBadge(); runSearch(term); }); list.append(row);
    });
  }
  function renderQueue() {
    $("queueCount").textContent = String(state.queue.length);
    const list = $("queueList"); list.replaceChildren();
    if (!state.queue.length) { list.textContent = "Files you prepare will appear here."; return; }
    state.queue.slice(0, 8).forEach(item => {
      const row = document.createElement("div"); row.className = "p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs";
      const info = document.createElement("div"); info.className = "min-w-0";
      const title = document.createElement("div"); title.className = "font-semibold text-white truncate"; title.textContent = item.title;
      const status = document.createElement("div"); status.className = "text-slate-400"; status.textContent = "Status: " + item.status;
      info.append(title, status); row.append(info);
      if (item.url) { const again = document.createElement("button"); again.type = "button"; again.className = "px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200"; again.textContent = "Download again"; again.addEventListener("click", () => startDownload(item)); row.append(again); }
      list.append(row);
    });
  }
  function setStatus(message, kind = "info") {
    const panel = $("statusPanel"); panel.className = "glass rounded-2xl p-4 text-sm " + (kind === "error" ? "border border-rose-500/40 text-rose-200" : kind === "success" ? "border border-emerald-500/30 text-emerald-200" : "text-slate-300");
    panel.textContent = message; panel.classList.remove("hidden");
  }
  function showLoading(query) {
    const panel = $("statusPanel"); panel.className = "glass rounded-2xl p-5 text-sm text-sky-200";
    panel.replaceChildren();
    const label = document.createElement("div"); label.textContent = "Checking: " + query;
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "ml-3 px-3 py-1 rounded-lg bg-slate-800 text-rose-200"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => state.searchController?.abort()); panel.append(label, cancel); panel.classList.remove("hidden");
  }
  function directFileCandidate(url) {
    const ext = extensionFor(url);
    return /^(mp4|m4a|m4v|mp3|webm|mov|wav|ogg|oga|opus|ogv|pdf|zip|png|jpe?g|gif|webp|aac|flac|mkv)$/i.test(ext);
  }
  async function inspectDirectUrl(url, signal) {
    let mime = "", size = 0, filename = "";
    try {
      const response = await fetch(url, { method: "HEAD", mode: "cors", signal, credentials: "omit" });
      if (response.ok) { mime = response.headers.get("content-type") || ""; size = Number(response.headers.get("content-length") || 0); }
      else if (!directFileCandidate(url)) throw new Error("The source returned HTTP " + response.status + ".");
    } catch (err) {
      if (err.name === "AbortError") throw err;
      if (!directFileCandidate(url)) throw new Error("This link is not confirmed as a direct file. The source may block browser checks or the URL may be a webpage.");
    }
    try { filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "media-file"); } catch { filename = "media-file"; }
    if (!directFileCandidate(url) && !/^(video|audio|application|image)\//i.test(mime)) throw new Error("This does not appear to be a direct media or file URL. Paste a direct file link instead.");
    return { title: filename, url, mime: mime.split(";")[0], size, kind: mediaType(url, mime) };
  }
  function renderResult(item) {
    const grid = $("resultsGrid"); grid.replaceChildren();
    const card = document.createElement("article"); card.className = "glass rounded-2xl p-4 space-y-3";
    const heading = document.createElement("div"); heading.className = "font-bold text-white break-words"; heading.textContent = item.title;
    const meta = document.createElement("div"); meta.className = "text-xs text-slate-400"; meta.textContent = (item.mime || "Source file") + " · " + formatBytes(item.size) + " · Original file";
    card.append(heading, meta);
    if (item.kind === "video" || item.kind === "audio") {
      const preview = document.createElement(item.kind); preview.controls = true; preview.preload = "metadata"; preview.src = item.url;
      preview.className = "w-full rounded-xl max-h-72"; if (item.kind === "video") preview.playsInline = true; card.append(preview);
    }
    const actions = document.createElement("div"); actions.className = "flex flex-wrap gap-2";
    const download = document.createElement("button"); download.type = "button"; download.className = "px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs"; download.textContent = "Download file";
    download.addEventListener("click", () => startDownload(item));
    const open = document.createElement("a"); open.href = item.url; open.target = "_blank"; open.rel = "noopener noreferrer"; open.className = "px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs"; open.textContent = "Open source";
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs"; copy.textContent = "Copy link";
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(item.url); toast("Link copied."); } catch { toast("Clipboard access is unavailable."); } });
    actions.append(download, open, copy); card.append(actions); grid.append(card);
    $("resultsSection").classList.remove("hidden");
  }
  function showYoutubeFallback(url) {
    const grid = $("resultsGrid"); grid.replaceChildren();
    const card = document.createElement("div"); card.className = "glass rounded-2xl p-5 space-y-3";
    const title = document.createElement("h3"); title.className = "font-bold text-white"; title.textContent = "YouTube external option";
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs"; copy.textContent = "Copy YouTube link";
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); toast("YouTube link copied."); } catch { toast("Copy unavailable. Select and copy the URL manually."); } });
    const open = document.createElement("a"); open.href = "https://app.ytdown.to/en38/"; open.target = "_blank"; open.rel = "noopener noreferrer"; open.className = "inline-block px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs"; open.textContent = "Open YTDown";
    const note = document.createElement("p"); note.className = "text-xs text-slate-400"; note.textContent = "This opens an external service. Beltah Downloader does not extract YouTube streams itself.";
    card.append(title, note, copy, open); grid.append(card); $("resultsSection").classList.remove("hidden");
  }
  async function runSearch(raw) {
    const query = raw.trim(); if (!query) { setStatus("Paste a direct media or file URL first.", "error"); return; }
    state.lastQuery = query; saveHistory(query); state.searchController?.abort(); state.searchController = new AbortController();
    $("resultsSection").classList.add("hidden"); showLoading(query);
    const url = safeUrl(query);
    if (!url) { setStatus("Enter a complete HTTP or HTTPS URL.", "error"); return; }
    const platform = detectPlatform(query);
    if (platform === "YouTube") { $("statusPanel").classList.add("hidden"); showYoutubeFallback(url); setStatus("YouTube links use the external option shown below.", "success"); return; }
    if (platform !== "Direct URL") { setStatus(platform + " page extraction is not configured. Paste a direct file URL from a source you are authorised to access.", "error"); return; }
    try {
      const item = await inspectDirectUrl(url, state.searchController.signal);
      $("statusPanel").classList.add("hidden"); renderResult(item); setStatus("Direct file identified. Choose Download file to save it.", "success");
    } catch (err) {
      if (err.name === "AbortError") return;
      setStatus(err.message || "Could not inspect this URL.", "error");
    }
  }
  async function startDownload(item) {
    const url = safeUrl(item.url); if (!url) return toast("Invalid download URL.");
    state.downloadController?.abort(); const controller = new AbortController(); state.downloadController = controller;
    const entry = { id: Date.now(), url, title: item.title || "beltah-media", ext: extensionFor(url) || "bin", status: "Downloading" };
    state.queue.unshift(entry); renderQueue();
    const section = $("progressSection"), bar = $("progressBar"), stats = $("progressStats");
    $("progressTitle").textContent = entry.title; bar.style.width = "0%"; stats.textContent = "Connecting to source…"; section.classList.remove("hidden");
    const started = performance.now();
    try {
      const response = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", signal: controller.signal });
      if (!response.ok) throw new Error("Source returned HTTP " + response.status + ".");
      const total = Number(response.headers.get("content-length") || 0);
      let blob;
      if (response.body && response.body.getReader) {
        const reader = response.body.getReader(), chunks = []; let received = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          chunks.push(value); received += value.byteLength;
          const elapsed = Math.max((performance.now() - started) / 1000, .1), speed = received / 1048576 / elapsed;
          if (total > 0) { const pct = Math.min(99, Math.round(received / total * 100)); bar.style.width = pct + "%"; const eta = speed > .01 ? Math.ceil((total - received) / 1048576 / speed) + "s" : "—"; stats.textContent = pct + "% · " + formatBytes(received) + " · " + speed.toFixed(2) + " MB/s · ETA " + eta; }
          else { bar.style.width = "65%"; stats.textContent = formatBytes(received) + " · " + speed.toFixed(2) + " MB/s · size unknown"; }
        }
        blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
      } else { blob = await response.blob(); }
      const objectUrl = URL.createObjectURL(blob), anchor = document.createElement("a");
      const base = entry.title.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 70) || "beltah-media";
      anchor.href = objectUrl; anchor.download = base + "." + entry.ext; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      bar.style.width = "100%"; stats.textContent = "100% · Completed"; entry.status = "Completed";
    } catch (err) {
      if (err.name === "AbortError") { entry.status = "Cancelled"; stats.textContent = "Cancelled"; }
      else { entry.status = "Browser download blocked — opened source"; stats.textContent = "CORS or source policy blocked direct saving."; window.open(url, "_blank", "noopener,noreferrer"); toast("Source blocked in-page saving. Opened the source link."); }
    } finally { renderQueue(); }
  }
  function syncReleaseLinks() {
    const entries = [["androidReleaseLink","android","Android Release Link →"],["windowsReleaseLink","windows","Windows"],["macosReleaseLink","macos","macOS"],["linuxReleaseLink","linux","Linux"]];
    entries.forEach(([id,key,label]) => { const el = $(id); if (!el) return; const url = safeUrl(state.config.releases[key]); if (url) { el.href = url; el.textContent = label; el.classList.remove("opacity-50","pointer-events-none"); } else { el.href = "#"; el.textContent = label + " (Not configured)"; el.classList.add("opacity-50","pointer-events-none"); } });
  }
  function fillConfigForm() {
    $("cfgPrimaryApi").value = state.config.primaryApi || ""; $("cfgFallbackApi").value = state.config.fallbackApi || "";
    $("cfgAndroidUrl").value = state.config.releases.android || ""; $("cfgWindowsUrl").value = state.config.releases.windows || "";
    $("cfgMacosUrl").value = state.config.releases.macos || ""; $("cfgLinuxUrl").value = state.config.releases.linux || "";
    $("diagnosticsBox").textContent = "Device: " + detectOS() + " | Online: " + navigator.onLine + " | History: " + state.history.length + " | Queue: " + state.queue.length + " | Resolver: not connected";
  }
  function validOptionalUrl(value, label) { if (!value.trim()) return ""; const url = safeUrl(value.trim()); if (!url) throw new Error(label + " must be a valid HTTP/HTTPS URL."); return url; }
  async function unlockAdmin(event) {
    event.preventDefault(); const error = $("adminAuthError"); error.classList.add("hidden");
    const button = $("adminAuthForm").querySelector('button[type="submit"]'); button.disabled = true; button.textContent = "Checking…";
    try {
      const response = await fetch("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: $("adminPassInput").value }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Authentication failed.");
      $("adminAuthForm").classList.add("hidden"); $("adminConfigPanel").classList.remove("hidden"); fillConfigForm();
    } catch (err) { error.textContent = err.message; error.classList.remove("hidden"); }
    finally { button.disabled = false; button.textContent = "Unlock Settings"; }
  }
  function saveConfig() {
    try {
      state.config = { primaryApi: validOptionalUrl($("cfgPrimaryApi").value, "Primary endpoint"), fallbackApi: validOptionalUrl($("cfgFallbackApi").value, "Fallback endpoint"), releases: {
        android: validOptionalUrl($("cfgAndroidUrl").value, "Android URL"), windows: validOptionalUrl($("cfgWindowsUrl").value, "Windows URL"),
        macos: validOptionalUrl($("cfgMacosUrl").value, "macOS URL"), linux: validOptionalUrl($("cfgLinuxUrl").value, "Linux URL")
      }};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config)); syncReleaseLinks(); fillConfigForm(); toast("Configuration saved on this device. Resolver is not active until integrated.");
    } catch (err) { toast(err.message); }
  }
  function exportConfig() {
    const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "beltah-downloader-config.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function importConfig(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()); state.config = { ...DEFAULT_CONFIG, ...parsed, releases: { ...DEFAULT_CONFIG.releases, ...(parsed.releases || {}) }}; fillConfigForm(); saveConfig(); }
    catch { toast("Invalid configuration JSON."); } finally { event.target.value = ""; }
  }
  function clearHistory() { state.history = []; localStorage.removeItem(HISTORY_KEY); renderHistory(); toast("History cleared."); }
  function closeSettings() { $("settingsModal").classList.add("hidden"); $("settingsModal").classList.remove("flex"); }
  function openSettings() { $("settingsModal").classList.remove("hidden"); $("settingsModal").classList.add("flex"); }
  function openDrawer() { $("installDrawerBackdrop").classList.remove("hidden"); $("installDrawer").classList.remove("-translate-x-full"); $("detectedOsBanner").textContent = "Detected OS: " + detectOS() + " — Install as a web app or use a configured release link."; }
  function closeDrawer() { $("installDrawerBackdrop").classList.add("hidden"); $("installDrawer").classList.add("-translate-x-full"); }
  async function triggerInstall() {
    if (state.deferredPrompt) { state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; }
    else { openDrawer(); toast("Use your browser menu to install or add this app to your home screen."); }
  }

  $("queryInput").addEventListener("input", updateBadge);
  $("searchForm").addEventListener("submit", e => { e.preventDefault(); runSearch($("queryInput").value); });
  $("clearUrl").addEventListener("click", () => { $("queryInput").value = ""; updateBadge(); $("queryInput").focus(); });
  $("pasteBtn").addEventListener("click", async () => { try { const value = await navigator.clipboard.readText(); if (value) { $("queryInput").value = value; updateBadge(); } } catch { toast("Clipboard permission was not granted."); } });
  $("pasteGoBtn").addEventListener("click", async () => { try { const value = await navigator.clipboard.readText(); if (value) { $("queryInput").value = value; updateBadge(); runSearch(value); } } catch { toast("Clipboard permission was not granted."); } });
  $("clearHistoryBtn").addEventListener("click", clearHistory); $("clearHistory").addEventListener("click", clearHistory);
  $("cancelDownloadBtn").addEventListener("click", () => state.downloadController?.abort());
  $("clearFinishedQueueBtn").addEventListener("click", () => { state.queue = state.queue.filter(x => x.status === "Downloading"); renderQueue(); });
  $("openInstallBtn").addEventListener("click", openDrawer); $("closeInstallBtn").addEventListener("click", closeDrawer); $("installDrawerBackdrop").addEventListener("click", closeDrawer);
  $("installBtn").addEventListener("click", triggerInstall); $("pwaInstallTriggerBtn").addEventListener("click", triggerInstall);
  $("openSettingsBtn").addEventListener("click", openSettings); $("closeSettingsBtn").addEventListener("click", closeSettings);
  $("settingsModal").addEventListener("click", e => { if (e.target === $("settingsModal")) closeSettings(); });
  $("adminAuthForm").addEventListener("submit", unlockAdmin); $("saveConfigBtn").addEventListener("click", saveConfig);
  $("exportConfigBtn").addEventListener("click", exportConfig); $("importConfigBtn").addEventListener("click", () => $("importConfigFile").click());
  $("importConfigFile").addEventListener("change", importConfig);
  $("adminLockBtn").addEventListener("click", () => { $("adminPassInput").value = ""; $("adminConfigPanel").classList.add("hidden"); $("adminAuthForm").classList.remove("hidden"); closeSettings(); });
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); state.deferredPrompt = e; $("installBtn").classList.remove("hidden"); });
  window.addEventListener("online", () => toast("You are back online.")); window.addEventListener("offline", () => toast("You are offline."));
  document.addEventListener("keydown", e => { if (e.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) { e.preventDefault(); $("queryInput").focus(); } if (e.key === "Escape") { closeDrawer(); closeSettings(); } });
  $("year").textContent = String(new Date().getFullYear());
  renderHistory(); renderQueue(); syncReleaseLinks(); updateBadge();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
})();