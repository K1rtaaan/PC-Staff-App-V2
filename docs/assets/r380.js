/* 3.8.0 (Pranav pack): pending-sync badge · dinner rating · chef/admin ratings · daily boat manifest · HOD dashboard · install helper.
   Loaded after r370.js. Server: apps-script/Ops38.gs. */
/* ---------- install helper: catch the Android prompt as early as possible ---------- */
let r38InstallEvt = null;
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); r38InstallEvt = e; if (state && state.tab === 'home') r38PaintInstall(); });
window.addEventListener('appinstalled', function(){ r38InstallEvt = null; try { localStorage.setItem('pcr_a2hs_done', '1'); } catch (e) {} r38PaintInstall(); });
function r38Standalone(){ return (typeof a33Standalone === 'function') ? a33Standalone() : !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
function r38Ios(){ return (typeof a33IsIOS === 'function') ? a33IsIOS() : /iPad|iPhone|iPod/.test(navigator.userAgent || ''); }
function r38Ls(k, v){ try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function r38PushAsk(){ return typeof a33Supported === 'function' && a33Supported() && typeof Notification !== 'undefined' && Notification.permission === 'default'; }
function r38InstallHtml(){
  if (state.demo && !/[?&]a2hs=1/.test(location.search)) return '';
  const done = r38Ls('pcr_a2hs_done') === '1' || r38Standalone();
  if (done) { // installed → one nudge for notifications
    if (!r38PushAsk() || r38Ls('pcr_a2hs_push_seen') === '1') return '';
    return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="r38-install"><p class="text-sm font-semibold text-slate-100"><i class="fa-solid fa-bell text-teal-400 mr-1"></i>Turn on notifications?</p>'+
      '<p class="text-xs text-slate-300">Get told when your meal, leave or boat booking is approved or changed.</p><div class="flex gap-2">'+
      '<button type="button" id="r38-push-on" class="btn-primary flex-1 rounded-xl py-2 text-sm font-semibold text-white">Turn on</button>'+
      '<button type="button" id="r38-push-no" class="flex-1 rounded-xl py-2 text-sm text-slate-300 border border-slate-600">Not now</button></div></section>';
  }
  if (r38Ls('pcr_a2hs_dismissed') === '1') return '';
  const ios = r38Ios();
  if (!ios && !r38InstallEvt && !/[?&]a2hs=1/.test(location.search)) return ''; // Android/desktop: only when the browser offers install
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0 border border-teal-500/30" id="r38-install">'+
    '<div class="flex items-start gap-2"><i class="fa-solid fa-mobile-screen-button text-teal-300 mt-0.5"></i><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-slate-100">Add the app to your Home Screen</p>'+
    '<p class="text-xs text-slate-300">Opens like a normal app, faster, and works for notifications.</p></div>'+
    '<button type="button" id="r38-inst-x" class="text-slate-400 text-xs px-1 min-h-[32px]" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button></div>'+
    (ios ? '<ol class="text-xs text-slate-200 list-decimal pl-5 space-y-1" id="r38-ios-steps"><li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> <i class="fa-solid fa-arrow-up-from-bracket"></i> at the bottom.</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open the app from the new icon.</li></ol>'+
      '<button type="button" id="r38-inst-done" class="w-full rounded-xl py-2 text-sm text-teal-200 border border-teal-500/40">I’ve added it</button>'
     : '<button type="button" id="r38-inst-go" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white"><i class="fa-solid fa-download mr-1"></i>Install app</button>')+'</section>';
}
function r38BindInstall(){
  const x = $('#r38-inst-x'); if (x) x.onclick = function(){ r38Ls('pcr_a2hs_dismissed', '1'); r38PaintInstall(); };
  const d = $('#r38-inst-done'); if (d) d.onclick = function(){ r38Ls('pcr_a2hs_done', '1'); r38PaintInstall(); };
  const g = $('#r38-inst-go'); if (g) g.onclick = async function(){
    if (!r38InstallEvt) { toast('Use your browser menu → Install app / Add to Home screen','info'); return; }
    r38InstallEvt.prompt(); let ch = null; try { ch = await r38InstallEvt.userChoice; } catch (e) {}
    r38InstallEvt = null; if (ch && ch.outcome === 'accepted') r38Ls('pcr_a2hs_done', '1'); else r38Ls('pcr_a2hs_dismissed', '1');
    r38PaintInstall();
  };
  const on = $('#r38-push-on'); if (on) on.onclick = async function(){ r38Ls('pcr_a2hs_push_seen', '1'); const ok = typeof a33Enable === 'function' && await a33Enable(true); if (ok) toast('Notifications are on for this phone','success'); r38PaintInstall(); };
  const no = $('#r38-push-no'); if (no) no.onclick = function(){ r38Ls('pcr_a2hs_push_seen', '1'); r38PaintInstall(); };
}
function r38PaintInstall(){
  if (!state.user || state.tab !== 'home') return;
  const html = r38InstallHtml(), el = $('#r38-install');
  if (el) { if (html) el.outerHTML = html; else el.remove(); }
  else if (html) { const h = $('#r38-home'); if (h) h.insertAdjacentHTML('afterbegin', html); }
  r38BindInstall();
}

/* ---------- pending sync badge (offline queue) ---------- */
function r38PaintSync(){
  if (typeof queueItems !== 'function') return;
  let n = 0, f = 0; try { n = queueItems().length; f = (typeof queueFailed === 'function' ? queueFailed().length : 0); } catch (e) {}
  let b = document.getElementById('r38-sync');
  if (!state.user || (!n && !f)) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'r38-sync';
    b.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:50%;transform:translateX(-50%);z-index:60;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.4)';
    b.onclick = function(){ if (navigator.onLine === false) toast('Offline — it will send by itself when you reconnect','info'); else if (typeof flushQueue === 'function') flushQueue('badge'); };
    document.body.appendChild(b); }
  b.style.background = f && !n ? '#7f1d1d' : '#78350f'; b.style.color = f && !n ? '#fecdd3' : '#fde68a'; b.style.border = '1px solid ' + (f && !n ? '#f43f5e' : '#f59e0b');
  b.innerHTML = n ? '<i class="fa-solid fa-cloud-arrow-up mr-1"></i>' + n + ' pending sync' + (navigator.onLine === false ? ' · offline' : '') : '<i class="fa-solid fa-circle-xmark mr-1"></i>' + f + ' didn’t send — see Home';
}
setInterval(r38PaintSync, 1500);
window.addEventListener('online', function(){ setTimeout(function(){ if (typeof flushQueue === 'function') flushQueue('online'); r38PaintSync(); }, 800); });
window.addEventListener('offline', r38PaintSync);
window.addEventListener('storage', r38PaintSync);

/* ---------- dinner rating (Home, the morning after) ---------- */
async function r38LoadRating(){
  if (!state.user || v3IsSuper() || state.demo && !/[?&]rate=1/.test(location.search)) return;
  let r = null; try { r = await api('getDinnerRatingPrompt', {}); } catch (e) {}
  const pr = r && r.success && r.data && r.data.prompt; const h = $('#r38-home');
  if (!pr || !h || state.tab !== 'home' || $('#r38-rate')) return;
  h.insertAdjacentHTML('beforeend', '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="r38-rate"><p class="text-sm font-semibold text-slate-100"><i class="fa-solid fa-utensils text-teal-400 mr-1"></i>How was last night’s dinner?</p>'+
    '<p class="text-xs text-slate-300">'+esc(pr.dish)+' · '+esc(r36FmtDate ? r36FmtDate(pr.date) : pr.date)+'</p>'+
    '<div class="flex gap-2"><button type="button" class="r38-rv flex-1 rounded-xl py-2.5 text-xl border border-emerald-500/40 bg-emerald-500/10" data-v="up" aria-label="Good">👍</button>'+
    '<button type="button" class="r38-rv flex-1 rounded-xl py-2.5 text-xl border border-rose-500/40 bg-rose-500/10" data-v="down" aria-label="Not good">👎</button></div>'+
    '<input id="r38-rc" maxlength="300" class="w-full rounded-xl bg-slate-900/60 border border-slate-700 px-3 py-2 text-xs text-slate-100" placeholder="Comment for the chef (optional)"></section>');
  $$('.r38-rv').forEach(function(b){ b.onclick = async function(){
    $$('.r38-rv').forEach(function(x){ x.disabled = true; });
    const d = await v3Call('rateDinner', { date: pr.date, rating: b.dataset.v, comment: ($('#r38-rc') || {}).value || '', clientRequestId: newRequestId() });
    const el = $('#r38-rate'); if (!el) return;
    if (d) el.innerHTML = '<p class="text-sm text-teal-200"><i class="fa-solid fa-circle-check mr-1"></i>Thanks — the chef will see it.</p>'; else $$('.r38-rv').forEach(function(x){ x.disabled = false; });
  }; });
}
/* ---------- chef / admin: per-dish ratings ---------- */
async function r38OpenRatings(){
  openModal('<div class="space-y-3 min-w-0" id="r38-ratings"><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-thumbs-up mr-1"></i>Dinner ratings · last 30 days</h3><div id="r38-rl">'+v3Loading()+'</div>'+
    '<button type="button" onclick="closeModal()" class="w-full rounded-xl py-2 text-sm text-slate-300 border border-slate-600">Close</button></div>');
  const d = await v3Call('getDishRatings', { days: 30 }); const host = $('#r38-rl'); if (!host) return;
  const list = (d && d.dishes) || [];
  if (!list.length) { host.innerHTML = v3Empty('No ratings yet. Staff are asked the morning after their dinner.'); return; }
  host.innerHTML = '<p class="text-[11px] text-slate-400">'+d.ratings+' ratings since '+esc(d.from)+'</p>'+list.map(function(o){
    return '<article class="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 space-y-1 min-w-0 r38-dish"><div class="flex items-center gap-2"><p class="text-sm text-slate-100 font-medium flex-1 min-w-0 truncate">'+esc(o.dish)+'</p>'+
      '<span class="text-xs text-emerald-300">👍 '+o.up+'</span><span class="text-xs text-rose-300">👎 '+o.down+'</span></div>'+
      '<div class="r34-bar" style="height:6px;border-radius:4px;background:rgba(244,63,94,.35)"><div style="height:6px;border-radius:4px;width:'+o.pct+'%;background:#10b981"></div></div>'+
      o.comments.map(function(c){ return '<p class="text-[11px] text-slate-300">'+(c.rating==='down'?'👎':'👍')+' '+esc(c.text)+' <span class="text-slate-500">· '+esc(c.by)+' '+esc(c.date)+'</span></p>'; }).join('')+'</article>';
  }).join('');
}
/* ---------- daily boat manifest (boat manager / admin) ---------- */
function r38CanManifest(){ return v3IsSuper() || v3Has('admin') || v3Has('boat_manager') || v3Has('boat_captain'); }
async function r38OpenManifest(date){
  date = date || fijiDateString();
  openModal('<div class="space-y-3 min-w-0" id="r38-man"><div class="flex items-center gap-2"><h3 class="font-semibold text-slate-100 flex-1"><i class="fa-solid fa-list-check mr-1"></i>Boat manifest</h3>'+
    '<input type="date" id="r38-md" value="'+esc(date)+'" class="rounded-lg bg-slate-900/60 border border-slate-700 px-2 py-1 text-xs text-slate-100"></div><div id="r38-ml">'+v3Loading()+'</div>'+
    '<div class="grid grid-cols-3 gap-2"><button type="button" id="r38-mprint" class="rounded-xl py-2 text-xs text-teal-200 border border-teal-500/40"><i class="fa-solid fa-print mr-1"></i>Print / PDF</button>'+
    '<button type="button" id="r38-mshare" class="rounded-xl py-2 text-xs text-teal-200 border border-teal-500/40"><i class="fa-solid fa-share-nodes mr-1"></i>Share</button>'+
    '<button type="button" onclick="closeModal()" class="rounded-xl py-2 text-xs text-slate-300 border border-slate-600">Close</button></div></div>');
  $('#r38-md').onchange = function(){ r38OpenManifest(this.value); };
  const d = await v3Call('getBoatManifestDay', { date: date }); const host = $('#r38-ml'); if (!host || !d) return;
  const runs = d.runs || []; state._r38Man = d;
  const st = function(s){ return { confirmed: 'Confirmed', pending_admin: 'Waiting for boat admin', pending_hod: 'Waiting for HOD', booked: 'Booked', active: 'Booked' }[s] || s; };
  host.innerHTML = runs.length ? runs.map(function(r){
    return '<article class="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 space-y-1 min-w-0 r38-run"><p class="text-sm text-slate-100 font-medium">'+esc(r.title)+(r.time?' · '+esc(r.time):'')+'</p>'+
      '<p class="text-[11px] text-slate-400">'+r.passengers.length+' passenger'+(r.passengers.length===1?'':'s')+' · '+r.seats+' seat'+(r.seats===1?'':'s')+(r.capacity?' of '+r.capacity:'')+'</p>'+
      (r.passengers.length ? '<table class="w-full text-[11px] text-slate-200"><tbody>'+r.passengers.map(function(x){ return '<tr class="border-t border-slate-800"><td class="py-1 pr-1">'+esc(x.name)+(x.seats>1?' ×'+x.seats:'')+'</td><td class="pr-1 text-slate-400">'+esc(x.department||'')+'</td><td class="pr-1 text-slate-400">'+esc(x.from)+' → '+esc(x.to)+'</td><td class="'+(x.status==='confirmed'||x.status==='booked'||x.status==='active'?'text-emerald-300':'text-amber-300')+'">'+esc(st(x.status))+'</td></tr>'; }).join('')+'</tbody></table>' : '')+'</article>';
  }).join('') : v3Empty('No runs on this day.');
  $('#r38-mprint').onclick = function(){ r38PrintManifest(d, st); };
  $('#r38-mshare').onclick = async function(){
    const txt = 'Boat manifest ' + d.date + '\n' + runs.filter(function(r){ return r.passengers.length; }).map(function(r){ return '\n' + r.title + (r.time ? ' · ' + r.time : '') + ' (' + r.seats + ')\n' + r.passengers.map(function(x, i){ return (i + 1) + '. ' + x.name + (x.department ? ' — ' + x.department : '') + ' · ' + st(x.status); }).join('\n'); }).join('\n');
    try { if (navigator.share) { await navigator.share({ title: 'Boat manifest ' + d.date, text: txt }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(txt); toast('Manifest copied — paste it into WhatsApp','success'); } catch (e2) { toast('Could not share on this device','error'); }
  };
}
function r38PrintManifest(d, st){
  const rows = (d.runs || []).map(function(r){ return '<h2>' + esc(r.title) + (r.time ? ' · ' + esc(r.time) : '') + ' <small>(' + r.seats + ' seats' + (r.capacity ? ' of ' + r.capacity : '') + ')</small></h2>' +
    (r.passengers.length ? '<table><tr><th>#</th><th>Name</th><th>Department</th><th>From → To</th><th>Status</th><th>✓</th></tr>' + r.passengers.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.name) + (x.seats > 1 ? ' ×' + x.seats : '') + '</td><td>' + esc(x.department || '') + '</td><td>' + esc(x.from) + ' → ' + esc(x.to) + '</td><td>' + esc(st(x.status)) + '</td><td></td></tr>'; }).join('') + '</table>' : '<p>No passengers.</p>'); }).join('');
  const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print','error'); return; }
  w.document.write('<!doctype html><title>Boat manifest ' + esc(d.date) + '</title><style>body{font:13px sans-serif;margin:24px}h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}small{color:#555;font-weight:normal}</style><h1>Paradise Cove · Boat manifest · ' + esc(d.date) + '</h1>' + rows + '<p style="margin-top:16px;color:#666">Printed ' + new Date().toLocaleString() + '</p><script>setTimeout(function(){print()},300)<\/script>');
  w.document.close();
}
/* ---------- HOD dashboard (Home) ---------- */
function r38DashAllowed(){ return !v3IsSuper() && (v3Has('admin') || v3Has('hod') || v3IsAsst()); }
async function r38LoadDash(dept){
  const h = $('#r38-home'); if (!h || !r38DashAllowed() || state.demo) return; // demo has no Ops38 server
  const admin = v3Has('admin');
  dept = dept || state._r38Dept || (admin ? '' : (state.user.department || ''));
  if (admin && !dept) dept = state.user.department || '';
  let el = $('#r38-dash'); if (!el) { h.insertAdjacentHTML('beforeend', '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="r38-dash">'+v3Title('fa-people-group','My team today')+v3Loading()+'</section>'); el = $('#r38-dash'); }
  let r = null; try { r = await api('getHodDashboard', { department: dept }); } catch (e) {}
  el = $('#r38-dash'); if (!el || state.tab !== 'home') return;
  if (!r || !r.success) { el.innerHTML = v3Title('fa-people-group','My team today') + v3Empty(esc((r && r.error) || 'Couldn’t load — pull to refresh')); return; }
  const d = r.data; state._r38Dept = d.department;
  const depts = (typeof pcrDepartments === 'function' ? pcrDepartments() : (JSON.parse(r38Ls('pcr_depts_340') || '[]'))) || [];
  const pick = admin ? '<select id="r38-dp" class="rounded-lg bg-slate-900/60 border border-slate-700 px-2 py-1 text-xs text-slate-100 max-w-[45%]">'+depts.map(function(x){ return '<option'+(x===d.department?' selected':'')+'>'+esc(x)+'</option>'; }).join('')+(depts.indexOf(d.department)<0?'<option selected>'+esc(d.department)+'</option>':'')+'</select>' : '<span class="text-[11px] text-slate-400">'+esc(d.department)+'</span>';
  const sh = function(list){ if (!list.length) return '<p class="text-[11px] text-slate-500">No roster for this day.</p>'; return list.map(function(x){ return '<p class="text-[11px] '+(x.off?'text-slate-500':'text-slate-200')+'">'+esc(x.name)+' · '+(x.off?esc(x.note):esc((x.start||'')+(x.end?'–'+x.end:'')))+'</p>'; }).join(''); };
  const mv = function(list){ return list.length ? list.map(function(x){ return '<p class="text-[11px] text-slate-200">'+esc(x.name)+' · '+esc(x.boat)+' · '+esc(x.route)+' <span class="text-slate-500">'+esc(x.status)+'</span></p>'; }).join('') : '<p class="text-[11px] text-slate-500">None</p>'; };
  const box = function(id, title, n, inner){ return '<details class="rounded-xl border border-slate-700/60 bg-slate-900/40 p-2 min-w-0" id="'+id+'"><summary class="text-xs text-slate-100 cursor-pointer">'+title+(n!==''?' <span class="text-teal-300">'+n+'</span>':'')+'</summary><div class="pt-1 space-y-0.5">'+inner+'</div></details>'; };
  const onT = d.shifts.today.filter(function(x){ return !x.off; }).length, onM = d.shifts.tomorrow.filter(function(x){ return !x.off; }).length;
  el.innerHTML = v3Title('fa-people-group','My team today', pick) +
    '<div class="grid grid-cols-3 gap-2 text-center"><div class="rounded-xl bg-slate-900/50 p-2"><p class="text-lg text-slate-100 font-semibold">'+onT+'</p><p class="text-[10px] text-slate-400">on shift today</p></div>'+
    '<div class="rounded-xl bg-slate-900/50 p-2"><p class="text-lg text-amber-200 font-semibold">'+d.dinner.notOrdered.length+'</p><p class="text-[10px] text-slate-400">no dinner yet</p></div>'+
    '<div class="rounded-xl bg-slate-900/50 p-2"><p class="text-lg text-sky-200 font-semibold">'+(d.approvals.leave + d.approvals.resortBoat)+'</p><p class="text-[10px] text-slate-400">to approve</p></div></div>'+
    box('r38-d-st','On shift today', onT, sh(d.shifts.today)) + box('r38-d-sm','On shift tomorrow', onM, sh(d.shifts.tomorrow)) +
    box('r38-d-din','Tomorrow’s dinner ('+esc(d.dinner.date)+')', d.dinner.ordered.length+'/'+d.teamSize, '<p class="text-[11px] text-amber-200">Not ordered: '+(d.dinner.notOrdered.map(function(x){ return esc(x.name); }).join(', ')||'—')+'</p><p class="text-[11px] text-slate-300">Ordered: '+(d.dinner.ordered.map(function(x){ return esc(x.name)+' ('+esc(x.dish)+')'; }).join(', ')||'—')+'</p>') +
    box('r38-d-lv','Pending leave', d.leave.length, (d.leave.length ? d.leave.map(function(l){ return '<p class="text-[11px] text-slate-200">'+esc(l.name)+' · '+esc(l.from)+(l.to!==l.from?' → '+esc(l.to):'')+' <span class="text-slate-500">'+(l.status==='pending_hod'?'waiting for HOD':'waiting for manager')+'</span></p>'; }).join('') : '<p class="text-[11px] text-slate-500">None</p>') + (d.approvals.resortBoat ? '<p class="text-[11px] text-sky-200">Resort boat requests waiting for you: '+d.approvals.resortBoat+'</p>' : '') + '<button type="button" onclick="navigate(\'approvals\')" class="text-[11px] text-teal-300 mt-1">Open Approvals →</button>') +
    box('r38-d-bt','Boat movements', d.moves.today.length + d.moves.tomorrow.length, '<p class="text-[10px] uppercase text-slate-500">Today</p>'+mv(d.moves.today)+'<p class="text-[10px] uppercase text-slate-500 mt-1">Tomorrow</p>'+mv(d.moves.tomorrow));
  const dp = $('#r38-dp'); if (dp) dp.onchange = function(){ state._r38Dept = this.value; r38LoadDash(this.value); };
}
/* ---------- hooks ---------- */
(function(){
  const baseHome = renderHome;
  renderHome = function(){
    baseHome.apply(this, arguments);
    if (!state.user || v3IsSuper()) return;
    const anchor = $('#home-dothisnow'); if (!anchor || $('#r38-home')) return;
    anchor.insertAdjacentHTML('beforebegin', '<div id="r38-home" class="space-y-3 min-w-0">'+r38InstallHtml()+'</div>');
    r38BindInstall(); r38LoadRating(); if (r38DashAllowed()) r38LoadDash();
  };
  const baseShort = v351RoleShortcuts;
  v351RoleShortcuts = function(){
    const out = baseShort.apply(this, arguments);
    const tile = function(tab, icon, label, sub, go){ return v3Tile(go, icon, label, sub, 0).replace('class="v3-tile ', 'data-tab="'+tab+'" class="v3-tile v351-role '); };
    if (!v3IsSuper() && (v3IsChef() || v3Has('admin'))) out.push(tile('ratings', 'fa-thumbs-up', 'Dinner ratings', '👍 / 👎 per dish', 'r38OpenRatings()'));
    if (!v3IsSuper() && r38CanManifest()) out.push(tile('manifest', 'fa-list-check', 'Boat manifest', 'Today’s passengers', 'r38OpenManifest()'));
    return out;
  };
  const baseKA = v3RenderKitchenAdmin;
  v3RenderKitchenAdmin = async function(){
    const r = await baseKA.apply(this, arguments);
    const m = $('#ka-more'); if (m && !$('#ka-ratings')) m.insertAdjacentHTML('afterbegin', v3Row('r38OpenRatings()','fa-thumbs-up','Dinner ratings','👍 / 👎 per dish, last 30 days').replace('<button', '<button id="ka-ratings"'));
    return r;
  };
})();
/* ---------- 3.8.0 speed: app-open prefetch — the small reads every screen asks for a few seconds after opening go out
   together with the bootstrap as ONE batch; each prefetched answer is used once (within 20 s), then normal calls resume. ---------- */
(function(){
  if (typeof api !== 'function') return;
  const baseApi = api, pre = {};
  const key = function(a, p){ return a + '|' + JSON.stringify(p || {}); };
  function prefetch(){
    if (!state.user || state.demo) return;
    const list = [['getDepartments', {}], ['getMyNotifications', {}], ['getPushConfig', {}]];
    if (!v3IsSuper()) list.push(['getDinnerRatingPrompt', {}]);
    if (r38DashAllowed() && !v3Has('admin')) list.push(['getHodDashboard', { department: state.user.department || '' }]);
    list.forEach(function(x){ const k = key(x[0], x[1]); if (!pre[k]) pre[k] = { at: Date.now(), pr: baseApi(x[0], x[1]) }; });
  }
  api = function(a, p){
    if (a === 'getBootstrap') { try { prefetch(); } catch (e) {} }
    const k = key(a, p), hit = pre[k];
    if (hit) { delete pre[k]; if (Date.now() - hit.at < 20000) return hit.pr; }
    return baseApi(a, p);
  };
})();
