const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const FMT={audio:[["opus","Opus - high quality, ~4 MB/track",4],["mp3","MP3 320kbps - standard, ~8-10 MB/track",9],["flac","FLAC - lossless, ~30 MB/track",30],["m4a","M4A - good quality, ~6 MB/track",6]],
video:[["4k","4K MP4 - Ultra HD, ~500 MB/10 min",500],["1080p","1080p MP4 - High HD, ~150 MB/10 min",150],["720p","720p MP4 - Standard HD, ~70 MB/10 min",70]]};
let media="audio",since=0,api=null,count=0,plName="Playlist";
const fmtOpts=()=>{$("#fmt").innerHTML=FMT[media].map(f=>`<option value="${f[0]}">${f[1]}</option>`).join("");showEst()};
const size=mb=>mb>=1024?(mb/1024).toFixed(1)+" GB":Math.round(mb)+" MB";
function showEst(){const f=FMT[media].find(x=>x[0]===$("#fmt").value);
 $("#est").innerHTML=count>1?`${count} tracks in "${plName}" - estimated total <b>${size(count*f[2])}</b>`:"";}
async function checkDeps(){const d=await api.deps();let ok=true;
 for(const k in d){$("#d-"+k).className=d[k]?"ok":"";ok=ok&&d[k];}
 $("#lock").classList.toggle("off",ok);$("#lockhint").textContent=ok?"":"Missing tools. Install them, then this list updates by itself.";}
async function refreshPls(){const l=await api.playlists();
 $("#pls").innerHTML=l.length?l.map(p=>`<div class="pl"><div><b>${p.name}</b> <small>${p.path}</small><small>Last synced: ${p.last_synced||"never"} - ${p.fmt}</small></div>
 <div><button class="sm" onclick="api.sync(${p.id})">Sync</button><button class="sm ghost" onclick="rm(${p.id})">Remove</button></div></div>`).join(""):
 "<p class='hint'>No playlists yet. Tick 'Keep this playlist in the Vault' on the Quick download tab.</p>";}
window.rm=async id=>{await api.remove(id);refreshPls()};
async function poll(){const s=await api.state(since);since=s.next;
 if(s.logs.length){const c=$("#console");c.textContent+=s.logs.join("\n")+"\n";c.scrollTop=c.scrollHeight;}
 const p=s.progress;$("#fill").style.width=p.pct+"%";
 $("#pinfo").textContent=s.busy?`${p.label} - ${p.pct.toFixed(0)}%  ETA ${p.eta||"-"}  ${p.speed||"-"}  ${p.size||""}  Track ${p.item} of ${p.total}`:"Idle";
 ["#go","#syncall"].forEach(i=>$(i).disabled=s.busy);}
let t;$("#url").addEventListener("input",()=>{clearTimeout(t);count=0;showEst();const u=$("#url").value.trim();
 if(!/^https?:\/\//.test(u)||!/list=|playlist|\/sets\//.test(u))return;
 t=setTimeout(async()=>{$("#est").textContent="Counting tracks…";const r=await api.estimate(u);count=r.count;plName=r.title;showEst();},600)});
window.addEventListener("pywebviewready",async()=>{api=pywebview.api;
 $("#dest").value=(await api.settings()).dest;fmtOpts();await checkDeps();refreshPls();
 setInterval(checkDeps,2500);setInterval(poll,500);
 $("#install").onclick=()=>api.install_deps();
 $("#pick").onclick=async()=>{const r=await api.pick_folder();if(r)$("#dest").value=r};
 $("#fmt").onchange=showEst;
 $$(".seg button").forEach(b=>b.onclick=()=>{media=b.dataset.m;$$(".seg button").forEach(x=>x.classList.toggle("on",x===b));fmtOpts()});
 $$("nav button").forEach(b=>b.onclick=()=>{$$("nav button").forEach(x=>x.classList.toggle("on",x===b));
  $$(".tab").forEach(x=>x.classList.toggle("on",x.id===b.dataset.tab));if(b.dataset.tab==="vault")refreshPls()});
 $("#go").onclick=async()=>{const u=$("#url").value.trim();if(!u)return $("#est").textContent="Paste a link first.";
  const tr=$("#track").checked,d=$("#dest").value;
  const ok=await api.download(u,tr?d+"/"+plName.replace(/[\\/:*?"<>|]/g,"_"):d,media,$("#fmt").value,tr,plName);
  if(!ok)$("#est").textContent="A job is already running."};
 $("#syncall").onclick=async()=>{await api.sync_all()};
 $("#ctoggle").onclick=()=>$("#console").classList.toggle("open");
 setInterval(()=>{if(!$("#vault").classList.contains("on"))return;refreshPls()},5000);});
