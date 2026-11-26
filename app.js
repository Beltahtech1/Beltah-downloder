(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "beltah_downloader_config_v1";
  const HISTORY_KEY = "beltah_downloader_history_v1";
  const SILVATECHS_API = "https://downloader.silvatechs.com/api/public/download";
  const DEFAULT_CONFIG = { releases: { android: "", windows: "", macos: "", linux: "" } };
  const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  const state = {
    config: (() => { const v = readJson(STORAGE_KEY, {}); return { releases: { ...DEFAULT_CONFIG.releases, ...(v.releases || {}) } }; })(),
    history: readJson(HISTORY_KEY, []),
    queue: [],
    searchController: null,
    searchProgressTimer: null,
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
  function stopSearchProgress() {
    if (state.searchProgressTimer) clearInterval(state.searchProgressTimer);
    state.searchProgressTimer = null;
  }
  function showLoading(query) {
    stopSearchProgress();
    const panel = $("statusPanel");
    panel.className = "glass rounded-3xl border border-sky-400/20 bg-slate-950/90 p-5 sm:p-6 text-sm text-slate-200 shadow-2xl shadow-sky-950/30";
    panel.replaceChildren();
    const wrap = document.createElement("div"); wrap.className = "space-y-4";
    const top = document.createElement("div"); top.className = "flex items-center gap-3";
    const spinner = document.createElement("div"); spinner.className = "h-10 w-10 shrink-0 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin";
    const copy = document.createElement("div"); copy.className = "min-w-0 flex-1";
    const title = document.createElement("div"); title.className = "font-bold text-white text-base"; title.textContent = "Beltah Tech searching";
    const detail = document.createElement("div"); detail.className = "text-xs text-slate-400 truncate"; detail.textContent = query;
    copy.append(title, detail); top.append(spinner, copy);
    const line = document.createElement("div"); line.className = "flex items-center justify-between text-xs";
    const phase = document.createElement("span"); phase.className = "text-sky-300"; phase.textContent = "Connecting securely…";
    const percent = document.createElement("strong"); percent.className = "text-white tabular-nums"; percent.textContent = "3%";
    line.append(phase, percent);
    const track = document.createElement("div"); track.className = "h-2.5 rounded-full overflow-hidden bg-slate-800";
    const bar = document.createElement("div"); bar.className = "h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 transition-all duration-300"; bar.style.width = "3%"; track.append(bar);
    const foot = document.createElement("div"); foot.className = "flex items-center justify-between gap-3 text-[11px] text-slate-500";
    const note = document.createElement("span"); note.textContent = "Preparing your media options";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => state.searchController?.abort());
    foot.append(note, cancel); wrap.append(top, line, track, foot); panel.append(wrap); panel.classList.remove("hidden");
    let value = 3;
    const phases = ["Connecting securely…","Checking the media link…","Preparing video and audio options…","Almost ready…"];
    state.searchProgressTimer = setInterval(() => {
      if (value < 35) value += 4;
      else if (value < 70) value += 2;
      else if (value < 92) value += 1;
      value = Math.min(value, 92);
      percent.textContent = value + "%"; bar.style.width = value + "%";
      phase.textContent = phases[Math.min(3, Math.floor(value / 25))];
    }, 220);
  }
  function finishSearchProgress() {
    stopSearchProgress();
    const panel = $("statusPanel");
    const percent = panel.querySelector("strong");
    const bar = panel.querySelector(".bg-gradient-to-r");
    const phase = panel.querySelector(".text-sky-300");
    if (percent) percent.textContent = "100%";
    if (bar) bar.style.width = "100%";
    if (phase) phase.textContent = "Beltah Tech Found";
    const title = panel.querySelector(".font-bold.text-white");
    if (title) title.textContent = "Beltah Tech Found";
    const spinner = panel.querySelector(".animate-spin");
    if (spinner) spinner.className = "h-10 w-10 shrink-0 rounded-full border-2 border-emerald-400/30 bg-emerald-400/10";
    const note = panel.querySelector(".text-slate-500");
    if (note) note.textContent = "Your media is ready. Choose video or audio below.";
    const cancel = panel.querySelector("button");
    if (cancel) cancel.remove();
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
    const card = document.createElement("article"); card.className = "glass rounded-3xl border border-slate-700/70 bg-slate-950/70 p-4 sm:p-5 space-y-4 shadow-xl shadow-black/20";
    const header = document.createElement("div"); header.className = "flex items-start gap-3";
    const icon = document.createElement("div"); icon.className = "h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-sky-400/30 flex items-center justify-center text-sky-200 shadow-lg shadow-sky-950/30"; icon.setAttribute("aria-hidden","true"); icon.innerHTML = '<svg viewBox="0 0 48 48" class="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 5.5h15l9 9V41a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 11 41V8a2.5 2.5 0 0 1 2-2.5Z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M28 6v10h9" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 21v13m0 0-5-5m5 5 5-5" stroke="#67E8F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 39h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
    const titleWrap = document.createElement("div"); titleWrap.className = "min-w-0 flex-1";
    const eyebrow = document.createElement("div"); eyebrow.className = "text-[10px] uppercase tracking-[.18em] text-emerald-300 font-bold"; eyebrow.textContent = "BELTAH TECH FOUND";
    const heading = document.createElement("div"); heading.className = "mt-1 font-bold text-white break-words"; heading.textContent = item.title;
    const meta = document.createElement("div"); meta.className = "mt-1 text-xs text-slate-400"; meta.textContent = (item.format === "mp3" ? "MP3 audio" : "MP4 video · 360p") + "  •  " + (item.size > 0 ? formatBytes(item.size) : "File size unavailable");
    titleWrap.append(eyebrow, heading, meta); header.append(icon, titleWrap); card.append(header);
    const sizePanel = document.createElement("div"); sizePanel.className = "rounded-2xl bg-slate-900/80 border border-slate-800 px-3.5 py-3 flex items-center justify-between gap-3";
    const sizeLabel = document.createElement("div"); sizeLabel.className = "text-xs text-slate-400"; sizeLabel.textContent = "Estimated download size";
    const sizeValue = document.createElement("div"); sizeValue.className = "font-bold text-white text-sm tabular-nums"; sizeValue.textContent = item.size > 0 ? formatBytes(item.size) : "Not provided by source";
    sizePanel.append(sizeLabel, sizeValue); card.append(sizePanel);
    if (item.kind === "video" || item.kind === "audio") {
      const preview = document.createElement(item.kind); preview.controls = true; preview.preload = "metadata"; preview.src = item.url;
      preview.className = "w-full rounded-2xl max-h-72 bg-black"; if (item.kind === "video") preview.playsInline = true; card.append(preview);
    }
    const optionsTitle = document.createElement("div"); optionsTitle.className = "text-xs font-semibold text-slate-300"; optionsTitle.textContent = "Choose your download";
    const options = document.createElement("div"); options.className = "grid grid-cols-1 sm:grid-cols-2 gap-2";
    [["mp4","▶","Video · MP4","360p"],["mp3","♫","Audio · MP3","Audio"]].forEach(([format,symbol,label,sub]) => {
      const option = document.createElement("button"); option.type = "button";
      const active = item.format === format;
      option.className = "rounded-2xl border px-3 py-3 text-left transition " + (active ? "border-sky-400/60 bg-sky-400/10" : "border-slate-700 bg-slate-900/70 hover:border-slate-500");
      const line = document.createElement("div"); line.className = "flex items-center justify-between gap-2";
      const name = document.createElement("span"); name.className = "font-bold text-sm text-white"; name.textContent = symbol + "  " + label;
      const mark = document.createElement("span"); mark.className = "text-[10px] rounded-full px-2 py-1 " + (active ? "bg-sky-400/15 text-sky-200" : "bg-slate-800 text-slate-400"); mark.textContent = active ? "Ready" : "Prepare";
      const detail = document.createElement("div"); detail.className = "mt-1 text-[11px] text-slate-400"; detail.textContent = sub;
      line.append(name, mark); option.append(line, detail);
      option.addEventListener("click", () => { if (!active) runSearch(item.query || state.lastQuery, format); });
      options.append(option);
    });
    card.append(optionsTitle, options);
    const actions = document.createElement("div"); actions.className = "grid grid-cols-1 sm:grid-cols-2 gap-2";
    const download = document.createElement("button"); download.type = "button"; download.className = "px-4 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 text-slate-950 font-extrabold text-sm shadow-lg shadow-sky-500/15"; download.textContent = "↓  Download file";
    download.addEventListener("click", () => startDownload(item));
    const another = document.createElement("button"); another.type = "button"; another.className = "px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-sm"; another.textContent = "＋ Download another file";
    another.addEventListener("click", () => {
      state.searchController?.abort(); stopSearchProgress(); state.lastQuery = "";
      $("queryInput").value = ""; updateBadge(); $("resultsGrid").replaceChildren();
      $("resultsSection").classList.add("hidden"); $("statusPanel").classList.add("hidden");
      $("queryInput").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
    });
    actions.append(download, another); card.append(actions); grid.append(card);
    $("resultsSection").classList.remove("hidden");
  }
  function collectDownloadCandidates(value, output = [], seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return output;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(item => collectDownloadCandidates(item, output, seen)); return output; }
    const preferredKeys = ["downloadUrl","download_url","downloadLink","download_link","directUrl","direct_url","download","url","link","src","file"];
    for (const key of preferredKeys) {
      const candidate = value[key];
      if (typeof candidate === "string" && safeUrl(candidate)) {
        const format = String(value.format || value.ext || value.type || "").toLowerCase();
        output.push({ url: safeUrl(candidate), format, title: value.title || value.name || value.filename || "" });
      } else if (candidate && typeof candidate === "object") collectDownloadCandidates(candidate, output, seen);
    }
    Object.entries(value).forEach(([key, child]) => {
      if (!preferredKeys.includes(key) && child && typeof child === "object") collectDownloadCandidates(child, output, seen);
    });
    return output;
  }
  async function runSearch(raw, requestedFormat) {
    const query = raw.trim();
    if (!query) { setStatus("Enter a search term or paste a media URL.", "error"); return; }
    state.lastQuery = query; saveHistory(query); state.searchController?.abort();
    const controller = new AbortController(); state.searchController = controller;
    $("resultsSection").classList.add("hidden"); showLoading(query);
    const sourceUrl = safeUrl(query);
    const format = requestedFormat || ($("downloadFormat")?.value === "mp3" ? "mp3" : "mp4");
    if ($("downloadFormat")) $("downloadFormat").value = format;
    const endpoint = new URL(SILVATECHS_API);
    endpoint.searchParams.set(sourceUrl ? "url" : "q", query);
    endpoint.searchParams.set("format", format);
    if (format === "mp4") endpoint.searchParams.set("quality", "360");
    try {
      const response = await fetch(endpoint.toString(), {
        method: "GET", mode: "cors", credentials: "omit",
        headers: { "Accept": "application/json, audio/*, video/*, application/octet-stream" },
        signal: controller.signal
      });
      if (!response.ok) {
        let detail = "";
        try { const errorData = await response.clone().json(); detail = errorData.message || errorData.error || ""; } catch {}
        throw new Error(detail || "Beltah Tech could not process this request (HTTP " + response.status + ").");
      }
      const contentType = response.headers.get("content-type") || "";
      if (/^(audio|video)\//i.test(contentType) || /application\/(octet-stream|force-download)/i.test(contentType)) {
        const blob = await response.blob();
        const mediaUrl = URL.createObjectURL(blob);
        const item = { title: query.split("/").pop().slice(0,90) || "beltah-media", url: mediaUrl, mime: contentType.split(";")[0], size: blob.size, kind: mediaType("download." + format, contentType), format, query };
        finishSearchProgress(); setStatus("Beltah Tech found your " + (format === "mp3" ? "MP3 audio" : "MP4 download") + ". Choose Download file to save it.", "success"); renderResult(item); return;
      }
      const rawBody = await response.text();
      let payload;
      try { payload = JSON.parse(rawBody); } catch {
        const plainUrl = safeUrl(rawBody.trim());
        if (plainUrl) payload = { url: plainUrl };
        else throw new Error("Beltah Tech received an unreadable response. Please try again.");
      }
      if (payload?.success === false || payload?.status === "error") {
        throw new Error(payload.message || payload.error || "Beltah Tech could not process this request.");
      }
      const candidates = collectDownloadCandidates(payload);
      const selected = candidates.find(item => item.format.includes(format)) ||
        candidates.find(item => new RegExp("\\." + format + "(?:$|[?#])","i").test(item.url)) || candidates[0];
      if (!selected) {
        const message = payload?.message || payload?.error || "Beltah Tech could not find a downloadable file for this request.";
        throw new Error(message);
      }
      const title = selected.title || payload.title || payload.data?.title || "beltah-" + format;
      let size = Number(payload.size || payload.fileSize || payload.filesize || payload.contentLength || payload.data?.size || payload.data?.fileSize || 0);
      if (!Number.isFinite(size) || size <= 0) size = 0;
      if (!size) {
        try { const head = await fetch(selected.url, { method: "HEAD", mode: "cors", credentials: "omit", signal: controller.signal }); if (head.ok) size = Number(head.headers.get("content-length") || 0); } catch (headError) { if (headError.name === "AbortError") throw headError; }
      }
      const item = { title, url: selected.url, mime: format === "mp3" ? "audio/mpeg" : "video/mp4", size, kind: format === "mp3" ? "audio" : "video", format, query };
      finishSearchProgress(); renderResult(item);
    } catch (err) {
      if (err.name === "AbortError") { stopSearchProgress(); $("statusPanel").classList.add("hidden"); return; }
      stopSearchProgress();
      setStatus(err.message || "Beltah Tech could not process this request.", "error");
    }
  }
  async function startDownload(item) {
    const url = safeUrl(item.url) || (String(item.url || "").startsWith("blob:") ? item.url : ""); if (!url) return toast("Invalid download URL.");
    state.downloadController?.abort(); const controller = new AbortController(); state.downloadController = controller;
    const entry = { id: Date.now(), url, title: item.title || "beltah-media", ext: extensionFor(url) || (item.format === "mp3" ? "mp3" : item.format === "mp4" ? "mp4" : "bin"), status: "Downloading" };
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
    $("cfgAndroidUrl").value = state.config.releases.android || ""; $("cfgWindowsUrl").value = state.config.releases.windows || "";
    $("cfgMacosUrl").value = state.config.releases.macos || ""; $("cfgLinuxUrl").value = state.config.releases.linux || "";
    $("diagnosticsBox").textContent = "Device: " + detectOS() + " | Online: " + navigator.onLine + " | History: " + state.history.length + " | Queue: " + state.queue.length + " | Media engine: Beltah Tech";
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
      state.config = { releases: {
        android: validOptionalUrl($("cfgAndroidUrl").value, "Android URL"), windows: validOptionalUrl($("cfgWindowsUrl").value, "Windows URL"),
        macos: validOptionalUrl($("cfgMacosUrl").value, "macOS URL"), linux: validOptionalUrl($("cfgLinuxUrl").value, "Linux URL")
      }};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config)); syncReleaseLinks(); fillConfigForm(); toast("Release links saved on this device.");
    } catch (err) { toast(err.message); }
  }
  function exportConfig() {
    const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "beltah-downloader-config.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function importConfig(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()); state.config = { releases: { ...DEFAULT_CONFIG.releases, ...(parsed.releases || {}) }}; fillConfigForm(); saveConfig(); }
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
  // Branded launch screen: hold for three seconds, then reveal the workspace.
  const launchSplash = $("launchSplash");
  if (launchSplash) window.setTimeout(() => {
    launchSplash.classList.add("launch-splash-hide");
    window.setTimeout(() => launchSplash.remove(), 500);
  }, 3000);

  // Installed PWA update handling: detect a new service worker and offer a one-tap refresh.
  if ("serviceWorker" in navigator) {
    let isReloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isReloadingForUpdate) return;
      isReloadingForUpdate = true;
      window.location.reload();
    });
    const revealUpdateBanner = () => $("appUpdateBanner")?.classList.remove("hidden");
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await registration.update();
        if (registration.waiting && navigator.serviceWorker.controller) revealUpdateBanner();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) revealUpdateBanner();
          });
        });
        $("applyAppUpdateBtn")?.addEventListener("click", async () => {
          try {
            await registration.update();
            if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
            else toast("No new update is available right now.");
          } catch (error) {
            toast("Could not check for updates. Please try again.");
          }
        });
      } catch (error) {
        console.warn("Beltah Tech update check failed:", error);
      }
    });
  }
})();