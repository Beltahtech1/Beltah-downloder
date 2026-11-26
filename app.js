const $=s=>document.querySelector(s);
function readStoredJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const state={history:readStoredJson("beltah-history",[]),queue:[],deferredPrompt:null,config:readStoredJson("beltah-config",{resolverUrl:"",resolverPath:"/api/resolve"}),adminUnlocked:false};
const form=$("#downloadForm"),urlInput=$("#mediaUrl"),statusArea=$("#statusArea"),results=$("#results"),startBtn=$("#startBtn");
$("#year").textContent=new Date().getFullYear();
function toast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function platform(url){try{const h=new URL(url).hostname.replace(/^www\./,"");if(h.includes("youtube")||h==="youtu.be")return"YouTube";if(h.includes("instagram"))return"Instagram";if(h.includes("tiktok"))return"TikTok";if(h==="x.com"||h==="twitter.com")return"X / Twitter";if(h.includes("facebook"))return"Facebook";if(h.includes("vimeo"))return"Vimeo";return"Direct / other"}catch{return"Waiting for link"}}
function isDirect(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)&&/\.(mp4|m4a|m4v|mp3|webm|mov|wav|ogg|oga|opus|ogv|pdf|zip|png|jpe?g)$/.test(u.pathname.toLowerCase())}catch{return false}}
function mediaKind(url){try{const path=new URL(url).pathname.toLowerCase();if(/\.(mp4|m4v|webm|mov|ogv)$/.test(path))return "video";if(/\.(mp3|m4a|wav|ogg|oga|opus)$/.test(path))return "audio";return "file"}catch{return "file"}}
function renderHistory(){const el=$("#historyList");if(!state.history.length){el.className="empty-state";el.textContent="No recent links yet.";return}el.className="";el.innerHTML=state.history.slice(0,6).map((x,i)=>'<div class="history-item"><span title="'+escapeHtml(x.url)+'">'+escapeHtml(x.platform)+' · '+escapeHtml(x.url)+'</span><button data-history="'+i+'">Reuse</button></div>').join("");el.querySelectorAll("[data-history]").forEach(b=>b.onclick=()=>{urlInput.value=state.history[Number(b.dataset.history)].url;detect()})}
function renderQueue(){const el=$("#queueList");$("#queueCount").textContent=state.queue.length;if(!state.queue.length){el.className="empty-state";el.textContent="Your downloads will appear here.";return}el.className="";el.innerHTML=state.queue.slice(0,5).map(x=>'<div class="queue-item"><span>↧ '+escapeHtml(x.name)+'</span><small>'+x.status+'</small></div>').join("")}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function detect(){const p=platform(urlInput.value.trim());$("#platformBadge").textContent=p;return p}
urlInput.addEventListener("input",detect);$("#clearUrl").onclick=()=>{urlInput.value="";detect();urlInput.focus()};detect();renderHistory();renderQueue();
function setStatus(text,loading=false,type=""){statusArea.classList.toggle("loading",loading);statusArea.classList.toggle("error",type==="error");statusArea.classList.toggle("success",type==="success");statusArea.innerHTML='<span class="status-dot"></span><span>'+escapeHtml(text)+'</span>'}
function remember(url,p){state.history=[{url,platform:p,at:Date.now()},...state.history.filter(x=>x.url!==url)].slice(0,20);localStorage.setItem("beltah-history",JSON.stringify(state.history));renderHistory()}
function prettyBytes(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return "Size not supplied";const units=["B","KB","MB","GB","TB"];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),units.length-1);return (n/Math.pow(1024,i)).toFixed(i?1:0)+" "+units[i]}
async function findMedia(url,p){
 if(!isDirect(url)){const provider=p==="Direct / other"?"This URL is not a recognised direct media file.":"This "+p+" page is not a direct media file.";throw new Error(provider+" Platform extraction is not enabled. Use a direct file URL from a source you are authorised to access.");}
 const path=new URL(url).pathname;const filename=decodeURIComponent(path.split("/").pop()||"Media file");const ext=(filename.split(".").pop()||"file").toUpperCase();let size="Size not supplied";let mime="Source format · "+ext;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2500);
 try{const response=await fetch(url,{method:"HEAD",mode:"cors",signal:controller.signal});if(response.ok){const length=response.headers.get("content-length");if(length)size=prettyBytes(length);const type=response.headers.get("content-type");if(type)mime=type.split(";")[0]+" · "+ext}}catch{/* CORS or unsupported HEAD: keep URL-based hints. */}finally{clearTimeout(timer)}
 const media=mediaKind(url),choice=$("#formatSelect").value;
 if(choice==="video"&&media!=="video")throw new Error("Video filter selected, but the URL is not a supported video file. Choose Auto detect or paste a video URL.");
 if(choice==="audio"&&media!=="audio")throw new Error("Audio filter selected, but the URL is not a supported audio file. Choose Auto detect or paste an audio URL.");
 return [{title:filename,url,type:mime,size}];
}
form.addEventListener("submit",async e=>{
 e.preventDefault();const url=urlInput.value.trim();if(!url)return;let parsed;try{parsed=new URL(url)}catch{return setStatus("Enter a complete, valid URL including https://.",false,"error")}
 if(!/^https?:$/.test(parsed.protocol))return setStatus("Only HTTP and HTTPS links are supported.",false,"error");
 const p=detect();remember(url,p);startBtn.disabled=true;startBtn.querySelector("span").textContent="Checking…";results.classList.remove("hidden");results.innerHTML='<div class="loading-skeleton" aria-label="Checking media"></div><div class="loading-skeleton" aria-hidden="true"></div>';setStatus("Checking file type and source metadata…",true);
 try{
  const items=await findMedia(url,p);setStatus("Direct file identified. Preview is ready.",false,"success");
  results.innerHTML=items.map(x=>{const media=mediaKind(x.url);const player=media==="video"?' <div class="media-preview"><div class="preview-label"><i></i> In-page video player</div><video controls playsinline preload="metadata" src="'+escapeHtml(x.url)+'">Your browser does not support in-page video playback.</video><div class="media-state" aria-live="polite">Player ready · press play to stream</div></div>':media==="audio"?' <div class="media-preview"><div class="preview-label"><i></i> In-page audio player</div><audio controls preload="metadata" src="'+escapeHtml(x.url)+'">Your browser does not support in-page audio playback.</audio><div class="media-state" aria-live="polite">Player ready · press play to stream</div></div>':"";
   return '<div class="result-card '+(player?'has-preview':'')+'"><div class="file-icon">'+(media==="audio"?"♫":media==="video"?"▶":"⇩")+'</div><div class="result-info"><strong>'+escapeHtml(x.title)+'</strong><small>'+escapeHtml(x.type)+'</small><div class="result-meta"><span>'+escapeHtml(x.size)+'</span><span>Original file · no conversion</span></div></div><a class="download-link" href="'+escapeHtml(x.url)+'" target="_blank" rel="noopener" download>Open / save ↗</a>'+player+'</div>'
  }).join("");
  results.querySelectorAll("video,audio").forEach(el=>{const label=el.parentElement.querySelector(".media-state");el.addEventListener("playing",()=>{label.textContent="Streaming · playback active";setStatus("Streaming direct media in this page.",false,"success")});el.addEventListener("waiting",()=>{label.textContent="Buffering from source…";setStatus("Buffering media from source…",true)});el.addEventListener("error",()=>{label.textContent="Playback unavailable · source may block browser playback or use an unsupported codec.";setStatus("This source cannot be played in the current browser.",false,"error")});el.addEventListener("loadedmetadata",()=>{if(Number.isFinite(el.duration))label.textContent="Duration · "+Math.floor(el.duration/60)+":"+String(Math.floor(el.duration%60)).padStart(2,"0")+" · ready"})});
  items.forEach(x=>state.queue.unshift({name:x.title,status:"Ready"}));renderQueue();
 }catch(err){
  if(p==="YouTube"){
   results.innerHTML='<div class="fallback-card"><div class="fallback-top"><span class="fallback-mark">▶</span><div><strong>Use YTDown as your YouTube fallback</strong><p>The built-in direct-file check could not resolve this YouTube page. Continue with the external provider; downloads are handled on its website.</p></div></div><div class="fallback-actions"><a class="fallback-open" href="https://app.ytdown.to/en38/" target="_blank" rel="noopener noreferrer">Open YTDown ↗</a><button class="fallback-copy" id="copyYtUrl" type="button">Copy video link</button></div><small class="fallback-note">Paste your copied YouTube link into YTDown. Beltah Downloader does not send your link to an undocumented third-party API.</small></div>';
   const copyButton=$("#copyYtUrl");
   copyButton?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(url);toast("YouTube link copied. Paste it into YTDown.")}catch{toast("Copy is unavailable here. Copy the link from the address field.")}});
   setStatus("Built-in check completed. YTDown is available as an external fallback.",false,"success");
  }else{
   results.innerHTML='<div class="result-error">'+escapeHtml(err.message)+'</div>';
   setStatus(err.message,false,"error");
  }
  results.classList.remove("hidden");
 }
 finally{startBtn.disabled=false;startBtn.querySelector("span").textContent="Find media"}
});
$("#clearHistory").onclick=()=>{state.history=[];localStorage.removeItem("beltah-history");renderHistory();toast("History cleared.")};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredPrompt=e;$("#installBtn").classList.add("ready")});
$("#installBtn").onclick=async()=>{if(state.deferredPrompt){state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null}else if(/iphone|ipad|ipod/i.test(navigator.userAgent)){toast("In Safari, tap Share → Add to Home Screen.")}else{toast("Use your browser menu and choose Install app or Add to Home Screen.")}};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
const dialog=$("#adminDialog");$("#adminOpen").onclick=()=>dialog.showModal();
$("#adminLogin").addEventListener("submit",async e=>{e.preventDefault();$("#adminError").textContent="Checking…";try{const r=await fetch("/api/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({passcode:$("#adminPass").value})});const data=await r.json();if(!r.ok)throw new Error(data.error||"Authentication failed");state.adminUnlocked=true;$("#adminLogin").classList.add("hidden");$("#adminSettings").classList.remove("hidden");$("#resolverUrl").value=state.config.resolverUrl||"";$("#resolverPath").value=state.config.resolverPath||"/api/resolve";$("#adminError").textContent=""}catch(err){$("#adminError").textContent=err.message}});
$("#saveConfig").onclick=()=>{const resolverUrl=$("#resolverUrl").value.trim();if(!resolverUrl)return toast("Add your authorized resolver URL first.");try{const u=new URL(resolverUrl);if(!/^https?:$/.test(u.protocol))throw 0}catch{return toast("Enter a valid resolver base URL.")}state.config={resolverUrl,resolverPath:$("#resolverPath").value.trim()||"/api/resolve"};localStorage.setItem("beltah-config",JSON.stringify(state.config));toast("Configuration saved on this device.")};
$("#adminLogout").onclick=()=>{state.adminUnlocked=false;$("#adminPass").value="";$("#adminSettings").classList.add("hidden");$("#adminLogin").classList.remove("hidden");dialog.close()};
