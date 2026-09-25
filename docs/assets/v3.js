/* PCR Staff App 3.0 — redesigned screens (loaded after the inline 2.x app script in index.html).
 * Replaces Home / Meals / More / navigation and adds leave, department, chef, admin and superadmin areas.
 * Everything still goes through api() (GET only), Fiji time comes from getFijiNow(), demo mode (?demo=1) runs
 * the real 3.0 server rules from assets/v3-demo-server.js (generated from apps-script/V3.gs).
 * boot() is called at the very end of this file. */
'use strict';

/* ============ A. roles & small helpers ============ */
const V3_ROLE_LABEL = { super_admin:'Superadmin', admin:'Admin', hod:'HOD', chef:'Chef', boat_manager:'Boat manager', staff:'Staff' };
const V3_LEAVE_TYPES = ['Day off','Annual leave','Sick sheet','Other'];
const V3_MEALS = ['breakfast','lunch','dinner'];
const V3_MEAL_LABEL = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner' };
const V3_MEAL_ICON = { breakfast:'fa-mug-saucer', lunch:'fa-bowl-food', dinner:'fa-moon' };

function v3Truthy(v){ return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1'; }
function v3RoleOf(u){
  u = u || state.user; if (!u) return 'staff';
  const p = userPerms(u);
  if (p.includes('super_admin')) return 'super_admin';
  if (p.includes('admin')) return 'admin';
  if (p.includes('hod')) return 'hod';
  if (p.includes('chef') || p.includes('kitchen')) return 'chef';
  if (p.includes('boat_manager') || p.includes('boat_captain') || p.includes('boat')) return 'boat_manager';
  return 'staff';
}
function v3Home(){ return cachePeek('v3home') || {}; }
function v3IsAsst(u){ u = u || state.user; return !!u && (v3Truthy(u.assistantHod) || userPerms(u).includes('assistant_hod')); }
function v3IsAdmin(){ const r = v3RoleOf(); return r === 'admin' || r === 'super_admin'; }
function v3IsSuper(){ return v3RoleOf() === 'super_admin'; }
function v3IsLead(){ return v3RoleOf() === 'hod' || v3IsAsst(); }
function v3IsChef(){ return v3RoleOf() === 'chef'; }
function v3CanChef(){ return v3IsChef() || v3IsAdmin(); }
function v3CanDept(){ return v3IsLead() || v3IsAdmin(); }
function v3DeptStatus(){
  const h = v3Home();
  if (h.deptStatus) return h.deptStatus;
  const s = String((state.user && state.user.deptStatus) || '').toLowerCase();
  return s || 'approved';
}
function v3DeptOk(){ return v3IsAdmin() || v3DeptStatus() === 'approved'; }
function v3RoleLabel(u){ const r = v3RoleOf(u); return (V3_ROLE_LABEL[r] || 'Staff') + (r === 'staff' && v3IsAsst(u) ? ' · Assistant HOD' : ''); }

/* overrides of 2.x permission helpers (same names, 3.0 meaning) */
canHod = function(){ return v3CanDept(); };
canKitchen = function(){ return v3CanChef(); };
roleLabel = function(r){ return ({ super_admin:'Superadmin', admin:'Admin', hod:'HOD', assistant_hod:'Assistant HOD', chef:'Chef', kitchen:'Chef', boat_manager:'Boat manager', boat_captain:'Boat manager', boat:'Boat manager', staff:'Staff' })[r] || r; };

function v3Esc(s){ return esc(s); }
function v3Page(inner, id){ return '<div class="fade-in max-w-lg mx-auto space-y-4 pb-6 min-w-0"'+(id?' id="'+id+'"':'')+'>'+inner+'</div>'; }
function v3Card(inner, extra){ return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0 '+(extra||'')+'">'+inner+'</section>'; }
function v3Title(icon, text, right){
  return '<div class="flex items-center justify-between gap-2 min-w-0"><h3 class="v3-section-title"><i class="fa-solid '+icon+' text-teal-400 mr-2"></i>'+text+'</h3>'+(right||'')+'</div>';
}
function v3Back(tab, label){
  return '<button type="button" class="text-xs text-teal-300 flex items-center gap-1 min-h-[36px]" onclick="navigate(\''+tab+'\')"><i class="fa-solid fa-chevron-left"></i>'+esc(label||'Back')+'</button>';
}
function v3Chip(text, tone){
  const t = { ok:'bg-teal-500/20 text-teal-200 border-teal-400/30', warn:'bg-amber-500/15 text-amber-200 border-amber-400/30', bad:'bg-rose-500/15 text-rose-200 border-rose-400/30',
    info:'bg-sky-500/15 text-sky-200 border-sky-400/30', mute:'bg-slate-600/30 text-slate-300 border-slate-500/30' }[tone||'mute'];
  return '<span class="v3-chip border '+t+'">'+text+'</span>';
}
function v3StatusTone(st){
  st = String(st||'');
  if (/^(approved|ordered|late_approved|confirmed|prepared|served|active)$/.test(st)) return 'ok';
  if (/pending/.test(st)) return 'warn';
  if (/^(rejected|declined|removed)$/.test(st)) return 'bad';
  return 'mute';
}
const V3_STATUS_TEXT = { pending_hod:'Waiting for HOD', pending_manager:'Waiting for management', approved:'Approved', rejected:'Declined', declined:'Declined', cancelled:'Cancelled',
  ordered:'Confirmed', late_approved:'Late · approved', late_pending:'Late · waiting', special_pending:'Special · waiting chef', prepared:'Prepared', served:'Served', pending:'Waiting', removed:'Removed' };
function v3Status(st){ return v3Chip(esc(V3_STATUS_TEXT[st] || humanStatus(st)), v3StatusTone(st)); }
function v3Tile(onclick, icon, label, sub, count){
  return '<button type="button" onclick="'+onclick+'" class="v3-tile glass rounded-xl p-3 text-left min-w-0 relative">'+
    (count ? '<span class="v3-count absolute top-2 right-2">'+count+'</span>' : '')+
    '<i class="fa-solid '+icon+' text-teal-400 text-base"></i><p class="text-xs font-semibold text-slate-100 mt-1.5 leading-tight">'+label+'</p>'+
    (sub?'<p class="text-[10px] text-slate-400 mt-0.5 leading-tight">'+sub+'</p>':'')+'</button>';
}
function v3Row(onclick, icon, label, sub, count){
  return '<button type="button" onclick="'+onclick+'" class="v3-list-btn w-full flex items-center gap-3 text-left min-w-0">'+
    '<i class="fa-solid '+icon+' text-teal-400 w-5 text-center"></i><span class="flex-1 min-w-0"><span class="block text-sm text-slate-100 truncate">'+label+'</span>'+
    (sub?'<span class="block text-[10px] text-slate-400 truncate">'+sub+'</span>':'')+'</span>'+
    (count ? '<span class="v3-count">'+count+'</span>' : '')+'<i class="fa-solid fa-chevron-right text-slate-500 text-xs"></i></button>';
}
function v3Nav(tab){ return "navigate('"+tab+"')"; }
function v3Empty(text){ return '<p class="text-xs text-slate-400 py-2">'+text+'</p>'; }
function v3Loading(){ return '<div class="space-y-2"><div class="skel-line" style="width:70%"></div><div class="skel-line" style="width:45%"></div></div>'; }
function v3DateLabel(ds){
  if (!ds) return '';
  const today = fijiDateString(), tom = fijiDateString(addFijiDays(getFijiNow(),1)), yest = fijiDateString(addFijiDays(getFijiNow(),-1));
  if (ds === today) return 'Today';
  if (ds === tom) return 'Tomorrow';
  if (ds === yest) return 'Yesterday';
  const p = String(ds).split('-'); if (p.length !== 3) return ds;
  const d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
  return WEEKDAY_NAMES[d.getUTCDay()].slice(0,3)+' '+(+p[2])+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1];
}
function v3Ts(s){ return String(s||'').replace(/:\d\d(\.\d+)?Z?$/,'').replace('T',' ').replace(' FJT',''); }
async function v3Call(action, payload, okMsg){
  let r;
  try { r = await api(action, payload || {}); }
  catch (e) { toast((e && e.message) || 'Couldn\'t reach the server — try again','error'); return null; }
  if (!r || !r.success) { toast((r && r.error) || 'Something went wrong','error'); return null; }
  if (okMsg) toast(okMsg, 'ok');
  return r.data || {};
}
/** Share one in-flight/just-finished read between callers that fire together on boot (avoids duplicate GETs). */
const _v3Recent = {};
function v3ApiShared(action, payload, ms){
  const k = action + JSON.stringify(payload || {}), now = Date.now(), hit = _v3Recent[k];
  if (hit && now - hit.t < (ms || 4000)) return hit.p;
  const p = api(action, payload || {}); _v3Recent[k] = { t: now, p: p };
  p.catch(function(){ delete _v3Recent[k]; });
  return p;
}
(function(){ const orig = api; api = function(action){ if (!/^get/.test(String(action))) Object.keys(_v3Recent).forEach(function(k){ delete _v3Recent[k]; }); return orig.apply(this, arguments); }; })();
async function v3RefreshHome(){
  try { const r = await v3ApiShared('getV3Home', {}); if (r && r.success && r.data) { cacheSet('v3home', r.data); return r.data; } } catch (e) {}
  return v3Home();
}
function v3Download(name, rows, cols){
  if (!rows || !rows.length) { toast('Nothing to download for this range','error'); return; }
  cols = cols || Object.keys(rows.reduce(function(m,r){ Object.keys(r).forEach(function(k){ m[k]=1; }); return m; }, {}));
  const text = cols.map(csvEscape).join(',')+'\n'+rows.map(function(r){ return cols.map(function(c){ const v = r[c]; return csvEscape(typeof v === 'object' && v ? JSON.stringify(v) : v); }).join(','); }).join('\n');
  downloadText(name, text);
}
function v3Print(title, html){
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print','error'); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font-family:system-ui,Arial,sans-serif;padding:18px;color:#111}h1{font-size:18px;margin:0 0 4px}p.m{color:#555;font-size:12px;margin:0 0 12px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:5px 6px;text-align:left}th{background:#eef3f5}tfoot td{font-weight:700}</style></head><body>'+
    '<h1>'+esc(title)+'</h1><p class="m">Paradise Cove Resort · printed '+esc(formatFiji())+'</p>'+html+'<script>window.onload=function(){window.print()}<\/script></body></html>');
  w.document.close();
}
function v3Table(cols, rows, foot){
  return '<table><thead><tr>'+cols.map(function(c){ return '<th>'+esc(c)+'</th>'; }).join('')+'</tr></thead><tbody>'+
    rows.map(function(r){ return '<tr>'+r.map(function(c){ return '<td>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody>'+
    (foot?'<tfoot><tr>'+foot.map(function(c){ return '<td>'+esc(c)+'</td>'; }).join('')+'</tr></tfoot>':'')+'</table>';
}
/** Small modal form helper. fields: [{id,label,type,options,value,placeholder,required}] → onSubmit(values) returns true to close. */
function v3Form(title, fields, submitLabel, onSubmit, intro){
  const html = '<div class="space-y-3 min-w-0"><h3 class="font-semibold text-slate-100">'+esc(title)+'</h3>'+(intro?'<p class="text-xs text-slate-300">'+intro+'</p>':'')+
    fields.map(function(f){
      const lab = '<label for="v3f-'+f.id+'" class="text-[11px] text-slate-400">'+esc(f.label)+(f.required?' *':'')+'</label>';
      let inp;
      if (f.type === 'select') inp = '<select id="v3f-'+f.id+'" class="ui-input w-full">'+f.options.map(function(o){ const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return '<option value="'+esc(v)+'"'+(String(v)===String(f.value||'')?' selected':'')+'>'+esc(l)+'</option>'; }).join('')+'</select>';
      else if (f.type === 'textarea') inp = '<textarea id="v3f-'+f.id+'" rows="3" maxlength="'+(f.max||500)+'" class="ui-input w-full" placeholder="'+esc(f.placeholder||'')+'">'+esc(f.value||'')+'</textarea>';
      else if (f.type === 'checkbox') return '<label class="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" id="v3f-'+f.id+'"'+(f.value?' checked':'')+'/> '+esc(f.label)+'</label>';
      else inp = '<input id="v3f-'+f.id+'" type="'+(f.type||'text')+'" maxlength="'+(f.max||200)+'" class="ui-input w-full" placeholder="'+esc(f.placeholder||'')+'" value="'+esc(f.value||'')+'"'+(f.min?' min="'+f.min+'"':'')+'/>';
      return '<div class="space-y-1 min-w-0">'+lab+inp+'</div>';
    }).join('')+
    '<div class="flex gap-2 pt-1"><button type="button" id="v3f-cancel" class="flex-1 rounded-xl py-2.5 text-sm border border-slate-600 text-slate-300">Close</button>'+
    '<button type="button" id="v3f-submit" class="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold text-white">'+esc(submitLabel||'Save')+'</button></div></div>';
  openModal(html);
  $('#v3f-cancel').onclick = closeModal;
  const btn = $('#v3f-submit');
  btn.onclick = async function(){
    const vals = {};
    for (const f of fields) {
      const el = $('#v3f-'+f.id); if (!el) continue;
      vals[f.id] = f.type === 'checkbox' ? el.checked : String(el.value||'').trim();
      if (f.required && !vals[f.id]) { toast(f.label+' is required','error'); el.focus(); return; }
    }
    btn.disabled = true;
    try { if (await onSubmit(vals)) closeModal(); } finally { btn.disabled = false; }
  };
}

/* ============ B. demo mode: run the real 3.0 server rules on the phone's demo data ============ */
const V3_SHEET_KEYS = { 'Users':'users', 'Breakfast Orders':'breakfastOrders', 'Lunch Orders':'lunchOrders', 'Dinner Orders':'dinnerOrders', 'Leave Requests':'leaveRequests',
  'Menu Votes':'menuVotes', 'Chef Feedback':'chefFeedback', 'Dept Updates':'deptUpdates', 'Dept Update Activity':'deptActivity', 'Boat Runs':'boatRuns',
  'Boat Bookings':'boatBookings', 'Suggestions':'suggestions', 'Reminders':'reminders', 'Notifications':'notifications', 'Dinner Menus':'dinnerMenus' };
const V3DB = { db: null };
function v3DemoRows(name){
  const db = V3DB.db;
  if (name === 'App Settings') return Object.keys(db.appSettings||{}).map(function(k){ return { key:k, value:String(db.appSettings[k]) }; });
  const k = V3_SHEET_KEYS[name]; if (!k) return [];
  if (!db[k]) db[k] = [];
  return db[k];
}
function v3ParsePerms(u){
  if (!u) return ['staff'];
  let list = [];
  if (Array.isArray(u.permissions)) list = u.permissions.map(String);
  else if (u.permissions !== undefined && u.permissions !== null && String(u.permissions).trim() !== '') list = String(u.permissions).split(/[,|]+/).map(function(s){ return s.trim(); }).filter(Boolean);
  if (!list.length && u.role) list = [u.role === 'kitchen' ? 'chef' : u.role === 'boat' ? 'boat_manager' : String(u.role)];
  return list.length ? list : ['staff'];
}
function v3DemoShim(){
  const copy = function(o){ return o ? Object.assign({}, o) : o; };
  const S = {
    APP_VERSION: APP_VERSION + '-demo', ORDER_HEADERS: [], SHEET_ID: 'demo', SUPERADMIN_EMAIL: 'it@paradisecoveresortfiji.com', WEEKDAY_NAMES: WEEKDAY_NAMES,
    addFijiDays: addFijiDays, fijiDateString: fijiDateString, formatFiji: formatFiji, getFijiNow: getFijiNow,
    breakfastCutoffInfo: breakfastCutoffInfo, lunchCutoffInfo: lunchCutoffInfo, dinnerCutoffInfo: dinnerCutoffInfo,
    sheetToObjects: function(n){ return v3DemoRows(n).map(copy); },
    cachedRows: function(n){ return v3DemoRows(n).map(copy); },
    appendRow: function(n, row){ v3DemoRows(n).push(Object.assign({}, row)); },
    updateRowById: function(n, id, patch){ const r = v3DemoRows(n).find(function(x){ return String(x.id) === String(id); }); if (!r) return null; Object.assign(r, patch); return copy(r); },
    findOrder: function(n, id){ return copy(v3DemoRows(n).find(function(x){ return String(x.id) === String(id); }) || null); },
    findUserByEmail: function(e){ e = String(e||'').trim().toLowerCase(); return copy(v3DemoRows('Users').find(function(u){ return String(u.email).toLowerCase() === e; }) || null); },
    getRequester: function(p){ const e = String(p.requesterEmail || p.email || '').trim().toLowerCase(); return e ? S.findUserByEmail(e) : null; },
    getSetting: function(k, fb){ const v = (V3DB.db.appSettings||{})[k]; return v === undefined || v === '' ? (fb === undefined ? '' : String(fb)) : String(v); },
    getDinnerMenus: function(p){
      const parts = String(p.serviceDate).split('-'); const wd = new Date(Date.UTC(+parts[0], +parts[1]-1, +parts[2])).getUTCDay();
      return { success:true, data:{ items: v3DemoRows('Dinner Menus').filter(function(m){ return Number(m.weekday) === wd && m.active !== false; }).map(copy) } };
    },
    mealRangeStats: function(n){
      const end = addFijiDays(getFijiNow(), 1), byDay = [];
      for (let i = n-1; i >= 0; i--) {
        const ds = fijiDateString(addFijiDays(end, -i));
        const b = v3DemoRows('Breakfast Orders').filter(function(o){ return String(o.serviceDate).indexOf(ds) === 0 && S.countsInBreakfastTotal(o); }).length;
        const l = v3DemoRows('Lunch Orders').filter(function(o){ return String(o.serviceDate).indexOf(ds) === 0 && S.countedMealStatus(o.status); }).length;
        const d = v3DemoRows('Dinner Orders').filter(function(o){ return String(o.serviceDate).indexOf(ds) === 0 && S.countedMealStatus(o.status); }).length;
        byDay.push({ date: ds, breakfast: b, lunch: l, dinner: d, total: b+l+d });
      }
      return { byDay: byDay };
    },
    cleanSpecialNote: cleanNoteText, kitchenNoteOf: kitchenNoteOf,
    countedMealStatus: function(st){ st = String(st||''); return !!st && ['cancelled','rejected','declined','late_pending','special_pending'].indexOf(st) < 0; },
    countsInBreakfastTotal: function(o){ const st = String((o && o.status) || ''); return ['ordered','late_approved','approved','prepared','served'].indexOf(st) >= 0; },
    displayUserName: function(u){ if (!u) return ''; const p = String(u.preferredName||'').trim(); return p || ((u.firstName||'')+' '+(u.lastName||'')).trim(); },
    normalizeStaffLocation: function(v){ const s = String(v==null?'':v).trim().toLowerCase(); if (!s) return ''; if (['true','yes','village'].includes(s)) return 'Village'; if (['false','no','mainland','resort'].includes(s)) return 'Mainland'; return String(v); },
    nowIso: function(){ return formatFiji(); },
    publicUser: function(u){ return publicUser(u); },
    truthy: v3Truthy, uid: uid, userPermissions: v3ParsePerms,
    isAdminPerm: function(u){ const p = v3ParsePerms(u); return p.includes('super_admin') || p.includes('admin'); },
    isSuperPerm: function(u){ return v3ParsePerms(u).includes('super_admin'); },
    isChefPerm: function(u){ const p = v3ParsePerms(u); return p.includes('chef') || p.includes('kitchen') || p.includes('super_admin') || p.includes('admin'); },
    scKey: function(a,b){ return a+'|'+b; }, scGetJson: function(){ return null; }, scPutJson: function(){}, scBump: function(){},
    withIdempotency: function(a, p, fn){ return fn(p); },
    getSS: function(){ return { getSheetByName: function(){ return {}; } }; }, ensureSheet: function(){}, ensureColumns: function(){},
    Utilities: { getUuid: function(){ return Math.random().toString(36).slice(2,10)+'xxxx'; } },
    MailApp: { sendEmail: function(m){ (V3DB.db.demoMail = V3DB.db.demoMail || []).push({ to:m.to, subject:m.subject, body:m.body, at: formatFiji() }); } },
    LockService: { getScriptLock: function(){ return { tryLock: function(){ return true; }, releaseLock: function(){} }; } },
    CacheService: { getScriptCache: function(){ return { get: function(){ return null; }, put: function(){} }; } }
  };
  return S;
}
let _v3Srv = null, _v3SrvP = null;
function v3EnsureDemoServer(){
  if (_v3Srv) return Promise.resolve(_v3Srv);
  if (_v3SrvP) return _v3SrvP;
  _v3SrvP = new Promise(function(res, rej){
    if (window.PCRV3Server) { _v3Srv = window.PCRV3Server(v3DemoShim()); res(_v3Srv); return; }
    const s = document.createElement('script');
    s.src = 'assets/v3-demo-server.js?v=' + APP_VERSION;
    s.onload = function(){ _v3Srv = window.PCRV3Server(v3DemoShim()); res(_v3Srv); };
    s.onerror = function(){ _v3SrvP = null; rej(new Error('Demo server failed to load')); };
    document.head.appendChild(s);
  });
  return _v3SrvP;
}
/** Run fn(srv, db) against the demo data and save it. */
async function v3DemoRun(fn){
  const srv = await v3EnsureDemoServer();
  const db = loadDemo();
  V3DB.db = db;
  let out;
  try { out = fn(srv, db); } finally { V3DB.db = null; }
  saveDemo(db);
  return out === undefined || out === null ? out : JSON.parse(JSON.stringify(out));
}
function v3DemoMe(){ return String((state.user && state.user.email) || '').toLowerCase(); }

/* 3.0 fields on demo users (publicUser is the demo login / directory shape) */
const _v2PublicUser = publicUser;
publicUser = function(u){
  const pu = _v2PublicUser(u);
  if (!pu) return pu;
  const perms = v3ParsePerms(u);
  const asst = v3Truthy(u.assistantHod) || perms.includes('assistant_hod');
  const ds = String(u.deptStatus || '').trim().toLowerCase() || 'approved';
  pu.role3 = v3RoleOf({ permissions: perms });
  pu.assistantHod = asst; pu.deptStatus = ds; pu.deptApproved = ds === 'approved';
  pu.createdAt = u.createdAt || '';
  return pu;
};
/* pending special / late requests never count in kitchen lists (same as the 3.0 server) */
const _v2DemoBuildPrep = demoBuildPrep;
demoBuildPrep = function(db, serviceDate){
  const keep = db.dinnerOrders;
  db.dinnerOrders = (keep||[]).filter(function(o){ return o.status !== 'special_pending'; });
  try { return _v2DemoBuildPrep(db, serviceDate); } finally { db.dinnerOrders = keep; }
};

const V3_DEMO_CANCEL_LIMIT = 3;
function v3DemoCancelCount(list, email, sd){
  return (list||[]).filter(function(o){ return String(o.userEmail).toLowerCase() === email && String(o.serviceDate).slice(0,10) === sd && o.status === 'cancelled' && o.orderType !== 'special'; }).length;
}
const _v2DemoApiCore = demoApiCore;
demoApiCore = async function(action, p){
  p = p || {};
  const me = v3DemoMe();
  if (action === 'requestLeave') action = 'submitLeave';
  if (action === 'reviewLeave') { action = 'decideLeave'; p = Object.assign({}, p, { decision: p.decision || p.status || p.action }); }
  // 3.0 actions: the generated server module
  const v3 = await v3DemoRun(function(srv){ return srv.routeV3(action, Object.assign({}, p, { requesterEmail: me || p.requesterEmail })); });
  if (v3 !== null && v3 !== undefined) return v3;
  const db = loadDemo();
  const meU = db.users.find(function(u){ return u.email === me; });
  const isAdm = meU && (v3ParsePerms(meU).includes('admin') || v3ParsePerms(meU).includes('super_admin'));
  const isLead = meU && (v3ParsePerms(meU).includes('hod') || v3Truthy(meU.assistantHod) || v3ParsePerms(meU).includes('assistant_hod'));
  switch (action) {
    case 'getLeaveRequests': {
      const scope = isAdm ? 'all' : (isLead ? 'dept' : 'mine');
      const r = await v3DemoRun(function(srv){ return srv.routeV3('getLeave', { requesterEmail: me, scope: scope }); });
      return r && r.success ? { success:true, data:{ requests: r.data.requests, escalation:true } } : r;
    }
    case 'getUsers': {
      if (!isAdm && !isLead) return { success:false, error:'Admin or department HOD only' };
      const r = await _v2DemoApiCore(action, p);
      if (r && r.success && !isAdm) { r.data.users = r.data.users.filter(function(u){ return String(u.department).toLowerCase() === String(meU.department).toLowerCase(); }); r.data.total = r.data.users.length; }
      return r;
    }
    case 'updateUser': case 'updateProfile': {
      if (p.department !== undefined && !isAdm) {
        const t = db.users.find(function(u){ return u.email === String(p.targetEmail||p.email||'').toLowerCase(); });
        if (t && String(t.department) !== String(p.department)) return { success:false, error:'Only admin can change a department' };
      }
      return _v2DemoApiCore(action, p);
    }
    case 'deleteUser': {
      if (!isAdm) return { success:false, error:'Admin only' };
      const t = db.users.find(function(u){ return u.email === String(p.targetEmail||'').toLowerCase(); });
      if (!t) return { success:false, error:'User not found' };
      if (t.email === me) return { success:false, error:'You cannot delete yourself' };
      if (v3ParsePerms(t).includes('super_admin') || (v3ParsePerms(t).includes('admin') && !v3ParsePerms(meU).includes('super_admin'))) return { success:false, error:'Only superadmin can delete admins' };
      db.users = db.users.filter(function(u){ return u !== t; }); saveDemo(db);
      return { success:true, data:{ deleted: t.email } };
    }
    case 'addReminder': case 'completeReminder': case 'deleteReminder':
      if (!isAdm) return { success:false, error:'Only admin adds or changes reminders' };
      return _v2DemoApiCore(action, p);
    case 'register': {
      const r = await _v2DemoApiCore(action, p);
      if (r && r.success) {
        const email = String(p.email||'').toLowerCase().trim();
        await v3DemoRun(function(srv, d){
          const u = d.users.find(function(x){ return x.email === email; });
          if (u) { u.deptStatus = 'pending'; u.assistantHod = false; }
          srv.deptLeads(p.department).forEach(function(l){ srv.v3Notify(l.email, 'Join request: '+(p.firstName||'')+' '+(p.lastName||''), 'Wants to join '+p.department+'. Open More → Department staff to accept or decline.', 'dept_join', u && u.id); });
        });
        r.data = Object.assign({}, r.data, { deptPending: true, delivery: String((loadDemo().appSettings||{}).verification_delivery || 'screen') });
      }
      return r;
    }
    case 'placeLunchOrder': case 'placeBreakfastOrder': {
      const meal = action === 'placeLunchOrder' ? 'lunch' : 'breakfast';
      const info = meal === 'lunch' ? lunchCutoffInfo() : breakfastCutoffInfo();
      const list = meal === 'lunch' ? db.lunchOrders : db.breakfastOrders;
      const sd = String(p.serviceDate || info.serviceDate).slice(0,10);
      if (v3DemoCancelCount(list, String(p.userEmail||me).toLowerCase(), sd) >= V3_DEMO_CANCEL_LIMIT)
        return { success:false, blocked:true, error:'You have cancelled '+meal+' for '+sd+' '+V3_DEMO_CANCEL_LIMIT+' times — this meal is locked. Contact your HOD or chef.' };
      // 2.x demo reuses a cancelled row; 3.0 keeps each cancel as its own row so the 3-cancel rule can count them
      return _v2DemoApiCore(action, p);
    }
    case 'cancelMealOrder': {
      const meal = String(p.meal||'').toLowerCase();
      const info = meal === 'breakfast' ? breakfastCutoffInfo() : (meal === 'lunch' ? lunchCutoffInfo() : dinnerCutoffInfo());
      const list = meal === 'breakfast' ? db.breakfastOrders : (meal === 'lunch' ? db.lunchOrders : db.dinnerOrders);
      const email = String(p.userEmail||me).toLowerCase();
      const sd = String(p.serviceDate || info.serviceDate).slice(0,10);
      const cur = (list||[]).find(function(o){ return o.userEmail === email && o.serviceDate === sd && o.status !== 'cancelled'; });
      if (meal === 'dinner' && !info.open && !(cur && cur.status === 'late_pending')) return { success:false, error:'Contact your HOD for a late meal request', cutoff: info };
      const r = await _v2DemoApiCore(action, p);
      if (r && r.success && r.data && r.data.order) {
        const d2 = loadDemo(); const l2 = meal === 'breakfast' ? d2.breakfastOrders : (meal === 'lunch' ? d2.lunchOrders : d2.dinnerOrders);
        const o = l2.find(function(x){ return x.id === r.data.order.id; });
        if (o) { o.cancelReason = String(p.reason || p.cancelReason || 'No reason given (older app)').slice(0,200); o.cancelledAt = formatFiji(); }
        saveDemo(d2);
        r.data.cancelsUsed = v3DemoCancelCount(l2, email, sd); r.data.cancelLimit = V3_DEMO_CANCEL_LIMIT;
      }
      return r;
    }
  }
  return _v2DemoApiCore(action, p);
};

const _v2DemoBootstrap = demoBootstrap;
demoBootstrap = async function(p){
  const r = await _v2DemoBootstrap(p);
  try {
    const me = v3DemoMe();
    r.data.v3 = await v3DemoRun(function(srv, db){ const u = db.users.find(function(x){ return x.email === me; }); return u ? srv.getV3Home(Object.assign({}, u)) : null; });
    if (r.data.user) r.data.user = publicUser(loadDemo().users.find(function(x){ return x.email === me; }));
  } catch (e) { console.warn('demo v3 home', e); }
  return r;
};

/* demo seed for every 3.0 role (runs once per demo database) */
const V3_DEMO_SEED = 'v3seed-1';
function v3SeedDemo(db){
  if (db.v3Seed === V3_DEMO_SEED) return false;
  const now = formatFiji(), today = fijiDateString(), tom = fijiDateString(addFijiDays(getFijiNow(),1));
  const inDays = function(n){ return fijiDateString(addFijiDays(getFijiNow(), n)); };
  const ago = function(h){ return formatFiji(new Date(getFijiNow().getTime() - h*3600000)); };
  const addU = function(u){ if (!db.users.some(function(x){ return x.email === u.email; })) db.users.push(Object.assign({ id: uid('usr'), password:'staff123', contact:'', roster:'', village:'Resort', active:true, verified:true, createdAt: ago(24*20) }, u)); };
  const hod = db.users.find(function(u){ return u.email === 'hod.fb@pcr.com'; });
  if (hod) { hod.active = true; hod.verified = true; }
  addU({ email:'admin@paradisecoveresortfiji.com', firstName:'Litia', lastName:'Rova', department:'Management', role:'admin', permissions:'admin' });
  addU({ email:'hod.hk@paradisecoveresortfiji.com', firstName:'Mere', lastName:'Tabua', department:'Housekeeping', role:'hod', permissions:'hod' });
  addU({ email:'asst.hk@paradisecoveresortfiji.com', firstName:'Vika', lastName:'Lesi', department:'Housekeeping', role:'staff', permissions:'staff', assistantHod:true });
  addU({ email:'sam.fb@paradisecoveresortfiji.com', firstName:'Sami', lastName:'Koro', department:'F&B', role:'staff', permissions:'staff' });
  addU({ email:'new.staff@paradisecoveresortfiji.com', firstName:'Tomasi', lastName:'Vula', department:'Housekeeping', role:'staff', permissions:'staff', deptStatus:'pending', createdAt: ago(5) });
  addU({ email:'legacy.asst@paradisecoveresortfiji.com', firstName:'Losa', lastName:'Naivalu', department:'Grounds', role:'assistant_hod', permissions:'assistant_hod' });
  db.leaveRequests = db.leaveRequests || [];
  const lv = function(o){ db.leaveRequests.push(Object.assign({ id: uid('lv'), reviewedBy:'', hodNote:'', managerNote:'', notifyNote:'', hodStatus:'pending', hodBy:'', hodAt:'', mgmtStatus:'pending', mgmtBy:'', mgmtAt:'', cancelledAt:'', escalatedAt:'' }, o)); };
  lv({ userEmail:'ana.tui@paradisecoveresortfiji.com', userName:'Ana Tui', department:'Housekeeping', startDate: inDays(10), endDate: inDays(12), reason:'Family wedding in Suva', leaveType:'Annual leave', status:'pending_hod', createdAt: ago(20) });
  lv({ userEmail:'ana.tui@paradisecoveresortfiji.com', userName:'Ana Tui', department:'Housekeeping', startDate: inDays(-9), endDate: inDays(-9), reason:'Clinic visit', leaveType:'Day off', status:'approved', hodStatus:'approved', hodBy:'hod.hk@paradisecoveresortfiji.com', hodAt: ago(24*12), mgmtStatus:'approved', mgmtBy:'admin@paradisecoveresortfiji.com', mgmtAt: ago(24*11), createdAt: ago(24*13) });
  lv({ userEmail:'sam.fb@paradisecoveresortfiji.com', userName:'Sami Koro', department:'F&B', startDate: inDays(4), endDate: inDays(5), reason:'Village church event', leaveType:'Day off', status:'pending_manager', hodStatus:'approved', hodBy:'hod.fb@pcr.com', hodAt: ago(3), createdAt: ago(26) });
  // dinner menu votes (weekly menu, burger/pizza are daily and never voted)
  ensureDemoMenus(db);
  const dishes = []; (db.dinnerMenus||[]).forEach(function(m){ if (!/burger|pizza/i.test(m.itemName) && dishes.indexOf(m.itemName) < 0) dishes.push(m.itemName); });
  const voters = ['ana.tui@paradisecoveresortfiji.com','sam.fb@paradisecoveresortfiji.com','asst.hk@paradisecoveresortfiji.com','hod.hk@paradisecoveresortfiji.com','boat@paradisecoveresortfiji.com'];
  db.menuVotes = db.menuVotes || [];
  dishes.forEach(function(dish, i){
    voters.forEach(function(v, j){
      const vote = ((i*7 + j*3) % 5 === 0) ? -1 : (((i + j) % 3 === 0) ? 1 : 0);
      if (vote) db.menuVotes.push({ id: uid('mv'), dishKey: String(dish).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(), dish: dish, userEmail: v, vote: vote, updatedAt: now });
    });
  });
  db.chefFeedback = (db.chefFeedback||[]).concat([
    { id: uid('cf'), userEmail:'ana.tui@paradisecoveresortfiji.com', userName:'Ana Tui', department:'Housekeeping', kind:'issue', message:'Rice was cold at the 2nd lunch sitting.', status:'new', chefNote:'', createdAt: ago(6), handledBy:'', handledAt:'' },
    { id: uid('cf'), userEmail:'sam.fb@paradisecoveresortfiji.com', userName:'Sami Koro', department:'F&B', kind:'request', message:'Could we get a vegetable curry once a week?', status:'seen', chefNote:'Adding Thursday.', createdAt: ago(40), handledBy:'kitchen@paradisecoveresortfiji.com', handledAt: ago(30) }
  ]);
  const up1 = uid('du'), up2 = uid('du');
  db.deptUpdates = (db.deptUpdates||[]).concat([
    { id: up1, department:'Housekeeping', authorEmail:'hod.hk@paradisecoveresortfiji.com', authorName:'Mere Tabua', title:'Villa deep-clean week', body:'Monday to Wednesday: two extra staff on villas 10–18. Linen change starts 7:30am.', active:true, createdAt: ago(8) },
    { id: up2, department:'F&B', authorEmail:'hod.fb@pcr.com', authorName:'Sera Nabua', title:'Wedding on Saturday', body:'120 guests at the beach deck. Briefing 3pm Friday at the bar.', active:true, createdAt: ago(30) }
  ]);
  db.deptActivity = (db.deptActivity||[]).concat([
    { id: uid('dua'), updateId: up1, userEmail:'ana.tui@paradisecoveresortfiji.com', userName:'Ana Tui', kind:'like', text:'', createdAt: ago(7) },
    { id: uid('dua'), updateId: up1, userEmail:'asst.hk@paradisecoveresortfiji.com', userName:'Vika Lesi', kind:'comment', text:'I will cover villas 15–18.', createdAt: ago(6) }
  ]);
  // a special dinner (contractor) waiting for the chef, and a late lunch request waiting
  const dMenu = (db.dinnerMenus||[]).filter(function(m){ const p = tom.split('-'); return Number(m.weekday) === new Date(Date.UTC(+p[0], +p[1]-1, +p[2])).getUTCDay(); });
  db.dinnerOrders = (db.dinnerOrders||[]).concat([{ id: uid('din'), serviceDate: tom, userEmail:'special+pita.electrician.a1b2@pcr.local', userName:'Pita Electrician (Fiji Power Co)', department:'Contractor',
    mealChoice: (dMenu[0] && dMenu[0].itemName) || 'Standard', notes:'[Special by Mere Tabua] Mainland contractor fixing the villa generator', specialNote:'No pork', status:'special_pending', late:false, createdAt: ago(2),
    orderType:'special', reason:'Mainland contractor fixing the villa generator', requestedBy:'hod.hk@paradisecoveresortfiji.com', guestName:'Pita Electrician', guestCompany:'Fiji Power Co' }]);
  db.lunchOrders = (db.lunchOrders||[]).concat([{ id: uid('lun'), serviceDate: today, userEmail:'sam.fb@paradisecoveresortfiji.com', userName:'Sami Koro', department:'F&B', mealChoice:'Lunch',
    notes:'[Late request] Back from Nadi on the late boat', specialNote:'', status:'late_pending', late:true, createdAt: ago(1), orderType:'late_request', reason:'Back from Nadi on the late boat', requestedBy:'sam.fb@paradisecoveresortfiji.com' }]);
  db.notifications = (db.notifications||[]).concat([
    { id: uid('ntf'), userEmail:'hod.hk@paradisecoveresortfiji.com', title:'Join request: Tomasi Vula', body:'Wants to join Housekeeping. Open More → Department staff.', kind:'dept_join', relatedId:'', read:false, createdAt: ago(5) },
    { id: uid('ntf'), userEmail:'asst.hk@paradisecoveresortfiji.com', title:'Join request: Tomasi Vula', body:'Wants to join Housekeeping. Open More → Department staff.', kind:'dept_join', relatedId:'', read:false, createdAt: ago(5) }
  ]);
  db.appSettings = db.appSettings || {};
  if (db.appSettings.verification_delivery === undefined) db.appSettings.verification_delivery = 'screen';
  db.v3Seed = V3_DEMO_SEED;
  return true;
}
const _v2LoadDemo = loadDemo;
loadDemo = function(){
  const db = _v2LoadDemo();
  if (db.v3Seed !== V3_DEMO_SEED) { seedDemoSamples(db); v3SeedDemo(db); saveDemo(db); }
  return db;
};

/* ============ C. bootstrap / cache ============ */
const _v2ApplyBootstrap = applyBootstrap;
applyBootstrap = function(d){
  if (d && d.v3) { try { cacheSet('v3home', d.v3); } catch (e) {} }
  if (d && d.v3 && d.user) d.user = Object.assign({}, d.user, { assistantHod: d.v3.assistantHod, deptStatus: d.v3.deptStatus, deptApproved: d.v3.deptApproved });
  return _v2ApplyBootstrap(d);
};
repaintAfterBootstrap = function(){
  if (!state.user) return;
  // repaint read-only screens with fresh data; never a form the user may be typing in
  if (state.tab === 'home') { if (!v3HomeTyping()) renderHome(); }
  else if (state.tab === 'more') renderMore();
};
function v3HomeTyping(){
  const a = document.activeElement;
  return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#main-content') && $('#main-content').contains(a));
}
const _v2CacheInvalidateMealBoat = cacheInvalidateMealBoat;
cacheInvalidateMealBoat = function(){ try { _v2CacheInvalidateMealBoat(); } finally { cacheInvalidate(['v3home']); } };

/* ============ D. navigation ============ */
navItems = function(){
  const r = v3RoleOf();
  if (r === 'super_admin') return [
    { id:'home', icon:'fa-gauge-high', label:'Dashboard' }, { id:'approvals', icon:'fa-inbox', label:'Approvals' },
    { id:'manage', icon:'fa-sliders', label:'Manage' }, { id:'more', icon:'fa-ellipsis', label:'More' }];
  const items = [{ id:'home', icon:'fa-house', label:'Home' }, { id:'meals', icon:'fa-utensils', label:'Meals' }];
  if (r === 'chef') items.push({ id:'chef', icon:'fa-fire-burner', label:'Chef' });
  items.push({ id:'boat', icon:'fa-ship', label:'Boat' });
  if (r === 'admin') items.push({ id:'manage', icon:'fa-sliders', label:'Manage' });
  items.push({ id:'more', icon:'fa-ellipsis', label:'More' });
  return items;
};
const V3_TAB_PARENT = { breakfast:'meals', lunch:'meals', dinner:'meals', myorders:'more', history:'more', leave:'more', profile:'more', notifications:'more', bookings:'more',
  deptstaff:'more', deptupdates:'more', chefreq:'chef', chefcomments:'chef', chefreports:'chef', chefmenu:'chef', kitchen:'chef', usersv3:'manage', reminders:'manage',
  adminstatus:'manage', migrate:'manage', settings:'manage', admin:'manage', suggestions:'manage', users:'manage', special:'meals', approvals:'approvals' };
renderNav = function(targetSel){
  const items = navItems(), ids = items.map(function(n){ return n.id; });
  let active = ids.includes(state.tab) ? state.tab : (V3_TAB_PARENT[state.tab] || 'more');
  if (!ids.includes(active)) active = (active === 'chef' || active === 'manage') ? 'more' : 'more';
  const el = $(targetSel || '#bottom-nav'); if (!el) return;
  const h = v3Home(), hb = h.hodBar || {}, sd = h.superDash && h.superDash.pending;
  const badge = function(id){
    if (id === 'approvals' && sd) { const n = (sd.leaveHod||0)+(sd.leaveMgmt||0)+(sd.late||0)+(sd.special||0)+(sd.joins||0); return n; }
    if (id === 'chef' && h.chef) return (h.chef.pending.late||0)+(h.chef.pending.special||0);
    return 0;
  };
  el.innerHTML = items.map(function(n){
    const b = badge(n.id);
    return '<button class="nav-item relative flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] border-b-2 '+(active===n.id?'active text-teal-400 border-teal-500':'text-sand-200/50 border-transparent')+'" data-tab="'+n.id+'">'+
      '<i class="fa-solid '+n.icon+' text-base"></i><span>'+n.label+'</span>'+(b?'<span class="v3-count v3-nav-badge">'+b+'</span>':'')+'</button>';
  }).join('');
  $$((targetSel || '#bottom-nav')+' .nav-item').forEach(function(b){ b.onclick = function(){ navigate(b.dataset.tab); }; });
};
canPrivilegedTab = function(tab){
  const need = {
    kitchen: v3CanChef, chef: v3CanChef, chefreq: function(){ return v3CanChef() || v3IsLead(); }, chefcomments: v3CanChef, chefreports: v3CanChef, chefmenu: v3CanChef,
    deptstaff: v3CanDept, special: function(){ return v3CanDept() || v3CanChef(); },
    manage: v3IsAdmin, usersv3: v3IsAdmin, users: v3IsAdmin, reminders: v3IsAdmin, adminstatus: v3IsAdmin, migrate: v3IsAdmin, suggestions: v3IsAdmin,
    settings: v3IsSuper, approvals: function(){ return v3IsAdmin() || v3IsLead() || v3CanChef(); },
    admin: function(){ return v3IsAdmin() || v3RoleOf() === 'boat_manager' || v3IsChef(); }
  }[tab];
  return need ? !!need() : true;
};
roleLandingTab = function(){
  try {
    const h = (location.hash||'').replace(/^#/, '');
    if (h && V3_TITLES[h] && canPrivilegedTab(h)) return h;
  } catch (e) {}
  return 'home';
};
const V3_TITLES = { home:'Home', meals:'Meals', boat:'Boat', more:'More', bookings:'My boat bookings', profile:'My profile', history:'My history', leave:'Leave requests',
  notifications:'Notifications', deptstaff:'Department staff', deptupdates:'Department updates', chef:'Chef', chefreq:'Late & special requests', chefcomments:'Food comments',
  chefreports:'Meal reports', chefmenu:'Edit menu', kitchen:'Kitchen lists', manage:'Manage', usersv3:'Users', reminders:'Reminders', adminstatus:'Admin status & reports',
  migrate:'Role migration', settings:'App settings', admin:'Boat & admin tools', suggestions:'Suggestions', approvals:'Approvals', special:'Special meal order', schedule:'My schedule' };
navigate = function(tab){
  if (tab === 'myorders') tab = 'history';
  if (tab === 'users') tab = 'usersv3';
  if (tab === 'breakfast' || tab === 'lunch' || tab === 'dinner') { state.mealFocus = tab; tab = 'meals'; }
  if (!canPrivilegedTab(tab)) { toast('That area is not part of your role','error'); tab = 'home'; }
  if (tab === 'schedule' && !featureOn('feature_my_schedule')) { toast('My Schedule is off for now.','error'); tab = 'more'; }
  if (state._v3Timer) { clearInterval(state._v3Timer); state._v3Timer = null; }
  if (state._homeRemTimer) { clearInterval(state._homeRemTimer); state._homeRemTimer = null; }
  state.tab = tab;
  const ht = $('#header-title'); if (ht) ht.textContent = V3_TITLES[tab] || tab;
  const sticky = $('#app-sticky'); if (sticky) sticky.classList.remove('hidden');
  const map = {
    home: renderHome, meals: renderMeals, boat: renderBoat, more: renderMore, bookings: renderMyBookings, profile: renderMyProfile, schedule: renderSchedule,
    history: v3RenderHistory, leave: v3RenderLeave, notifications: v3RenderNotifications, deptstaff: v3RenderDeptStaff, deptupdates: v3RenderDeptUpdates,
    chef: v3RenderChefHub, chefreq: v3RenderChefRequests, chefcomments: v3RenderChefComments, chefreports: v3RenderChefReports, chefmenu: v3RenderMenuEditor,
    kitchen: renderKitchen, manage: v3RenderManage, usersv3: v3RenderUsers, reminders: v3RenderReminders, adminstatus: v3RenderAdminStatus, migrate: v3RenderMigrate,
    settings: v3RenderSettings, admin: renderAdmin, suggestions: renderSuggestions, approvals: v3RenderApprovals, special: v3RenderSpecialPage
  };
  if (['home','meals','boat','kitchen'].includes(tab)) paintSkeleton({ cards: 3 });
  try { history.replaceState(null, '', location.pathname + location.search + (tab === 'home' ? '' : '#'+tab)); } catch (e) {}
  const fn = map[tab] || renderHome;
  Promise.resolve().then(fn).catch(function(e){ console.error(e); toast('Could not open '+(V3_TITLES[tab]||tab),'error'); });
  renderNav('#bottom-nav');
  renderDataStatus();
  const mc = $('#main-content'); if (mc) mc.scrollTop = 0;
  try { window.scrollTo(0, 0); } catch (e) {}
  if (tab === 'home') setTimeout(prefetchNextTabByRole, 400);
};

/* ============ E. Home ============ */
function v3CutoffTarget(meal){
  const n = getFijiNow(), h = n.getUTCHours();
  const at = function(hr){ const d = new Date(n.getTime()); d.setUTCHours(hr, 0, 0, 0); return d; };
  if (meal === 'dinner') return h < 20 ? { t: at(20), label:'closes 8:00pm' } : null;
  if (meal === 'lunch') return h < 13 ? { t: at(13), label:'closes 1:00pm' } : null;
  if (h < 13) return { t: at(13), label:'closes 1:00pm' };
  if (h < 18) return { t: at(18), label:'late request until 6:00pm', late:true };
  return null;
}
function v3Countdown(ms){
  if (ms <= 0) return '0s';
  const s = Math.floor(ms/1000), hh = Math.floor(s/3600), mm = Math.floor((s%3600)/60), ss = s%60;
  return (hh ? hh+'h ' : '') + (hh || mm ? String(mm).padStart(hh?2:1,'0')+'m ' : '') + String(ss).padStart(2,'0')+'s';
}
function v3TickCountdowns(){
  $$('[data-cd]').forEach(function(el){
    const t = Number(el.getAttribute('data-cd'));
    const left = t - getFijiNow().getTime();
    if (left <= 0) { el.textContent = 'Books closed'; el.classList.add('text-amber-300'); if (!state._v3ClosedRepaint) { state._v3ClosedRepaint = setTimeout(function(){ state._v3ClosedRepaint = null; if (['home','meals'].includes(state.tab) && !v3HomeTyping()) navigate(state.tab); }, 1500); } }
    else el.textContent = v3Countdown(left);
  });
  const ck = $('#v3-clock'); if (ck) ck.textContent = formatFiji();
}
function v3StartTicker(){
  if (state._v3Timer) clearInterval(state._v3Timer);
  v3TickCountdowns();
  state._v3Timer = setInterval(v3TickCountdowns, 1000);
}
/** The user's order for a meal on a date: newest active row, else newest row. */
function v3MyMeal(meal, date){
  const tom = fijiDateString(addFijiDays(getFijiNow(),1));
  let rows = null;
  if (date === tom) {
    const c = cachePeek(meal+'Orders:'+date);
    if (Array.isArray(c)) rows = c.map(function(o){ return Object.assign({ meal: meal }, o); });
  }
  if (!rows) rows = (v3Home().myMeals || []).filter(function(o){ return o.meal === meal && String(o.serviceDate).slice(0,10) === date; });
  if (!rows.length) return null;
  const active = rows.filter(function(o){ return !isInactiveMealStatus(o.status); });
  const pick = (active.length ? active : rows);
  return pick[pick.length - 1];
}
function v3CancelsUsed(meal){
  const tom = fijiDateString(addFijiDays(getFijiNow(),1));
  const c = cachePeek(meal+'Orders:'+tom);
  if (Array.isArray(c)) return c.filter(function(o){ return o.status === 'cancelled' && o.orderType !== 'special'; }).length;
  return ((v3Home().cancelsTomorrow) || {})[meal] || 0;
}
function v3MealLine(meal, o){
  if (!o) return '<span class="text-slate-400">Not ordered</span>';
  const choice = meal === 'dinner' && o.mealChoice ? '<span class="text-slate-100 font-medium">'+esc(o.mealChoice)+'</span> ' : '';
  return choice + v3Status(o.status);
}
function v3NextBoat(){
  const my = cachePeek('myOrders');
  const mine = [];
  if (my && my.days) ['today','tomorrow'].forEach(function(k){ ((my.days[k]||{}).boats||[]).forEach(function(b){ if (b.status !== 'cancelled') mine.push(b); }); });
  const runs = (cachePeek('boatRuns') || []).slice();
  const nowKey = fijiDateString() + ' ' + String(getFijiNow().getUTCHours()).padStart(2,'0') + ':' + String(getFijiNow().getUTCMinutes()).padStart(2,'0');
  const seatsLeft = function(r){ return Math.max(0, Number(r.capacity||0) - Number(r.paxBooked||0)); };
  if (mine.length) {
    const b = mine.sort(function(a,c){ return (a.date+a.time).localeCompare(c.date+c.time); })[0];
    const r = runs.find(function(x){ return String(x.id) === String(b.runId); });
    return { mine:true, date:b.date, time:b.time, route:b.route, seats:b.seats, left: r ? seatsLeft(r) : null };
  }
  const next = runs.filter(function(r){ return (String(r.date).slice(0,10)+' '+String(r.time||'')) >= nowKey && r.active !== false && !/cancel/i.test(String(r.status||'')); })
    .sort(function(a,c){ return (String(a.date)+a.time).localeCompare(String(c.date)+c.time); })[0];
  return next ? { mine:false, date:String(next.date).slice(0,10), time:next.time, route:next.route, left: seatsLeft(next) } : null;
}
function v3LeaveLine(){
  const l = ((v3Home().myLeave) || []).filter(function(x){ return x.status !== 'cancelled'; })[0];
  if (!l) return '';
  return '<div class="v3-row text-xs"><span class="text-slate-400 shrink-0"><i class="fa-solid fa-plane-departure mr-1 text-teal-400"></i>Leave</span>'+
    '<button type="button" onclick="navigate(\'leave\')" class="text-right min-w-0 truncate">'+esc(l.leaveType)+' '+esc(v3DateLabel(l.startDate))+(l.endDate!==l.startDate?' → '+esc(v3DateLabel(l.endDate)):'')+' '+v3Status(l.status)+'</button></div>';
}
function v3GreetingCard(){
  const u = state.user, today = fijiDateString();
  const boat = v3NextBoat();
  const todayRow = V3_MEALS.map(function(m){
    const o = v3MyMeal(m, today);
    return '<div class="v3-row text-xs"><span class="text-slate-400 shrink-0 w-20">'+V3_MEAL_LABEL[m]+'</span><span class="min-w-0 truncate text-right">'+v3MealLine(m, o)+'</span></div>';
  }).join('');
  return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="v3-greet">'+
    '<div class="flex items-center gap-3 min-w-0">'+homeAvatarHtml(u)+'<div class="min-w-0 flex-1">'+
    '<h2 class="text-lg font-semibold text-slate-100 truncate">Bula, '+esc(displayName(u))+'</h2>'+
    '<p class="text-[11px] text-slate-400 truncate">'+esc(v3RoleLabel(u))+' · '+esc(u.department||'—')+(state.demo?' · demo':'')+'</p>'+
    '<p class="text-[11px] text-teal-300 mt-0.5"><i class="fa-regular fa-clock mr-1"></i><span id="v3-clock" class="v3-countdown">'+formatFiji()+'</span></p></div></div>'+
    '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3 space-y-1.5"><p class="v3-section-title">Today · '+esc(v3DateLabel(today) === 'Today' ? WEEKDAY_NAMES[getFijiNow().getUTCDay()] : today)+'</p>'+todayRow+
    (boat ? '<div class="v3-row text-xs pt-1 border-t border-slate-700/50"><span class="text-slate-400 shrink-0"><i class="fa-solid fa-ship mr-1 text-teal-400"></i>'+(boat.mine?'My boat':'Next boat')+'</span>'+
      '<button type="button" onclick="navigate(\''+(boat.mine?'bookings':'boat')+'\')" class="text-right min-w-0 truncate text-slate-100">'+esc(v3DateLabel(boat.date))+' '+esc(boat.time)+' '+esc(boat.route||'')+
      (boat.left!=null?' · <span class="text-teal-300">'+boat.left+' seats left</span>':'')+'</button></div>' : '')+
    v3LeaveLine()+'</div></section>';
}
function v3OrdersGrid(){
  const tom = fijiDateString(addFijiDays(getFijiNow(),1));
  let anyClosed = false;
  const cards = V3_MEALS.map(function(m){
    const o = v3MyMeal(m, tom), cd = v3CutoffTarget(m);
    if (!cd) anyClosed = true;
    const open = !!cd && !cd.late;
    return '<button type="button" id="home-card-'+m+'" onclick="navigate(\''+m+'\')" class="meal-card-btn glass rounded-xl p-2.5 text-left min-w-0 '+(open?'meal-open-glow border-teal-600/40':'')+'">'+
      '<p class="text-[10px] uppercase tracking-wide text-slate-400"><i class="fa-solid '+V3_MEAL_ICON[m]+' mr-1"></i>'+V3_MEAL_LABEL[m]+'</p>'+
      '<p class="text-[11px] mt-1 min-w-0 truncate">'+(o ? (m==='dinner'&&o.mealChoice&&!isInactiveMealStatus(o.status) ? '<span class="font-medium text-slate-100">'+esc(o.mealChoice)+'</span>' : '') : '')+'</p>'+
      '<p class="mt-0.5">'+(o ? v3Status(o.status) : '<span class="text-[11px] text-slate-400">Not ordered</span>')+'</p>'+
      '<p class="text-[10px] mt-1 '+(cd?(cd.late?'text-orange-300':'text-teal-300'):'text-amber-300')+'">'+(cd ? '<span data-cd="'+cd.t.getTime()+'" class="v3-countdown">'+v3Countdown(cd.t.getTime()-getFijiNow().getTime())+'</span><br><span class="text-slate-500">'+cd.label+'</span>' : 'Books closed')+'</p></button>';
  }).join('');
  return '<section class="space-y-2 min-w-0" id="home-myorders">'+v3Title('fa-receipt','My orders · tomorrow '+esc(v3DateLabel(tom)==='Tomorrow'?WEEKDAY_NAMES[addFijiDays(getFijiNow(),1).getUTCDay()]:tom))+
    '<div class="grid grid-cols-3 gap-2" id="home-meal-grid">'+cards+'</div>'+
    (anyClosed ? '<p class="text-[11px] text-amber-200/90 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2" id="home-books-closed"><i class="fa-solid fa-lock mr-1"></i>Books closed — contact your department HOD, chef or management for a late meal request.</p>' : '')+
    '</section>';
}
function v3DoThisNow(){
  const h = v3Home(), hb = h.hodBar || {};
  let tiles = v3Tile(v3Nav('boat'),'fa-ship','Book a boat','Village runs') + v3Tile(v3Nav('bookings'),'fa-ticket','My bookings','Boat seats') +
    v3Tile("v3OpenLeaveForm()",'fa-plane-departure','Request leave', v3DeptOk()?'Day off, annual, sick':'After HOD accepts you') + v3Tile(v3Nav('meals'),'fa-utensils','Meals','Order, late request, menu');
  let extra = '';
  if (v3CanDept()) extra += v3Tile(v3Nav('leave'),'fa-calendar-check','Leave requests','View all · decide', (hb.leave||0)+(hb.leaveMgmt||0)) +
    v3Tile(v3Nav('approvals'),'fa-clock-rotate-left','Late meal requests','Department', hb.late||0) +
    v3Tile(v3Nav('deptstaff'),'fa-user-plus','Join requests','Department staff', hb.joins||0) +
    v3Tile(v3Nav('special'),'fa-star','Special meal order','No phone / contractor');
  if (v3CanChef()) extra += v3Tile(v3Nav(v3IsChef()?'chef':'chefreq'), 'fa-fire-burner', v3IsChef()?'Chef tab':'Chef section', 'Lists, requests, reports', h.chef ? (h.chef.pending.late + h.chef.pending.special) : 0);
  if (v3IsAdmin()) extra += v3Tile(v3Nav('manage'),'fa-sliders','Manage','Users, reminders, reports');
  return '<section class="space-y-2 min-w-0" id="home-dothisnow">'+v3Title('fa-bolt','Do this now')+'<div class="grid grid-cols-2 gap-2">'+tiles+'</div>'+
    (extra ? '<div class="grid grid-cols-2 gap-2 pt-1" id="home-lead-tiles">'+extra+'</div>' : '')+'</section>';
}
function v3HodBar(){
  const hb = v3Home().hodBar; if (!hb) return '';
  const cell = function(tab, n, label, icon){ return '<button type="button" onclick="navigate(\''+tab+'\')" class="rounded-xl p-2.5 text-left border min-w-0 '+(n?'border-amber-400/40 bg-amber-500/10':'border-slate-700/70 bg-slate-900/40')+'">'+
    '<p class="text-xl font-semibold '+(n?'text-amber-200':'text-slate-300')+'">'+n+'</p><p class="text-[10px] text-slate-400 leading-tight"><i class="fa-solid '+icon+' mr-1"></i>'+label+'</p></button>'; };
  const cells = cell('leave', hb.leave||0, 'Leave to review', 'fa-plane-departure') + cell('approvals', hb.late||0, 'Late meals', 'fa-clock') + cell('deptstaff', hb.joins||0, 'Join requests', 'fa-user-plus') +
    (v3IsAdmin() ? cell('leave', hb.leaveMgmt||0, 'Final approval', 'fa-stamp') : '');
  return '<section class="glass rounded-2xl p-3 space-y-2 min-w-0" id="v3-hodbar">'+v3Title('fa-clipboard-check', v3IsAdmin() ? 'Waiting for you (all departments)' : 'Waiting for you · '+esc(state.user.department||''))+
    '<div class="grid '+(v3IsAdmin()?'grid-cols-4':'grid-cols-3')+' gap-2">'+cells+'</div></section>';
}
function v3WeeklyChart(byDay){
  byDay = byDay || [];
  if (!byDay.length) return v3Empty('No orders yet this week.');
  const W = 320, H = 130, pad = 18, bw = Math.floor((W - pad*2) / byDay.length) - 6;
  const max = Math.max(1, ...byDay.map(function(d){ return (d.breakfast||0)+(d.lunch||0)+(d.dinner||0); }));
  const col = { breakfast:'#f59e0b', lunch:'#38bdf8', dinner:'#14b8a6' };
  let bars = '';
  byDay.forEach(function(d, i){
    const x = pad + i*(bw+6);
    let y = H - 22;
    ['breakfast','lunch','dinner'].forEach(function(m){
      const h = Math.round(((d[m]||0)/max) * (H - 40));
      if (h > 0) { y -= h; bars += '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="2" fill="'+col[m]+'"><title>'+esc(d.date)+' '+m+': '+(d[m]||0)+'</title></rect>'; }
    });
    const tot = (d.breakfast||0)+(d.lunch||0)+(d.dinner||0);
    bars += '<text x="'+(x+bw/2)+'" y="'+(y-3)+'" text-anchor="middle" font-size="9" fill="#cbd5e1">'+tot+'</text>';
    const p = String(d.date).split('-');
    const wd = WEEKDAY_NAMES[new Date(Date.UTC(+p[0], +p[1]-1, +p[2])).getUTCDay()].slice(0,2);
    bars += '<text x="'+(x+bw/2)+'" y="'+(H-8)+'" text-anchor="middle" font-size="9" fill="#94a3b8">'+wd+'</text>';
  });
  return '<svg viewBox="0 0 '+W+' '+H+'" class="w-full h-auto" role="img" aria-label="Orders per day, last 7 days">'+bars+'</svg>'+
    '<div class="flex gap-3 text-[10px] text-slate-400"><span><span class="inline-block w-2 h-2 rounded-sm mr-1" style="background:#f59e0b"></span>Breakfast</span><span><span class="inline-block w-2 h-2 rounded-sm mr-1" style="background:#38bdf8"></span>Lunch</span><span><span class="inline-block w-2 h-2 rounded-sm mr-1" style="background:#14b8a6"></span>Dinner</span></div>';
}
function v3ChefDashCard(c){
  if (!c) return '';
  const t = c.totals || { today:{}, tomorrow:{} };
  const num = function(label, a){ return '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2 text-center min-w-0"><p class="text-[10px] text-slate-400">'+label+'</p><p class="text-lg font-semibold text-slate-100">'+(a||0)+'</p></div>'; };
  const list = function(arr, key, tone){ return (arr||[]).length ? arr.map(function(x){ return '<div class="v3-row text-xs"><span class="truncate min-w-0">'+esc(x.dish)+'</span>'+v3Chip((key==='likes'?'<i class="fa-solid fa-thumbs-up"></i> ':'<i class="fa-solid fa-thumbs-down"></i> ')+x[key], tone)+'</div>'; }).join('') : v3Empty('No votes yet'); };
  return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="v3-chefdash">'+v3Title('fa-fire-burner','Chef dashboard','<button type="button" onclick="navigate(\'chef\')" class="text-xs text-teal-300">Open Chef tab <i class="fa-solid fa-chevron-right"></i></button>')+
    '<p class="text-[10px] text-slate-400">Tomorrow ('+esc(c.tomorrow||'')+') — counted orders</p>'+
    '<div class="grid grid-cols-3 gap-2">'+num('Breakfast', t.tomorrow.breakfast)+num('Lunch', t.tomorrow.lunch)+num('Dinner', t.tomorrow.dinner)+'</div>'+
    '<p class="text-[10px] text-slate-400">Today: '+(t.today.breakfast||0)+' breakfast · '+(t.today.lunch||0)+' lunch · '+(t.today.dinner||0)+' dinner</p>'+
    '<div class="grid grid-cols-3 gap-2">'+
      '<button type="button" onclick="navigate(\'chefreq\')" class="rounded-xl p-2 text-left border '+(c.pending.late?'border-amber-400/40 bg-amber-500/10':'border-slate-700/60')+'"><p class="text-lg font-semibold">'+c.pending.late+'</p><p class="text-[10px] text-slate-400">Late requests</p></button>'+
      '<button type="button" onclick="navigate(\'chefreq\')" class="rounded-xl p-2 text-left border '+(c.pending.special?'border-amber-400/40 bg-amber-500/10':'border-slate-700/60')+'"><p class="text-lg font-semibold">'+c.pending.special+'</p><p class="text-[10px] text-slate-400">Special requests</p></button>'+
      '<button type="button" onclick="navigate(\'chefcomments\')" class="rounded-xl p-2 text-left border '+(c.feedbackNew?'border-sky-400/40 bg-sky-500/10':'border-slate-700/60')+'"><p class="text-lg font-semibold">'+(c.feedbackNew||0)+'</p><p class="text-[10px] text-slate-400">New food comments</p></button></div>'+
    '<div class="grid grid-cols-2 gap-3 min-w-0"><div class="space-y-1 min-w-0"><p class="text-[10px] text-slate-400">Most liked</p>'+list(c.liked,'likes','ok')+'</div><div class="space-y-1 min-w-0"><p class="text-[10px] text-slate-400">Most disliked</p>'+list(c.disliked,'dislikes','bad')+'</div></div>'+
    '<div class="space-y-1"><p class="text-[10px] text-slate-400">Orders per day (last 7 days incl. tomorrow)</p>'+v3WeeklyChart(c.weekly)+'</div></section>';
}
function v3DeptBanner(){
  const s = v3DeptStatus();
  if (v3DeptOk()) return '';
  const txt = s === 'pending' ? 'Your request to join <strong>'+esc(state.user.department||'your department')+'</strong> is waiting for the HOD. Meals and boats work now; leave, late meal requests and department updates open once you are accepted.'
    : (s === 'declined' ? 'Your department request was declined. Contact your HOD or admin to fix your department.' : 'You are not in a department yet. Contact admin.');
  return '<div class="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 min-w-0" id="v3-dept-banner"><i class="fa-solid fa-hourglass-half mr-1"></i>'+txt+'</div>';
}
function v3DeptUpdatesBlock(list, compact){
  if (!v3DeptOk()) return '';
  list = list || [];
  const body = list.length ? list.map(function(u){ return v3UpdateCard(u, compact); }).join('') : v3Empty('No updates from your department yet.');
  return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="home-deptupdates">'+v3Title('fa-bullhorn','Department updates · '+esc(state.user.department||''),'<button type="button" onclick="navigate(\'deptupdates\')" class="text-xs text-teal-300">All <i class="fa-solid fa-chevron-right"></i></button>')+body+'</section>';
}
function v3UpdateCard(u, compact){
  const r = u.myReaction;
  return '<article class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3 space-y-2 min-w-0" data-upd="'+esc(u.id)+'">'+
    '<div class="min-w-0"><p class="text-sm font-semibold text-slate-100 break-words">'+esc(u.title||'Update')+'</p><p class="text-[10px] text-slate-400">'+esc(u.authorName)+' · '+esc(v3Ts(u.createdAt))+'</p></div>'+
    (u.body?'<p class="text-xs text-slate-300 whitespace-pre-line break-words">'+esc(compact && u.body.length>160 ? u.body.slice(0,160)+'…' : u.body)+'</p>':'')+
    '<div class="flex items-center gap-2 text-xs">'+
      '<button type="button" class="v3-react rounded-lg px-2 py-1 border '+(r==='like'?'border-teal-400/60 text-teal-200 bg-teal-500/15':'border-slate-600 text-slate-300')+'" data-id="'+esc(u.id)+'" data-kind="like" aria-label="Like"><i class="fa-solid fa-thumbs-up mr-1"></i>'+(u.likes||0)+'</button>'+
      '<button type="button" class="v3-react rounded-lg px-2 py-1 border '+(r==='dislike'?'border-rose-400/60 text-rose-200 bg-rose-500/15':'border-slate-600 text-slate-300')+'" data-id="'+esc(u.id)+'" data-kind="dislike" aria-label="Dislike"><i class="fa-solid fa-thumbs-down mr-1"></i>'+(u.dislikes||0)+'</button>'+
      '<span class="text-slate-400 ml-auto"><i class="fa-regular fa-comment mr-1"></i>'+((u.comments||[]).length)+'</span></div>'+
    (compact ? '' : '<div class="space-y-1.5">'+(u.comments||[]).map(function(c){ return '<p class="text-[11px] text-slate-300 break-words"><span class="text-teal-300">'+esc(c.userName)+':</span> '+esc(c.text)+' <span class="text-slate-500">'+esc(v3Ts(c.createdAt))+'</span></p>'; }).join('')+
      '<div class="flex gap-2"><input class="ui-input flex-1 min-w-0 text-xs v3-cmt" maxlength="400" placeholder="Write a comment" data-id="'+esc(u.id)+'"/><button type="button" class="v3-cmt-send rounded-lg px-3 text-xs border border-teal-500/40 text-teal-300" data-id="'+esc(u.id)+'">Send</button></div>'+
      (u.canDelete?'<button type="button" class="v3-upd-del text-[11px] text-rose-300" data-id="'+esc(u.id)+'"><i class="fa-solid fa-trash mr-1"></i>Remove post</button>':'')+'</div>')+
    '</article>';
}
function v3BindUpdateCards(root, after){
  root = root || document;
  root.querySelectorAll('.v3-react').forEach(function(b){ b.onclick = async function(){
    const cur = b.classList.contains('bg-teal-500/15') || b.classList.contains('bg-rose-500/15');
    const d = await v3Call('reactDeptUpdate', { id: b.dataset.id, kind: cur ? 'none' : b.dataset.kind });
    if (d) { cacheInvalidate(['v3home','deptUpdates']); after(); }
  }; });
  root.querySelectorAll('.v3-cmt-send').forEach(function(b){ b.onclick = async function(){
    const inp = root.querySelector('.v3-cmt[data-id="'+b.dataset.id+'"]'); const text = inp ? inp.value.trim() : '';
    if (!text) { toast('Write a comment first','error'); return; }
    const d = await v3Call('commentDeptUpdate', { id: b.dataset.id, text: text }, 'Comment posted');
    if (d) { cacheInvalidate(['v3home','deptUpdates']); after(); }
  }; });
  root.querySelectorAll('.v3-upd-del').forEach(function(b){ b.onclick = async function(){
    if (!confirm('Remove this post for everyone?')) return;
    const d = await v3Call('deleteDeptUpdate', { id: b.dataset.id }, 'Post removed');
    if (d) { cacheInvalidate(['v3home','deptUpdates']); after(); }
  }; });
}
function v3SuggestionBox(){
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="home-suggest">'+v3Title('fa-lightbulb','Suggestion box')+
    '<p class="text-[11px] text-slate-400">Ideas to make work or the app better. Management reads every one.</p>'+
    '<input id="sug-title" class="ui-input w-full" maxlength="100" placeholder="Short title"/>'+
    '<textarea id="sug-body" class="ui-input w-full" rows="2" maxlength="800" placeholder="Your idea (optional details)"></textarea>'+
    '<button type="button" id="sug-send" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">Send suggestion</button></section>';
}
function v3BindSuggestionBox(){
  const b = $('#sug-send'); if (!b) return;
  b.onclick = async function(){
    const title = ($('#sug-title').value||'').trim(), body = ($('#sug-body').value||'').trim();
    if (title.length < 3) { toast('Give your suggestion a short title','error'); return; }
    b.disabled = true;
    const d = await v3Call('addSuggestion', { title: title, body: body }, 'Thanks — suggestion sent');
    b.disabled = false;
    if (d) { $('#sug-title').value = ''; $('#sug-body').value = ''; cacheInvalidate(['suggestions']); }
  };
}
function v3RemindersStrip(){
  const rem = (cachePeek('reminders') || []).filter(function(r){ return !(r.done === true || r.done === 'TRUE'); }).slice(0, 3);
  if (!rem.length) return '';
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="home-reminders">'+v3Title('fa-bell','Reminders from management')+
    rem.map(function(r){ const imp = r.important === true || r.important === 'TRUE' || String(r.priority).toLowerCase() === 'high';
      return '<div class="rounded-xl border '+(imp?'border-amber-400/40 bg-amber-500/10':'border-slate-700/60 bg-slate-900/40')+' p-2.5 min-w-0"><p class="text-xs font-semibold text-slate-100 break-words">'+(imp?'<i class="fa-solid fa-triangle-exclamation text-amber-300 mr-1"></i>':'')+esc(r.title)+'</p>'+
        (r.body?'<p class="text-[11px] text-slate-300 break-words">'+esc(r.body)+'</p>':'')+(r.dueDate?'<p class="text-[10px] text-slate-500">Due '+esc(String(r.dueDate).slice(0,10))+'</p>':'')+'</div>'; }).join('')+'</section>';
}
function renderHome(){
  if (v3IsSuper()) return v3RenderSuperHome();
  const h = v3Home();
  $('#main-content').innerHTML = v3Page(
    v3GreetingCard() + v3DeptBanner() + queueHostHtml('*') +
    (v3CanDept() ? v3HodBar() : '') +
    (v3IsChef() ? v3ChefDashCard(h.chef) : '') +
    v3OrdersGrid() + v3DoThisNow() +
    v3DeptUpdatesBlock(h.deptUpdates, true) +
    v3SuggestionBox() + v3RemindersStrip() +
    '<p class="text-center text-[10px] text-slate-500" id="home-ver">UI '+APP_VERSION+(state.backendVersion?' · API '+esc(state.backendVersion):'')+(state.demo?' · demo':'')+'</p>', 'home');
  bindQueueButtons();
  v3BindUpdateCards($('#home-deptupdates'), function(){ v3RefreshHome().then(function(){ if (state.tab === 'home') renderHome(); }); });
  v3BindSuggestionBox();
  v3StartTicker();
  if (!cacheGet('v3home')) {
    bootWait().then(function(){
      if (cacheGet('v3home') || state.tab !== 'home') return;
      v3RefreshHome().then(function(){ if (state.tab === 'home' && !v3HomeTyping()) renderHome(); });
    });
  }
  if (!cachePeek('boatRuns')) api('getBoatRuns', boatRunsRangeParams()).then(function(r){ if (r && r.success) { cacheSet('boatRuns', (r.data && r.data.runs) || []); if (state.tab === 'home' && !v3HomeTyping()) { const g = $('#v3-greet'); if (g) g.outerHTML = v3GreetingCard(); } } }).catch(function(){});
}

/* ============ F. Leave ============ */
function v3OpenLeaveForm(){
  if (!v3DeptOk()) { toast('Leave requests open after your HOD accepts your department request','error'); return; }
  const tom = fijiDateString(addFijiDays(getFijiNow(),1));
  v3Form('Request leave', [
    { id:'leaveType', label:'Type', type:'select', options: V3_LEAVE_TYPES, value:'Day off' },
    { id:'startDate', label:'First day', type:'date', value: tom, required:true },
    { id:'endDate', label:'Last day', type:'date', value: tom, required:true },
    { id:'reason', label:'Reason', type:'textarea', placeholder:'e.g. family function in the village', required:true, max:500 }
  ], 'Send request', async function(v){
    const d = await v3Call('submitLeave', Object.assign({ clientRequestId: newRequestId() }, v), v3IsLead() || v3IsAdmin() ? 'Sent to management for approval' : 'Sent to your HOD');
    if (!d) return false;
    cacheInvalidate(['v3home','leave:mine']); v3RefreshHome();
    if (state.tab === 'leave') v3RenderLeave(); else if (state.tab === 'home') renderHome();
    return true;
  }, v3IsLead() || v3IsAdmin() ? 'Your own leave goes straight to management (admin) for approval.' : 'Your HOD (or assistant HOD) reviews it first, then management gives final approval.');
}
function v3LeaveSteps(l){
  const step = function(label, st, by, at, note){
    const tone = st === 'approved' ? 'ok' : (st === 'declined' ? 'bad' : (st === 'skipped' ? 'mute' : 'warn'));
    const txt = st === 'approved' ? 'Approved' : st === 'declined' ? 'Declined' : st === 'skipped' ? 'Not needed' : 'Waiting';
    return '<div class="flex items-start gap-2 text-[11px] min-w-0"><span class="shrink-0 w-24 text-slate-400">'+label+'</span><span class="min-w-0">'+v3Chip(txt, tone)+
      (by?' <span class="text-slate-400">'+esc(String(by).split('@')[0])+'</span>':'')+(at?' <span class="text-slate-500">'+esc(v3Ts(at))+'</span>':'')+(note?'<br><span class="text-slate-300">“'+esc(note)+'”</span>':'')+'</span></div>';
  };
  const cancelled = l.status === 'cancelled';
  const hodSt = l.hodStatus || (l.status === 'pending_hod' ? 'pending' : (l.status === 'rejected' && !l.mgmtStatus ? 'declined' : 'approved'));
  const mgSt = l.status === 'approved' ? 'approved' : (l.status === 'rejected' && hodSt !== 'declined' ? 'declined' : (hodSt === 'declined' ? '' : 'pending'));
  return '<div class="space-y-1 pt-1">'+step('Sent', 'approved', '', l.createdAt, '')+step('HOD', hodSt, l.hodBy, l.hodAt, l.hodNote)+
    (mgSt ? step('Management', mgSt, l.mgmtBy, l.mgmtAt, l.managerNote) : '')+(cancelled?'<p class="text-[11px] text-slate-400">Cancelled '+esc(v3Ts(l.cancelledAt))+'</p>':'')+'</div>';
}
function v3LeaveCard(l, mode){
  const pending = /pending/.test(l.status);
  const future = String(l.startDate) > fijiDateString();
  let actions = '';
  if (mode === 'mine') {
    if (pending) actions += '<button type="button" class="v3-lv-esc flex-1 rounded-lg py-2 text-xs border border-sky-500/40 text-sky-200" data-id="'+esc(l.id)+'"><i class="fa-solid fa-envelope mr-1"></i>Escalate</button>';
    if (pending || (l.status === 'approved' && future)) actions += '<button type="button" class="v3-lv-cancel flex-1 rounded-lg py-2 text-xs border border-rose-500/40 text-rose-200" data-id="'+esc(l.id)+'"><i class="fa-solid fa-xmark mr-1"></i>Cancel</button>';
  } else if (l.canDecide) {
    actions = '<button type="button" class="v3-lv-dec flex-1 rounded-lg py-2 text-xs border border-rose-500/40 text-rose-200" data-id="'+esc(l.id)+'" data-d="decline">Decline</button>'+
      '<button type="button" class="v3-lv-dec flex-1 btn-primary rounded-lg py-2 text-xs text-white font-semibold" data-id="'+esc(l.id)+'" data-d="approve">'+(l.status==='pending_manager'?'Final approve':'Approve → management')+'</button>';
  }
  return '<article class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3 space-y-2 min-w-0">'+
    '<div class="v3-row"><div class="min-w-0"><p class="text-sm font-semibold text-slate-100 truncate">'+(mode==='mine'?esc(l.leaveType):esc(l.userName)+' <span class="text-slate-400 font-normal text-xs">· '+esc(l.leaveType)+'</span>')+'</p>'+
    '<p class="text-[11px] text-slate-300">'+esc(v3DateLabel(l.startDate))+(l.endDate!==l.startDate?' → '+esc(v3DateLabel(l.endDate)):'')+(mode!=='mine'?' · '+esc(l.department):'')+'</p></div>'+v3Status(l.status)+'</div>'+
    '<p class="text-xs text-slate-300 break-words">'+esc(l.reason)+'</p>'+v3LeaveSteps(l)+
    (l.escalatedAt?'<p class="text-[10px] text-sky-300">Escalated by email '+esc(v3Ts(l.escalatedAt))+'</p>':'')+
    (actions?'<div class="flex gap-2 pt-1">'+actions+'</div>':'')+'</article>';
}
function v3BindLeaveCards(root, after){
  root.querySelectorAll('.v3-lv-esc').forEach(function(b){ b.onclick = async function(){
    if (!confirm('Email this request to your HOD, assistant HOD and admins now?')) return;
    const d = await v3Call('escalateLeave', { id: b.dataset.id });
    if (d) { toast(d.emailed ? 'Escalated — emailed '+d.emailed+' people' : 'Escalated — they have been notified in the app', 'ok'); after(); }
  }; });
  root.querySelectorAll('.v3-lv-cancel').forEach(function(b){ b.onclick = async function(){
    if (!confirm('Cancel this leave request?')) return;
    const d = await v3Call('cancelLeave', { id: b.dataset.id }, 'Leave request cancelled');
    if (d) { cacheInvalidate(['v3home']); v3RefreshHome(); after(); }
  }; });
  root.querySelectorAll('.v3-lv-dec').forEach(function(b){ b.onclick = function(){
    const approve = b.dataset.d === 'approve';
    v3Form(approve ? 'Approve leave' : 'Decline leave', [{ id:'note', label: approve ? 'Note (optional)' : 'Reason for declining', type:'textarea', required: !approve, max:300 }],
      approve ? 'Approve' : 'Decline', async function(v){
        const d = await v3Call('decideLeave', { id: b.dataset.id, decision: approve ? 'approve' : 'decline', note: v.note }, approve ? 'Approved' : 'Declined');
        if (!d) return false;
        cacheInvalidate(['v3home']); v3RefreshHome(); after(); return true;
      });
  }; });
}
async function v3RenderLeave(){
  const tabs = [{ id:'mine', label:'My leave' }];
  if (v3CanDept()) tabs.push({ id:'dept', label: v3IsAdmin() ? 'HOD step' : 'Department' });
  if (v3IsAdmin()) tabs.push({ id:'final', label:'Final approval' });
  let cur = state.leaveTab && tabs.some(function(t){ return t.id === state.leaveTab; }) ? state.leaveTab : (v3IsAdmin() ? 'final' : (v3CanDept() ? 'dept' : 'mine'));
  if (state.leaveTabForce) { cur = state.leaveTabForce; state.leaveTabForce = null; }
  state.leaveTab = cur;
  $('#main-content').innerHTML = v3Page(v3Back('more','More') +
    (tabs.length > 1 ? '<div class="grid gap-1 rounded-xl bg-slate-900/60 p-1" style="grid-template-columns:repeat('+tabs.length+',1fr)">'+tabs.map(function(t){ return '<button type="button" class="v3-seg rounded-lg py-2 text-xs '+(t.id===cur?'bg-teal-600 text-white font-semibold':'text-slate-300')+'" data-t="'+t.id+'">'+t.label+'</button>'; }).join('')+'</div>' : '')+
    (cur === 'mine' ? '<button type="button" id="lv-new" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white"><i class="fa-solid fa-plus mr-1"></i>New leave request</button>' : '')+
    '<div id="lv-list" class="space-y-2">'+v3Loading()+'</div>', 'leave-root');
  $$('.v3-seg').forEach(function(b){ b.onclick = function(){ state.leaveTab = b.dataset.t; v3RenderLeave(); }; });
  const nb = $('#lv-new'); if (nb) nb.onclick = v3OpenLeaveForm;
  const scope = cur === 'mine' ? 'mine' : (v3IsAdmin() ? 'all' : 'dept');
  const d = await v3Call('getLeave', { scope: scope });
  if (state.tab !== 'leave') return;
  const me = String(state.user.email).toLowerCase();
  let rows = (d && d.requests) || [];
  if (cur === 'dept') rows = rows.filter(function(l){ return String(l.userEmail).toLowerCase() !== me; }).map(function(l){ l.canDecide = l.status === 'pending_hod'; return l; });
  if (cur === 'final') rows = rows.filter(function(l){ return String(l.userEmail).toLowerCase() !== me; }).map(function(l){ l.canDecide = l.status === 'pending_manager'; return l; });
  if (cur !== 'mine') rows.sort(function(a,b){ return (b.canDecide?1:0) - (a.canDecide?1:0); });
  const list = $('#lv-list');
  const pendingN = rows.filter(function(l){ return l.canDecide; }).length;
  list.innerHTML = (cur !== 'mine' ? '<p class="text-[11px] text-slate-400">'+pendingN+' waiting for your decision'+(cur==='final'?' (already approved by the HOD)':'')+'</p>' : '') +
    (rows.length ? rows.map(function(l){ return v3LeaveCard(l, cur === 'mine' ? 'mine' : 'review'); }).join('') : v3Empty(cur === 'mine' ? 'You have no leave requests yet.' : 'Nothing here.'));
  v3BindLeaveCards(list, v3RenderLeave);
}

/* ============ G. Meals (one page) ============ */
const V3_ORDER_ACTION = { breakfast:'placeBreakfastOrder', lunch:'placeLunchOrder', dinner:'placeDinnerOrder' };
const V3_GET_ACTION = { breakfast:'getBreakfastOrders', lunch:'getLunchOrders', dinner:'getDinnerOrders' };
function v3Info(meal){ return meal === 'breakfast' ? breakfastCutoffInfo() : (meal === 'lunch' ? lunchCutoffInfo() : dinnerCutoffInfo()); }
function v3MealRows(meal){ const i = v3Info(meal); return cachePeek(meal+'Orders:'+i.serviceDate); }
async function v3FetchMeal(meal, force){
  const i = v3Info(meal), key = meal+'Orders:'+i.serviceDate;
  if (!force && cacheGet(key)) return cachePeek(key);
  const r = await api(V3_GET_ACTION[meal], { userEmail: state.user.email, serviceDate: i.serviceDate });
  const rows = ((r && r.data && r.data.orders) || []).filter(function(o){ return String(o.userEmail).toLowerCase() === String(state.user.email).toLowerCase(); });
  cacheSet(key, rows);
  return rows;
}
async function v3FetchMenu(force){
  const di = dinnerCutoffInfo(), key = 'dinnerMenus:'+di.serviceDate;
  if (!force && cacheGet(key)) return cachePeek(key);
  const m = await api('getDinnerMenus', { serviceDate: di.serviceDate, includePreviousDay:false });
  const pack = (m && m.data) || {};
  cacheSet(key, pack);
  return pack;
}
function v3MenuItems(pack){
  pack = pack || cachePeek('dinnerMenus:'+dinnerCutoffInfo().serviceDate) || {};
  const items = Array.isArray(pack) ? pack : (pack.serviceItems || pack.items || []);
  return items.map(function(it){ return String(it.itemName || it.name || ''); }).filter(Boolean);
}
function v3StatusBlock(){
  const today = fijiDateString(), tom = fijiDateString(addFijiDays(getFijiNow(),1)), yest = fijiDateString(addFijiDays(getFijiNow(),-1));
  let rows = (v3Home().myMeals || []).slice();
  // tomorrow: the freshest copy is the per-meal list
  V3_MEALS.forEach(function(m){ const c = v3MealRows(m); if (Array.isArray(c)) { rows = rows.filter(function(o){ return !(o.meal === m && String(o.serviceDate).slice(0,10) === tom); }).concat(c.map(function(o){ return Object.assign({ meal:m }, o); })); } });
  rows = rows.filter(function(o){ const d = String(o.serviceDate).slice(0,10); return d >= yest && d <= tom; });
  rows.sort(function(a,b){ return (String(b.serviceDate)+String(b.createdAt)).localeCompare(String(a.serviceDate)+String(a.createdAt)); });
  const line = function(o){
    return '<div class="flex items-start gap-2 py-2 border-b border-slate-700/40 last:border-0 min-w-0">'+
      '<i class="fa-solid '+V3_MEAL_ICON[o.meal]+' text-teal-400 w-4 mt-0.5 text-center"></i><div class="flex-1 min-w-0">'+
      '<div class="v3-row"><p class="text-xs text-slate-100 truncate min-w-0">'+esc(V3_MEAL_LABEL[o.meal])+' · '+esc(v3DateLabel(String(o.serviceDate).slice(0,10)))+(o.meal==='dinner'&&o.mealChoice?' · <span class="font-semibold">'+esc(o.mealChoice)+'</span>':'')+'</p>'+v3Status(o.status)+'</div>'+
      '<p class="text-[10px] text-slate-500">Ordered '+esc(v3Ts(o.createdAt))+(o.orderType==='late_request'?' · late request':'')+(o.cancelReason?' · cancelled: '+esc(o.cancelReason):'')+(kitchenNoteOf(o)?' · note: '+esc(kitchenNoteOf(o)):'')+'</p></div></div>';
  };
  const cancelInfo = ['breakfast','lunch'].map(function(m){ const n = v3CancelsUsed(m); return V3_MEAL_LABEL[m]+' cancels '+n+'/3'; }).join(' · ');
  return '<section class="glass rounded-2xl p-4 space-y-1 min-w-0" id="meal-status">'+v3Title('fa-list-check','My meal orders')+'<p class="text-[10px] text-slate-400">Tomorrow: '+esc(cancelInfo)+'</p>'+
    (rows.length ? rows.map(line).join('') : v3Empty('No meal orders from yesterday to tomorrow yet.'))+'</section>';
}
function v3ClosedBox(meal){
  return '<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2"><p class="text-sm text-amber-200"><i class="fa-solid fa-lock mr-1"></i>Books closed</p>'+
    '<p class="text-[11px] text-amber-100/80">Contact your department HOD, chef or management for a late meal request.</p>'+
    (v3DeptOk() ? '<button type="button" class="v3-go-late text-xs text-teal-300 underline" data-meal="'+meal+'">Send a late meal request</button>' : '')+'</div>';
}
function v3MealCard(meal){
  const info = v3Info(meal), rows = v3MealRows(meal) || [];
  const active = rows.filter(function(o){ return !isInactiveMealStatus(o.status); });
  const cur = active[active.length-1] || null;
  const st = cur && cur.status;
  const used = rows.filter(function(o){ return o.status === 'cancelled' && o.orderType !== 'special'; }).length;
  const blocked = meal !== 'dinner' && used >= 3 && !cur;
  const cd = v3CutoffTarget(meal);
  const idp = meal === 'breakfast' ? 'bf' : (meal === 'lunch' ? 'lu' : 'dinner');
  const noteId = meal === 'dinner' ? 'dinner-notes' : idp+'-note';
  let body = '';
  const statusLine = cur ? '<div class="v3-row text-xs"><span class="text-slate-300 min-w-0 truncate">'+(meal==='dinner'?'Your dinner: <strong class="text-slate-100">'+esc(cur.mealChoice)+'</strong>':'You are counted in')+'</span>'+v3Status(st)+'</div>'+myNoteLine(cur) : '';
  if (meal === 'dinner') {
    const items = v3MenuItems();
    const opts = (items.length ? items : ['Standard','Vegetarian']).map(function(n){ return '<option'+(cur && cur.mealChoice === n ? ' selected' : '')+'>'+esc(n)+'</option>'; }).join('');
    if (info.open) {
      body = statusLine + '<label class="text-[10px] text-slate-400" for="dinner-choice">Choose from tomorrow\'s menu</label><select id="dinner-choice" class="ui-input w-full">'+opts+'</select>'+
        mealNoteInputHtml('dinner-notes', cur ? kitchenNoteOf(cur) : '')+
        '<button id="btn-dinner" class="btn-primary w-full rounded-xl py-3 text-base font-semibold text-white min-h-[48px]">'+(cur?'Change dinner':'Book dinner')+'</button>'+
        (cur ? '<button id="btn-dinner-cancel" class="w-full rounded-xl py-2 text-xs text-amber-300 border border-amber-500/30">Cancel dinner</button>' : '');
    } else {
      body = statusLine + (cur ? '' : '<p class="text-xs text-slate-400">No dinner booked for tomorrow.</p>') +
        '<div class="grid grid-cols-2 gap-2"><button id="btn-dinner" class="rounded-xl py-2.5 text-xs border border-slate-600 text-slate-300">'+(cur?'Change dinner':'Book dinner')+'</button>'+
        '<button id="btn-dinner-cancel" class="rounded-xl py-2.5 text-xs border border-slate-600 text-slate-300">Cancel dinner</button></div><div id="dinner-closed-msg"></div>' + v3ClosedBox('dinner');
    }
  } else if (blocked) {
    body = '<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100" id="'+idp+'-blocked"><i class="fa-solid fa-ban mr-1"></i>You cancelled '+V3_MEAL_LABEL[meal].toLowerCase()+' for '+esc(v3DateLabel(info.serviceDate))+' 3 times, so it is locked. Contact your HOD or chef if you still need it.</div>';
  } else if (info.open) {
    body = statusLine + mealNoteInputHtml(noteId, cur ? kitchenNoteOf(cur) : '')+
      '<button id="btn-'+meal+'" class="btn-primary w-full rounded-xl py-3 text-base font-semibold text-white min-h-[48px]">'+(cur?'Update note':'Count me in')+'</button>'+
      (cur ? '<button id="btn-'+meal+'-cancel" class="w-full rounded-xl py-2 text-xs text-amber-300 border border-amber-500/30">Cancel ('+used+' of 3 cancels used)</button>' : (used ? '<p class="text-[10px] text-slate-400">'+used+' of 3 cancels used for this date.</p>' : ''));
  } else if (meal === 'breakfast' && info.lateOpen) {
    if (st === 'late_pending') body = statusLine + '<p class="text-[11px] text-orange-200">Late breakfast request sent — the chef decides before 6:00pm.</p><button id="btn-breakfast-cancel" class="w-full rounded-xl py-2 text-xs text-amber-300 border border-amber-500/30">Withdraw late request</button>';
    else if (cur) body = statusLine;
    else body = '<div class="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 space-y-2"><p class="text-xs text-orange-200"><i class="fa-solid fa-clock mr-1"></i>Normal breakfast closed at 1:00pm. Late requests until 6:00pm need the chef\'s OK.</p>'+
      mealNoteInputHtml('bf-note','')+'<button id="btn-breakfast-late" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white">Request late breakfast</button></div>';
  } else {
    body = statusLine + v3ClosedBox(meal);
  }
  return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="meal-card-'+meal+'">'+
    '<div class="v3-row"><h3 class="font-semibold text-slate-100"><i class="fa-solid '+V3_MEAL_ICON[meal]+' text-teal-400 mr-2"></i>'+V3_MEAL_LABEL[meal]+' <span class="text-xs text-slate-400 font-normal">· '+esc(v3DateLabel(info.serviceDate))+'</span></h3>'+
    '<span class="text-[10px] '+(cd?(cd.late?'text-orange-300':'text-teal-300'):'text-amber-300')+'">'+(cd?'<span data-cd="'+cd.t.getTime()+'" class="v3-countdown">'+v3Countdown(cd.t.getTime()-getFijiNow().getTime())+'</span> left':'Closed')+'</span></div>'+
    '<p class="text-[10px] text-slate-400">'+(meal==='dinner'?'Order by 8:00pm today for tomorrow\'s dinner.':(meal==='lunch'?'Order by 1:00pm today for tomorrow\'s lunch.':'Order by 1:00pm today · late requests 1–6pm.'))+'</p>'+
    body+'</section>';
}
function v3AskCancelReason(meal, onReason){
  v3Form('Cancel '+V3_MEAL_LABEL[meal].toLowerCase(), [
    { id:'why', label:'Reason', type:'select', options:['Going to the mainland','Working through the meal','Not hungry / eating elsewhere','Ordered by mistake','Other'], value:'Going to the mainland' },
    { id:'more', label:'Details (optional)', type:'text', max:150 }
  ], 'Cancel order', async function(v){ return onReason((v.why + (v.more ? ' — ' + v.more : '')).slice(0,200)); },
  meal === 'dinner' ? 'Dinner can be changed or cancelled until 8:00pm.' : 'You can cancel and re-order up to 3 times for the same day. After the 3rd cancel this meal is locked.');
}
async function v3AfterMealChange(meal){
  cacheInvalidate([meal+'Orders:'+v3Info(meal).serviceDate, 'kitchenDashboard', 'v3home', 'myOrders']);
  try { await v3FetchMeal(meal, true); } catch (e) {}
  v3RefreshHome().then(function(){ if (state.tab === 'meals') v3PaintMeals(); });
  if (state.tab === 'meals') v3PaintMeals();
}
function v3BindMealCards(){
  V3_MEALS.forEach(function(meal){
    const info = v3Info(meal);
    const label = V3_MEAL_LABEL[meal]+' ('+info.serviceDate+')';
    const place = async function(extra){
      const payload = Object.assign({}, extra || {});
      const nid = meal === 'dinner' ? 'dinner-notes' : (meal === 'breakfast' ? 'bf-note' : 'lu-note');
      const nv = mealNoteValue(nid); if (nv !== undefined) { payload.specialNote = nv; payload.notes = nv; }
      if (meal === 'dinner') { payload.mealChoice = $('#dinner-choice').value; saveLastDinner(payload.mealChoice, nv); }
      const r = await sendOrQueue(V3_ORDER_ACTION[meal], payload, { label: label, serviceDate: info.serviceDate });
      if (!r.success) { toast(r.error || 'Could not place the order','error'); return; }
      if (r.queued) { toast('No connection — saved on this phone, will send automatically','info'); renderQueueAreas(); return; }
      toast(payload.allowLate ? 'Late request sent — waiting for the chef' : (meal === 'dinner' ? 'Dinner booked: '+payload.mealChoice : V3_MEAL_LABEL[meal]+' — you are counted in'), 'ok');
      v3AfterMealChange(meal);
    };
    const b = $('#btn-'+meal);
    if (b) b.onclick = function(){
      if (meal === 'dinner' && !info.open) { v3DinnerClosedMsg(); return; }
      place();
    };
    const late = $('#btn-'+meal+'-late'); if (late) late.onclick = function(){ place({ allowLate:true }); };
    const c = $('#btn-'+meal+'-cancel');
    if (c) c.onclick = function(){
      const rows = v3MealRows(meal) || [];
      const cur = rows.filter(function(o){ return !isInactiveMealStatus(o.status); }).pop();
      if (meal === 'dinner' && !info.open && !(cur && cur.status === 'late_pending')) { v3DinnerClosedMsg(); return; }
      if (!cur) { toast('No active order to cancel','error'); return; }
      v3AskCancelReason(meal, async function(reason){
        const r = await sendOrQueue('cancelMealOrder', { meal: meal, reason: reason, cancelReason: reason }, { label: 'Cancel '+label, serviceDate: info.serviceDate });
        if (!r.success) { toast(r.error || 'Could not cancel','error'); return false; }
        if (r.queued) { toast('No connection — cancel saved, will send automatically','info'); return true; }
        const used = r.data && r.data.cancelsUsed;
        toast(V3_MEAL_LABEL[meal]+' cancelled'+(meal !== 'dinner' && used ? ' ('+used+' of 3 cancels used)' : ''), 'ok');
        v3AfterMealChange(meal);
        return true;
      });
    };
  });
  $$('.v3-go-late').forEach(function(b){ b.onclick = function(){ const s = $('#late-meal'); if (s) { s.scrollIntoView({ behavior:'smooth', block:'start' }); const sel = $('#late-slot'); if (sel) { const o = [...sel.options].find(function(x){ return x.value.indexOf(b.dataset.meal+'|') === 0; }); if (o) sel.value = o.value; sel.dispatchEvent(new Event('change')); } } }; });
}
function v3DinnerClosedMsg(){
  const m = $('#dinner-closed-msg');
  const html = '<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100" id="dinner-hod-msg"><i class="fa-solid fa-circle-info mr-1"></i>Contact your HOD for a late meal request.</div>';
  if (m) m.innerHTML = html;
  toast('Contact your HOD for a late meal request','error');
}
/* late meal request (after department approval) */
function v3LateSlots(){
  const n = getFijiNow(), h = n.getUTCHours(), today = fijiDateString(), tom = fijiDateString(addFijiDays(n,1));
  const out = [];
  // today's meals only while they can still be served
  if (h < 9) out.push({ meal:'breakfast', date: today });
  if (h < 13) out.push({ meal:'lunch', date: today });
  if (h < 19) out.push({ meal:'dinner', date: today });
  V3_MEALS.forEach(function(m){ const i = v3Info(m); if (!i.open && !(m === 'breakfast' && i.lateOpen)) out.push({ meal:m, date: tom }); });
  return out;
}
function v3LateCard(){
  const head = v3Title('fa-clock-rotate-left','Late meal request');
  if (!v3DeptOk()) return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="late-meal">'+head+'<p class="text-xs text-slate-400"><i class="fa-solid fa-lock mr-1"></i>Available after your HOD accepts your department request.</p></section>';
  const slots = v3LateSlots();
  if (!slots.length) return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="late-meal">'+head+'<p class="text-xs text-slate-400">All of tomorrow\'s meals are still open — just order above.</p></section>';
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="late-meal">'+head+
    '<p class="text-[11px] text-slate-400">Missed a cutoff? This goes to the chef, admin and your HOD / assistant HOD. It only counts once approved.</p>'+
    '<label class="text-[10px] text-slate-400" for="late-slot">Meal</label><select id="late-slot" class="ui-input w-full">'+slots.map(function(s){ return '<option value="'+s.meal+'|'+s.date+'">'+V3_MEAL_LABEL[s.meal]+' · '+esc(v3DateLabel(s.date))+'</option>'; }).join('')+'</select>'+
    '<div id="late-dish-wrap" class="space-y-1"></div>'+
    '<label class="text-[10px] text-slate-400" for="late-reason">Reason *</label><input id="late-reason" class="ui-input w-full" maxlength="300" placeholder="e.g. came back on the late boat"/>'+
    mealNoteInputHtml('late-note','')+
    '<button type="button" id="btn-late-meal" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white">Send late meal request</button></section>';
}
function v3BindLateCard(){
  const sel = $('#late-slot'); if (!sel) return;
  const paintDish = function(){
    const parts = sel.value.split('|'), wrap = $('#late-dish-wrap');
    if (parts[0] !== 'dinner') { wrap.innerHTML = ''; return; }
    const items = parts[1] === dinnerCutoffInfo().serviceDate ? v3MenuItems() : [];
    wrap.innerHTML = '<label class="text-[10px] text-slate-400" for="late-dish">Dish</label>'+(items.length ? '<select id="late-dish" class="ui-input w-full">'+items.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('')+'</select>' : '<input id="late-dish" class="ui-input w-full" maxlength="80" placeholder="Dish (if you know it) — else Standard"/>');
  };
  sel.onchange = paintDish; paintDish();
  $('#btn-late-meal').onclick = async function(){
    const parts = sel.value.split('|'), reason = ($('#late-reason').value||'').trim();
    if (!reason) { toast('Please give a reason','error'); $('#late-reason').focus(); return; }
    const payload = { meal: parts[0], serviceDate: parts[1], reason: reason, specialNote: mealNoteValue('late-note') || '', clientRequestId: newRequestId() };
    if (parts[0] === 'dinner') payload.mealChoice = ($('#late-dish') && $('#late-dish').value) || 'Standard';
    this.disabled = true;
    const d = await v3Call('requestLateMeal', payload, 'Late request sent — chef, admin and your HOD have been notified');
    this.disabled = false;
    if (d) { $('#late-reason').value = ''; v3AfterMealChange(parts[0]); }
  };
}
/* weekly menu likes / dislikes */
function v3WeeklyMenuHtml(pack){
  if (!pack) return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="weekly-menu">'+v3Title('fa-calendar-week','This week\'s dinner menu')+v3Loading()+'</section>';
  const todayWd = getFijiNow().getUTCDay();
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="weekly-menu">'+v3Title('fa-calendar-week','This week\'s dinner menu')+
    '<p class="text-[11px] text-slate-400">Like or dislike dishes so the chef can replace the least popular ones. Burger and pizza are daily items and are not listed.</p>'+
    (pack.days||[]).map(function(d){
      return '<details class="rounded-xl bg-slate-900/50 border border-slate-700/60 min-w-0"'+(d.weekday===todayWd||d.weekday===(todayWd+1)%7?' open':'')+'><summary class="px-3 py-2 text-sm text-slate-100 cursor-pointer flex items-center justify-between"><span>'+esc(d.name)+(d.weekday===todayWd?' <span class="text-[10px] text-teal-300">today</span>':(d.weekday===(todayWd+1)%7?' <span class="text-[10px] text-teal-300">tomorrow</span>':''))+'</span><span class="text-[10px] text-slate-400">'+d.items.length+' dishes</span></summary>'+
        '<div class="px-3 pb-2 space-y-1.5">'+(d.items.length ? d.items.map(function(it){
          return '<div class="v3-row text-xs py-1 min-w-0"><span class="min-w-0 break-words text-slate-200">'+esc(it.dish)+'</span><span class="flex gap-1.5 shrink-0">'+
            '<button type="button" class="v3-vote rounded-lg px-2 py-1 border '+(it.myVote>0?'border-teal-400/60 bg-teal-500/15 text-teal-200':'border-slate-600 text-slate-300')+'" data-dish="'+esc(it.dish)+'" data-v="1" aria-label="Like '+esc(it.dish)+'"><i class="fa-solid fa-thumbs-up mr-1"></i>'+it.likes+'</button>'+
            '<button type="button" class="v3-vote rounded-lg px-2 py-1 border '+(it.myVote<0?'border-rose-400/60 bg-rose-500/15 text-rose-200':'border-slate-600 text-slate-300')+'" data-dish="'+esc(it.dish)+'" data-v="-1" aria-label="Dislike '+esc(it.dish)+'"><i class="fa-solid fa-thumbs-down mr-1"></i>'+it.dislikes+'</button></span></div>';
        }).join('') : v3Empty('No dishes set.'))+'</div></details>';
    }).join('')+'</section>';
}
function v3BindVotes(){
  $$('.v3-vote').forEach(function(b){ b.onclick = async function(){
    const on = b.classList.contains('bg-teal-500/15') || b.classList.contains('bg-rose-500/15');
    const d = await v3Call('voteMenuItem', { dish: b.dataset.dish, vote: on ? 0 : Number(b.dataset.v) });
    if (!d) return;
    const pack = cachePeek('weeklyMenu');
    if (pack) { (pack.days||[]).forEach(function(day){ day.items.forEach(function(it){ if (it.dishKey === d.dishKey) { it.likes = d.likes; it.dislikes = d.dislikes; it.myVote = d.myVote; } }); }); cacheSet('weeklyMenu', pack); }
    const wm = $('#weekly-menu'); if (wm) { const openDays = $$('#weekly-menu details').map(function(x){ return x.open; }); wm.outerHTML = v3WeeklyMenuHtml(pack); $$('#weekly-menu details').forEach(function(x, i){ x.open = !!openDays[i]; }); v3BindVotes(); }
  }; });
}
function v3FeedbackCard(){
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="chef-feedback">'+v3Title('fa-comment-dots','Chef feedback')+
    '<p class="text-[11px] text-slate-400">Issues or requests about the food go straight to the chef.</p>'+
    '<select id="fb-kind" class="ui-input w-full"><option value="issue">Issue with food</option><option value="request">Request / idea</option><option value="compliment">Compliment</option></select>'+
    '<textarea id="fb-msg" rows="3" maxlength="800" class="ui-input w-full" placeholder="e.g. rice was cold at the second lunch sitting"></textarea>'+
    '<button type="button" id="btn-feedback" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">Send to chef</button></section>';
}
function v3BindFeedback(){
  const b = $('#btn-feedback'); if (!b) return;
  b.onclick = async function(){
    const msg = ($('#fb-msg').value||'').trim();
    if (msg.length < 3) { toast('Write a short message first','error'); return; }
    b.disabled = true;
    const d = await v3Call('sendChefFeedback', { kind: $('#fb-kind').value, message: msg, clientRequestId: newRequestId() }, 'Sent to the chef — thank you');
    b.disabled = false;
    if (d) $('#fb-msg').value = '';
  };
}
function v3SpecialEntry(){
  if (!(v3CanDept() || v3CanChef())) return '';
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="special-entry">'+v3Title('fa-star','Special meal order request')+
    '<p class="text-[11px] text-slate-400">Order for staff without a phone, mainland contractors or visitors. It goes to the chef and appears in the kitchen lists (with any allergy notes) once accepted.</p>'+
    '<button type="button" onclick="v3OpenSpecialForm()" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white"><i class="fa-solid fa-plus mr-1"></i>New special meal order</button>'+
    '<button type="button" onclick="navigate(\'special\')" class="w-full rounded-xl py-2 text-xs border border-slate-600 text-slate-300">My special orders & status</button></section>';
}
function v3PaintMeals(){
  const focus = state.mealFocus; state.mealFocus = null;
  const keepLate = $('#late-reason') ? $('#late-reason').value : '';
  $('#main-content').innerHTML = v3Page(queueHostHtml('breakfast,lunch,dinner') + v3StatusBlock() +
    V3_MEALS.map(v3MealCard).join('') + v3LateCard() + v3SpecialEntry() + v3WeeklyMenuHtml(cachePeek('weeklyMenu')) + v3FeedbackCard(), 'meals-root');
  bindQueueButtons(); v3BindMealCards(); v3BindLateCard(); v3BindVotes(); v3BindFeedback(); v3StartTicker();
  if (keepLate && $('#late-reason')) $('#late-reason').value = keepLate;
  if (focus) { const el = $('#meal-card-'+focus); if (el) setTimeout(function(){ el.scrollIntoView({ block:'start' }); }, 30); }
}
async function renderMeals(){
  state.mealPill = 'meals';
  v3PaintMeals();
  await bootWait();
  if (state.tab !== 'meals') return;
  const jobs = V3_MEALS.map(function(m){ return v3FetchMeal(m).catch(function(){ return null; }); });
  jobs.push(v3FetchMenu().catch(function(){ return null; }));
  jobs.push((cacheGet('weeklyMenu') ? Promise.resolve(cachePeek('weeklyMenu')) : api('getWeeklyMenu', {}).then(function(r){ if (r && r.success) cacheSet('weeklyMenu', r.data); return r && r.data; })).catch(function(){ return null; }));
  if (!cacheGet('v3home')) jobs.push(v3RefreshHome());
  await Promise.all(jobs);
  if (state.tab === 'meals' && !v3HomeTyping()) v3PaintMeals();
}
/* keep the 2.x meal routes working (deep links / queue repaint) */
function renderBreakfast(){ state.mealFocus = 'breakfast'; return renderMeals(); }
function renderLunch(){ state.mealFocus = 'lunch'; return renderMeals(); }
function renderDinner(){ state.mealFocus = 'dinner'; return renderMeals(); }

/* ============ H. Special meal orders (HOD / assistant HOD / chef / admin) ============ */
async function v3OpenSpecialForm(){
  const open = V3_MEALS.filter(function(m){ return v3Info(m).open; });
  if (!open.length) { toast('Booking for tomorrow is closed for all meals — use a late meal request instead','error'); return; }
  try { await v3FetchMenu(); } catch (e) {}
  const items = v3MenuItems();
  const lockDept = !(v3IsAdmin() || v3CanChef());
  const html = '<div class="space-y-3 min-w-0"><h3 class="font-semibold text-slate-100">Special meal order</h3>'+
    '<p class="text-[11px] text-slate-400">For tomorrow ('+esc(dinnerCutoffInfo().serviceDate)+'), within the normal booking times.</p>'+
    '<div class="space-y-1"><label class="text-[11px] text-slate-400" for="sp-name">Name *</label><input id="sp-name" class="ui-input w-full" maxlength="60" placeholder="Full name"/></div>'+
    '<div class="grid grid-cols-2 gap-2"><label class="flex items-center gap-2 text-xs text-slate-200 rounded-xl border border-slate-600 p-2"><input type="radio" name="sp-type" value="staff" checked/> Staff (no phone)</label>'+
    '<label class="flex items-center gap-2 text-xs text-slate-200 rounded-xl border border-slate-600 p-2"><input type="radio" name="sp-type" value="contractor"/> Contractor</label></div>'+
    '<div id="sp-dept-wrap" class="space-y-1"><label class="text-[11px] text-slate-400" for="sp-dept">Department</label><select id="sp-dept" class="ui-input w-full"'+(lockDept?' disabled':'')+'>'+PCR_DEPARTMENTS.map(function(d){ return '<option'+(d===state.user.department?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select></div>'+
    '<div id="sp-co-wrap" class="space-y-1 hidden"><label class="text-[11px] text-slate-400" for="sp-co">Company name *</label><input id="sp-co" class="ui-input w-full" maxlength="60" placeholder="e.g. Fiji Power Co"/></div>'+
    '<div class="space-y-1"><label class="text-[11px] text-slate-400" for="sp-meal">Meal *</label><select id="sp-meal" class="ui-input w-full">'+open.map(function(m){ return '<option value="'+m+'">'+V3_MEAL_LABEL[m]+' · tomorrow</option>'; }).join('')+'</select></div>'+
    '<div id="sp-dish-wrap" class="space-y-1"><label class="text-[11px] text-slate-400" for="sp-dish">Dish (tomorrow\'s menu)</label><select id="sp-dish" class="ui-input w-full">'+items.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('')+'</select></div>'+
    '<div class="space-y-1"><label class="text-[11px] text-slate-400" for="sp-reason">Reason *</label><input id="sp-reason" class="ui-input w-full" maxlength="300" placeholder="e.g. staff member has no phone"/></div>'+
    '<div class="space-y-1"><label class="text-[11px] text-slate-400" for="sp-note">Extra requests / allergies</label><input id="sp-note" class="ui-input w-full" maxlength="200" placeholder="e.g. peanut allergy, no pork"/><p class="text-[10px] text-slate-500">Shown to the kitchen in the notes & allergies list.</p></div>'+
    '<div class="flex gap-2"><button type="button" id="sp-close" class="flex-1 rounded-xl py-2.5 text-sm border border-slate-600 text-slate-300">Close</button><button type="button" id="sp-send" class="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold text-white">Send to chef</button></div></div>';
  openModal(html);
  const syncType = function(){ const c = document.querySelector('input[name="sp-type"]:checked').value === 'contractor'; $('#sp-co-wrap').classList.toggle('hidden', !c); $('#sp-dept-wrap').classList.toggle('hidden', c); };
  const syncMeal = function(){ $('#sp-dish-wrap').classList.toggle('hidden', $('#sp-meal').value !== 'dinner'); };
  $$('input[name="sp-type"]').forEach(function(r){ r.onchange = syncType; });
  $('#sp-meal').onchange = syncMeal; syncMeal();
  $('#sp-close').onclick = closeModal;
  $('#sp-send').onclick = async function(){
    const type = document.querySelector('input[name="sp-type"]:checked').value;
    const p = { guestName: $('#sp-name').value.trim(), guestType: type, department: $('#sp-dept').value, guestCompany: $('#sp-co').value.trim(), meal: $('#sp-meal').value,
      mealChoice: $('#sp-meal').value === 'dinner' ? $('#sp-dish').value : '', reason: $('#sp-reason').value.trim(), specialNote: cleanNoteText($('#sp-note').value), clientRequestId: newRequestId() };
    if (!p.guestName) { toast('Name is required','error'); return; }
    if (type === 'contractor' && !p.guestCompany) { toast('Company name is required','error'); return; }
    if (!p.reason) { toast('Reason is required','error'); return; }
    this.disabled = true;
    const d = await v3Call('placeSpecialMeal', p, 'Special '+p.meal+' sent to the chef');
    this.disabled = false;
    if (!d) return;
    closeModal(); cacheInvalidate(['v3home','kitchenDashboard','mealRequests']);
    if (state.tab === 'special') v3RenderSpecialPage();
  };
}
function v3RequestCard(x, actions){
  const who = x.kind === 'special' ? esc(x.userName)+' <span class="text-[10px] text-slate-400">('+esc(x.department)+')</span>' : esc(x.userName)+' <span class="text-[10px] text-slate-400">· '+esc(x.department)+'</span>';
  return '<article class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3 space-y-1.5 min-w-0">'+
    '<div class="v3-row"><p class="text-sm text-slate-100 min-w-0 truncate">'+who+'</p>'+v3Status(x.status)+'</div>'+
    '<p class="text-xs text-slate-300">'+v3Chip(x.kind === 'special' ? 'Special' : 'Late', x.kind === 'special' ? 'info' : 'warn')+' '+esc(V3_MEAL_LABEL[x.meal])+' · '+esc(v3DateLabel(x.serviceDate))+(x.meal==='dinner'&&x.mealChoice?' · <strong>'+esc(x.mealChoice)+'</strong>':'')+'</p>'+
    (x.reason?'<p class="text-[11px] text-slate-300 break-words">Reason: '+esc(x.reason)+'</p>':'')+
    (x.specialNote?'<p class="text-[11px] break-words">'+noteChipHtml(x.specialNote)+'</p>':'')+
    '<p class="text-[10px] text-slate-500">Sent '+esc(v3Ts(x.createdAt))+(x.requestedBy && x.kind==='special'?' by '+esc(String(x.requestedBy).split('@')[0]):'')+(x.decidedBy?' · decided by '+esc(String(x.decidedBy).split('@')[0])+' '+esc(v3Ts(x.decidedAt)):'')+'</p>'+
    (actions && x.canDecide ? '<div class="flex gap-2 pt-1"><button type="button" class="v3-req flex-1 rounded-lg py-2 text-xs border border-rose-500/40 text-rose-200" data-id="'+esc(x.id)+'" data-meal="'+x.meal+'" data-d="decline">Decline</button><button type="button" class="v3-req flex-1 btn-primary rounded-lg py-2 text-xs text-white font-semibold" data-id="'+esc(x.id)+'" data-meal="'+x.meal+'" data-d="approve">Accept</button></div>' : '')+'</article>';
}
function v3BindRequestCards(root, after){
  root.querySelectorAll('.v3-req').forEach(function(b){ b.onclick = async function(){
    b.disabled = true;
    const d = await v3Call('decideMealRequest', { id: b.dataset.id, meal: b.dataset.meal, decision: b.dataset.d }, b.dataset.d === 'approve' ? 'Accepted — it is in the kitchen list' : 'Declined');
    b.disabled = false;
    if (d) { cacheInvalidate(['v3home','kitchenDashboard','mealRequests']); v3RefreshHome(); after(); }
  }; });
}
async function v3RenderSpecialPage(){
  $('#main-content').innerHTML = v3Page(v3Back('meals','Meals') + v3SpecialEntry() + '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-list','Special orders I sent (last 3 days)')+'<div id="sp-list">'+v3Loading()+'</div></section>', 'special-root');
  const d = await v3Call('getMealRequests', { days: 3 });
  if (state.tab !== 'special') return;
  const me = String(state.user.email).toLowerCase();
  const rows = ((d && d.requests) || []).filter(function(x){ return x.kind === 'special' && String(x.requestedBy).toLowerCase() === me; });
  $('#sp-list').innerHTML = rows.length ? '<div class="space-y-2">'+rows.map(function(x){ return v3RequestCard(x, false); }).join('')+'</div>' : v3Empty('None yet.');
}

/* ============ I. Approvals inbox (HOD / chef / admin / superadmin) ============ */
async function v3RenderApprovals(){
  $('#main-content').innerHTML = v3Page((v3IsSuper() ? '' : v3Back('home','Home')) + '<div id="ap-body" class="space-y-4">'+v3Loading()+'</div>', 'approvals-root');
  const me = String(state.user.email).toLowerCase();
  const wantLeave = v3CanDept(), wantMeals = v3CanDept() || v3CanChef();
  const [lv, mr, js] = await Promise.all([
    wantLeave ? api('getLeave', { scope: v3IsAdmin() ? 'all' : 'dept' }).catch(function(){ return null; }) : null,
    wantMeals ? api('getMealRequests', { days: 3 }).catch(function(){ return null; }) : null,
    v3CanDept() ? (v3IsAdmin() ? api('getUsers', { activeOnly:false }) : api('getDeptStaff', {})).catch(function(){ return null; }) : null
  ]);
  if (state.tab !== 'approvals') return;
  let html = '';
  if (wantLeave) {
    const rows = ((lv && lv.data && lv.data.requests) || []).filter(function(l){ return String(l.userEmail).toLowerCase() !== me; });
    const hodStep = rows.filter(function(l){ return l.status === 'pending_hod'; }).map(function(l){ l.canDecide = true; return l; });
    const mgmt = v3IsAdmin() ? rows.filter(function(l){ return l.status === 'pending_manager'; }).map(function(l){ l.canDecide = true; return l; }) : [];
    html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-leave">'+v3Title('fa-plane-departure','Leave — HOD step', v3Chip(String(hodStep.length), hodStep.length?'warn':'mute'))+
      (hodStep.length ? hodStep.map(function(l){ return v3LeaveCard(l, 'review'); }).join('') : v3Empty('No leave waiting for the HOD step.'))+'</section>';
    if (v3IsAdmin()) html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-final">'+v3Title('fa-stamp','Leave — final approval (management)', v3Chip(String(mgmt.length), mgmt.length?'warn':'mute'))+
      (mgmt.length ? mgmt.map(function(l){ return v3LeaveCard(l, 'review'); }).join('') : v3Empty('Nothing waiting for final approval.'))+'</section>';
  }
  if (wantMeals) {
    const reqs = ((mr && mr.data && mr.data.requests) || []).filter(function(x){ return x.canDecide; });
    const late = reqs.filter(function(x){ return x.kind === 'late'; }), sp = reqs.filter(function(x){ return x.kind === 'special'; });
    html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-late">'+v3Title('fa-clock-rotate-left','Late meal requests', v3Chip(String(late.length), late.length?'warn':'mute'))+
      (late.length ? late.map(function(x){ return v3RequestCard(x, true); }).join('') : v3Empty('No late meal requests waiting.'))+'</section>';
    if (v3CanChef()) html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-special">'+v3Title('fa-star','Special meal requests', v3Chip(String(sp.length), sp.length?'warn':'mute'))+
      (sp.length ? sp.map(function(x){ return v3RequestCard(x, true); }).join('') : v3Empty('No special requests waiting.'))+'</section>';
  }
  if (v3CanDept()) {
    let pend = [];
    if (js && js.success) pend = v3IsAdmin() ? (js.data.users||[]).filter(function(u){ return u.deptStatus === 'pending' && (u.active || u.verified); }) : (js.data.pending||[]);
    html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-joins">'+v3Title('fa-user-plus','Department join requests', v3Chip(String(pend.length), pend.length?'warn':'mute'))+
      (pend.length ? pend.map(v3JoinCard).join('') : v3Empty('No one is waiting to join.'))+'</section>';
  }
  $('#ap-body').innerHTML = html || v3Empty('Nothing needs your approval.');
  const root = $('#ap-body');
  const again = function(){ cacheInvalidate(['v3home']); v3RefreshHome().then(function(){ renderNav('#bottom-nav'); }); v3RenderApprovals(); };
  v3BindLeaveCards(root, again); v3BindRequestCards(root, again); v3BindJoinCards(root, again);
}
function v3JoinCard(u){
  return '<article class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3 space-y-2 min-w-0"><div class="v3-row"><div class="min-w-0"><p class="text-sm text-slate-100 truncate">'+esc(fullDisplayName(u))+'</p>'+
    '<p class="text-[11px] text-slate-400 truncate">'+esc(u.email)+' · '+esc(u.department)+(u.contact?' · '+esc(u.contact):'')+'</p><p class="text-[10px] text-slate-500">Signed up '+esc(v3Ts(u.createdAt))+'</p></div>'+v3Status('pending')+'</div>'+
    '<div class="flex gap-2"><button type="button" class="v3-join flex-1 rounded-lg py-2 text-xs border border-rose-500/40 text-rose-200" data-email="'+esc(u.email)+'" data-d="decline">Decline</button><button type="button" class="v3-join flex-1 btn-primary rounded-lg py-2 text-xs text-white font-semibold" data-email="'+esc(u.email)+'" data-d="approve">Accept into '+esc(u.department)+'</button></div></article>';
}
function v3BindJoinCards(root, after){
  root.querySelectorAll('.v3-join').forEach(function(b){ b.onclick = async function(){
    let note = '';
    if (b.dataset.d === 'decline') { note = prompt('Reason for declining (optional)') ; if (note === null) return; }
    b.disabled = true;
    const d = await v3Call('decideJoinRequest', { targetEmail: b.dataset.email, decision: b.dataset.d, note: note || '' }, b.dataset.d === 'approve' ? 'Accepted — they now have leave, late meals and updates' : 'Declined');
    b.disabled = false;
    if (d) after();
  }; });
}

/* ============ J. Department staff & updates ============ */
async function v3RenderDeptStaff(){
  const depts = PCR_DEPARTMENTS;
  const dept = v3IsAdmin() ? (state.deptView || state.user.department || depts[0]) : state.user.department;
  $('#main-content').innerHTML = v3Page(v3Back('more','More') +
    (v3IsAdmin() ? '<select id="ds-dept" class="ui-input w-full">'+depts.map(function(d){ return '<option'+(d===dept?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select>' : '<p class="text-xs text-slate-400">'+esc(dept)+' · you can accept staff, edit their details or remove them from the department. Only admin can move someone to another department.</p>')+
    '<div id="ds-body" class="space-y-4">'+v3Loading()+'</div>', 'deptstaff-root');
  const sel = $('#ds-dept'); if (sel) sel.onchange = function(){ state.deptView = sel.value; v3RenderDeptStaff(); };
  const d = await v3Call('getDeptStaff', { department: dept });
  if (state.tab !== 'deptstaff' || !d) return;
  const staffRow = function(u){
    return '<div class="v3-row py-2 border-b border-slate-700/40 last:border-0 min-w-0"><div class="min-w-0"><p class="text-sm text-slate-100 truncate">'+esc(fullDisplayName(u))+(u.assistantHod?' '+v3Chip('Asst HOD','info'):'')+(v3RoleOf(u)!=='staff'?' '+v3Chip(esc(V3_ROLE_LABEL[v3RoleOf(u)]),'ok'):'')+'</p>'+
      '<p class="text-[10px] text-slate-400 truncate">'+esc(u.email)+(u.contact?' · '+esc(u.contact):'')+(u.roster?' · '+esc(u.roster):'')+'</p></div>'+
      (String(u.email).toLowerCase() !== String(state.user.email).toLowerCase() && (v3IsAdmin() || v3RoleOf(u) === 'staff') ? '<div class="flex gap-1 shrink-0"><button type="button" class="v3-ds-edit rounded-lg px-2 py-1 text-[11px] border border-slate-600 text-slate-200" data-email="'+esc(u.email)+'">Edit</button>'+
      '<button type="button" class="v3-ds-rm rounded-lg px-2 py-1 text-[11px] border border-rose-500/40 text-rose-200" data-email="'+esc(u.email)+'">Remove</button></div>' : '')+'</div>';
  };
  $('#ds-body').innerHTML =
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ds-pending">'+v3Title('fa-user-plus','Waiting to join', v3Chip(String(d.pending.length), d.pending.length?'warn':'mute'))+(d.pending.length ? d.pending.map(v3JoinCard).join('') : v3Empty('No join requests.'))+'</section>'+
    '<section class="glass rounded-2xl p-4 space-y-1 min-w-0" id="ds-staff">'+v3Title('fa-users','Department staff', v3Chip(String(d.staff.length),'mute'))+(d.staff.length ? d.staff.map(staffRow).join('') : v3Empty('No accepted staff yet.'))+'</section>'+
    (d.declined.length ? '<section class="glass rounded-2xl p-4 space-y-1 min-w-0">'+v3Title('fa-user-slash','Declined / removed')+d.declined.map(function(u){ return '<p class="text-xs text-slate-400 truncate">'+esc(fullDisplayName(u))+' · '+esc(u.deptStatus)+'</p>'; }).join('')+'</section>' : '');
  const root = $('#ds-body');
  v3BindJoinCards(root, function(){ cacheInvalidate(['v3home']); v3RefreshHome(); v3RenderDeptStaff(); });
  root.querySelectorAll('.v3-ds-edit').forEach(function(b){ b.onclick = function(){
    const u = d.staff.find(function(x){ return x.email === b.dataset.email; }); if (!u) return;
    v3Form('Edit '+fullDisplayName(u), [
      { id:'firstName', label:'First name', value:u.firstName }, { id:'lastName', label:'Last name', value:u.lastName },
      { id:'preferredName', label:'Preferred name', value:u.preferredName, max:40 }, { id:'contact', label:'Contact', value:u.contact },
      { id:'roster', label:'Roster / shift pattern', value:u.roster }, { id:'village', label:'Mainland or Village', type:'select', options:['Mainland','Village'], value: u.village === 'Village' ? 'Village' : 'Mainland' }
    ], 'Save', async function(v){ const r = await v3Call('updateDeptStaff', Object.assign({ targetEmail: u.email }, v), 'Saved'); if (r) v3RenderDeptStaff(); return !!r; }, 'Department: '+esc(u.department)+' (only admin can change it).');
  }; });
  root.querySelectorAll('.v3-ds-rm').forEach(function(b){ b.onclick = async function(){
    if (!confirm('Remove '+b.dataset.email+' from '+dept+'? They lose leave, late meals and department updates until admin re-adds them.')) return;
    const r = await v3Call('removeFromDept', { targetEmail: b.dataset.email }, 'Removed from department');
    if (r) v3RenderDeptStaff();
  }; });
}
async function v3RenderDeptUpdates(){
  const lead = v3CanDept() && !v3IsAdmin() ? true : v3IsAdmin();
  $('#main-content').innerHTML = v3Page(v3Back('more','More') +
    (lead ? '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="du-post">'+v3Title('fa-pen','Post an update · '+esc(state.user.department||''))+
      '<input id="du-title" class="ui-input w-full" maxlength="100" placeholder="Title"/><textarea id="du-body" rows="3" maxlength="1500" class="ui-input w-full" placeholder="Message for accepted staff in your department"></textarea>'+
      '<button type="button" id="du-send" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">Post update</button></section>' : '')+
    '<div id="du-list" class="space-y-2">'+v3Loading()+'</div>', 'deptupdates-root');
  const sb = $('#du-send');
  if (sb) sb.onclick = async function(){
    const t = $('#du-title').value.trim(), bd = $('#du-body').value.trim();
    if (!t && !bd) { toast('Write something first','error'); return; }
    const r = await v3Call('postDeptUpdate', { title: t, body: bd }, 'Posted to your department');
    if (r) { cacheInvalidate(['v3home']); v3RefreshHome(); v3RenderDeptUpdates(); }
  };
  const d = await v3Call('getDeptUpdates', { limit: 30 });
  if (state.tab !== 'deptupdates') return;
  const list = $('#du-list');
  if (!d) { list.innerHTML = ''; return; }
  if (d.locked) { list.innerHTML = v3Card('<p class="text-xs text-slate-400"><i class="fa-solid fa-lock mr-1"></i>Department updates open after your HOD accepts your department request.</p>'); return; }
  list.innerHTML = (d.updates||[]).length ? d.updates.map(function(u){ return v3UpdateCard(u, false); }).join('') : v3Card(v3Empty('No updates yet.'));
  v3BindUpdateCards(list, v3RenderDeptUpdates);
}

/* ============ K. More, profile summary, history, notifications ============ */
function renderMore(){
  const u = state.user, r = v3RoleOf(), h = v3Home(), hb = h.hodBar || {};
  const unread = state._v3Unread || 0;
  const group = function(title, rows){ return rows ? '<section class="space-y-1.5 min-w-0"><h3 class="v3-section-title px-1">'+title+'</h3><div class="glass rounded-2xl overflow-hidden">'+rows+'</div></section>' : ''; };
  const profile = '<section class="glass rounded-2xl p-4 min-w-0" id="more-profile"><div class="flex items-center gap-3 min-w-0">'+homeAvatarHtml(u)+'<div class="min-w-0 flex-1">'+
    '<p class="font-semibold text-slate-100 truncate">'+esc(fullDisplayName(u))+'</p><p class="text-[11px] text-slate-400 truncate">'+esc(u.email)+'</p>'+
    '<p class="text-[11px] text-slate-300 mt-0.5">'+esc(v3RoleLabel(u))+'</p></div>'+
    '<button type="button" onclick="navigate(\'profile\')" class="rounded-lg px-3 py-2 text-xs border border-teal-500/40 text-teal-200 shrink-0">Edit</button></div>'+
    '<div class="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2 min-w-0"><p class="text-slate-500">Department (read-only)</p><p class="text-slate-100 truncate">'+esc(u.department||'—')+'</p></div>'+
    '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2 min-w-0"><p class="text-slate-500">Department status</p><p>'+v3Status(v3DeptStatus())+'</p></div></div></section>';
  let html = profile;
  if (r === 'super_admin') {
    html += group('Account', v3Row(v3Nav('notifications'),'fa-bell','Notifications','', unread) + v3Row(v3Nav('history'),'fa-clock-rotate-left','My history','Everything you did in the app'));
  } else {
    html += group('Me', v3Row(v3Nav('leave'),'fa-plane-departure','Leave requests', v3DeptOk() ? 'Request, track, escalate or cancel' : 'Opens after your HOD accepts you') +
      v3Row(v3Nav('history'),'fa-clock-rotate-left','My history','Orders, boats, leave, requests, feedback') +
      v3Row(v3Nav('bookings'),'fa-ticket','My boat bookings','') +
      v3Row(v3Nav('notifications'),'fa-bell','Notifications','', unread) +
      (v3DeptOk() && !v3CanDept() ? v3Row(v3Nav('deptupdates'),'fa-bullhorn','Department updates', esc(u.department||'')) : '') +
      (featureOn('feature_my_schedule') ? v3Row(v3Nav('schedule'),'fa-calendar-check','My schedule','') : ''));
    if (v3CanDept()) html += group(v3IsAdmin() ? 'Departments' : 'My department · '+esc(u.department||''),
      v3Row(v3Nav('approvals'),'fa-inbox','Approvals inbox','Leave, late meals, join requests', (hb.leave||0)+(hb.late||0)+(hb.joins||0)+(hb.leaveMgmt||0)) +
      v3Row("state.leaveTabForce='"+(v3IsAdmin()?'final':'dept')+"';navigate('leave')",'fa-calendar-check','Leave requests','View all · approve or decline') +
      v3Row(v3Nav('deptstaff'),'fa-users','Department staff','Join requests, edit, remove', hb.joins||0) +
      v3Row(v3Nav('deptupdates'),'fa-bullhorn','Department updates','Post, comments, likes') +
      v3Row(v3Nav('special'),'fa-star','Special meal orders','For staff without a phone or contractors'));
    if (v3CanChef()) html += group('Chef', v3Row(v3Nav('chef'),'fa-fire-burner','Chef hub','Dashboard & shortcuts') +
      v3Row(v3Nav('chefreq'),'fa-clock-rotate-left','Late & special requests','Accept / decline, accept all', h.chef ? (h.chef.pending.late+h.chef.pending.special) : 0) +
      v3Row(v3Nav('kitchen'),'fa-list-ol','Kitchen lists','Calculate, view, print, download') +
      v3Row(v3Nav('chefmenu'),'fa-pen-to-square','Edit menu','With like / dislike counts') +
      v3Row(v3Nav('chefcomments'),'fa-comment-dots','Food comments','Chef feedback from staff', h.chef ? h.chef.feedbackNew : 0) +
      v3Row(v3Nav('chefreports'),'fa-chart-column','Reports & roster','Daily / weekly / monthly, roster compare'));
    if (v3IsAdmin()) html += group('Admin', v3Row(v3Nav('manage'),'fa-sliders','Manage','All admin tools') + v3Row(v3Nav('usersv3'),'fa-users-gear','Users & roles','') +
      v3Row(v3Nav('reminders'),'fa-bell','Reminders','Add, edit, remove') + v3Row(v3Nav('admin'),'fa-ship','Boat admin','Runs, bookings, emergency travel') +
      v3Row(v3Nav('adminstatus'),'fa-file-arrow-down','Admin status & reports','Download everything'));
    else if (r === 'boat_manager') html += group('Boat', v3Row(v3Nav('admin'),'fa-ship','Boat tools','Runs, manifests, emergency travel'));
  }
  html += '<section class="glass rounded-2xl overflow-hidden">'+v3Row('doLogout()','fa-right-from-bracket','Sign out','')+'</section>'+
    '<p class="text-center text-[10px] text-slate-500">PCR Staff App '+esc(APP_VERSION)+(state.backendVersion?' · API '+esc(state.backendVersion):'')+(state.demo?' · demo':'')+'</p>';
  $('#main-content').innerHTML = v3Page(html, 'more-root');
  if (!state._v3UnreadAt || Date.now() - state._v3UnreadAt > 60000) {
    state._v3UnreadAt = Date.now();
    api('getMyNotifications', {}).then(function(res){ if (res && res.success) { state._v3Unread = res.data.unreadCount || 0; if (state.tab === 'more' && state._v3Unread !== unread) renderMore(); } }).catch(function(){});
  }
}
async function v3RenderNotifications(){
  $('#main-content').innerHTML = v3Page(v3Back('more','More') + '<div class="flex justify-end"><button type="button" id="nt-all" class="text-xs text-teal-300">Mark all read</button></div><div id="nt-list" class="space-y-2">'+v3Loading()+'</div>', 'notifications-root');
  $('#nt-all').onclick = async function(){ const d = await v3Call('markNotificationRead', { markAll:true }, 'All marked read'); if (d) { state._v3Unread = 0; v3RenderNotifications(); } };
  const d = await v3Call('getMyNotifications', {});
  if (state.tab !== 'notifications' || !d) return;
  const go = { leave:'leave', dept_join: v3CanDept() ? 'deptstaff' : 'home', late_meal:'approvals', special_meal:'chefreq', meal_request:'meals', chef_feedback: v3CanChef() ? 'chefcomments' : 'history', dept_update:'deptupdates' };
  $('#nt-list').innerHTML = (d.notifications||[]).length ? d.notifications.map(function(n){
    return '<button type="button" class="v3-nt w-full text-left rounded-xl border p-3 min-w-0 '+(n.read?'border-slate-700/60 bg-slate-900/40':'border-teal-500/40 bg-teal-500/10')+'" data-id="'+esc(n.id)+'" data-go="'+esc(go[n.kind]||'')+'">'+
      '<p class="text-sm text-slate-100 break-words">'+(n.read?'':'<span class="inline-block w-2 h-2 rounded-full bg-teal-400 mr-1.5"></span>')+esc(n.title)+'</p><p class="text-[11px] text-slate-300 break-words">'+esc(n.body)+'</p><p class="text-[10px] text-slate-500">'+esc(v3Ts(n.createdAt))+'</p></button>';
  }).join('') : v3Card(v3Empty('No notifications.'));
  $$('.v3-nt').forEach(function(b){ b.onclick = async function(){ await api('markNotificationRead', { id: b.dataset.id }).catch(function(){}); state._v3UnreadAt = 0; if (b.dataset.go && canPrivilegedTab(b.dataset.go)) navigate(b.dataset.go); else v3RenderNotifications(); }; });
}
async function v3RenderHistory(){
  const from = state.histFrom || fijiDateString(addFijiDays(getFijiNow(), -30)), to = state.histTo || fijiDateString(addFijiDays(getFijiNow(), 7));
  $('#main-content').innerHTML = v3Page(v3Back('more','More') + queueHostHtml('*') +
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-filter','Filter by date')+'<div class="grid grid-cols-2 gap-2"><input type="date" id="hi-from" class="ui-input w-full min-w-0" value="'+from+'"/><input type="date" id="hi-to" class="ui-input w-full min-w-0" value="'+to+'"/></div>'+
    '<div class="flex gap-2"><button type="button" id="hi-go" class="flex-1 btn-primary rounded-xl py-2 text-sm text-white font-semibold">Show</button><button type="button" id="hi-csv" class="flex-1 rounded-xl py-2 text-sm border border-slate-600 text-slate-200"><i class="fa-solid fa-download mr-1"></i>Download</button></div></section>'+
    '<div id="hi-body" class="space-y-3">'+v3Loading()+'</div>', 'history-root');
  $('#hi-go').onclick = function(){ state.histFrom = $('#hi-from').value; state.histTo = $('#hi-to').value; v3RenderHistory(); };
  const d = await v3Call('getMyHistory', { from: from, to: to });
  if (state.tab !== 'history' || !d) return;
  const sec = function(id, icon, title, rows, fn){ return '<details class="glass rounded-2xl min-w-0" id="hi-'+id+'"'+(rows.length?' open':'')+'><summary class="px-4 py-3 flex items-center justify-between cursor-pointer"><span class="text-sm text-slate-100"><i class="fa-solid '+icon+' text-teal-400 mr-2"></i>'+title+'</span>'+v3Chip(String(rows.length),'mute')+'</summary><div class="px-4 pb-3 space-y-1.5">'+(rows.length ? rows.map(fn).join('') : v3Empty('Nothing in this range.'))+'</div></details>'; };
  const line = function(a, b, st){ return '<div class="v3-row py-1.5 border-b border-slate-700/40 last:border-0 text-xs min-w-0"><div class="min-w-0"><p class="text-slate-100 break-words">'+a+'</p><p class="text-[10px] text-slate-500 break-words">'+b+'</p></div>'+(st?v3Status(st):'')+'</div>'; };
  const p = d.profile || {};
  $('#hi-body').innerHTML =
    '<section class="glass rounded-2xl p-4 space-y-1 text-xs min-w-0" id="hi-profile">'+v3Title('fa-id-card','Profile & app')+
      '<p class="text-slate-200">'+esc(fullDisplayName(p))+' · '+esc(v3RoleLabel(p))+'</p><p class="text-slate-400">'+esc(p.email||'')+' · '+esc(p.department||'—')+' · '+esc(p.village||'')+'</p>'+
      '<p class="text-slate-400">App '+esc(APP_VERSION)+' · server '+esc(d.version||'')+' · range '+esc(d.from)+' → '+esc(d.to)+'</p></section>'+
    sec('orders','fa-utensils','Meal orders', d.orders||[], function(o){ return line(esc(V3_MEAL_LABEL[o.meal])+' · '+esc(o.serviceDate)+(o.meal==='dinner'&&o.mealChoice?' · '+esc(o.mealChoice):''), 'Ordered '+esc(v3Ts(o.createdAt))+(o.cancelReason?' · cancel reason: '+esc(o.cancelReason):'')+(o.specialNote?' · note: '+esc(o.specialNote):''), o.status); })+
    sec('boats','fa-ship','Boats booked', d.boats||[], function(b){ return line(esc(b.date)+' '+esc(b.time)+' · '+esc(b.route), b.seats+' seat(s) · booked '+esc(v3Ts(b.createdAt)), b.status); })+
    sec('leave','fa-plane-departure','Leave requests', d.leave||[], function(l){ return line(esc(l.leaveType)+' · '+esc(l.startDate)+(l.endDate!==l.startDate?' → '+esc(l.endDate):''), esc(l.reason)+' · sent '+esc(v3Ts(l.createdAt)), l.status); })+
    sec('requests','fa-clock-rotate-left','Late & special requests', d.requests||[], function(o){ return line((o.orderType==='special'?'Special for '+esc(o.guestName||o.userName):'Late')+' · '+esc(V3_MEAL_LABEL[o.meal])+' · '+esc(o.serviceDate), esc(o.reason)+' · sent '+esc(v3Ts(o.createdAt)), o.status); })+
    sec('feedback','fa-comment-dots','Chef feedback sent', d.feedback||[], function(f){ return line(esc(f.message), esc(f.kind)+' · '+esc(v3Ts(f.createdAt))+(f.chefNote?' · chef: '+esc(f.chefNote):''), f.status === 'new' ? 'pending' : 'approved'); })+
    sec('suggestions','fa-lightbulb','Suggestions', d.suggestions||[], function(s){ return line(esc(s.title), esc(s.body||'')+' · '+esc(v3Ts(s.createdAt)), s.status); });
  $('#hi-csv').onclick = function(){
    const rows = [];
    (d.orders||[]).forEach(function(o){ rows.push({ type:'meal', what:o.meal+(o.mealChoice&&o.meal==='dinner'?' '+o.mealChoice:''), date:o.serviceDate, status:o.status, detail:o.cancelReason||o.specialNote||'', created:o.createdAt }); });
    (d.boats||[]).forEach(function(b){ rows.push({ type:'boat', what:b.route+' '+b.time, date:b.date, status:b.status, detail:b.seats+' seats', created:b.createdAt }); });
    (d.leave||[]).forEach(function(l){ rows.push({ type:'leave', what:l.leaveType, date:l.startDate+' → '+l.endDate, status:l.status, detail:l.reason, created:l.createdAt }); });
    (d.requests||[]).forEach(function(o){ rows.push({ type:o.orderType, what:o.meal, date:o.serviceDate, status:o.status, detail:o.reason, created:o.createdAt }); });
    (d.feedback||[]).forEach(function(f){ rows.push({ type:'chef feedback', what:f.kind, date:String(f.createdAt).slice(0,10), status:f.status, detail:f.message, created:f.createdAt }); });
    (d.suggestions||[]).forEach(function(s){ rows.push({ type:'suggestion', what:s.title, date:String(s.createdAt).slice(0,10), status:s.status, detail:s.body, created:s.createdAt }); });
    v3Download('my-history-'+d.from+'-to-'+d.to+'.csv', rows, ['type','what','date','status','detail','created']);
  };
}

/* ============ L. Chef ============ */
async function v3RenderChefHub(){
  const h = v3Home();
  const paint = function(c){
    $('#main-content').innerHTML = v3Page(
      '<div class="grid grid-cols-2 gap-2" id="chef-shortcuts">'+
        v3Tile(v3Nav('chefreq'),'fa-clock-rotate-left','Late & special','Accept / decline', c ? c.pending.late + c.pending.special : 0)+
        v3Tile(v3Nav('kitchen'),'fa-list-ol','Kitchen lists','Calculate · print · PDF')+
        v3Tile(v3Nav('chefmenu'),'fa-pen-to-square','Edit menu','Likes & dislikes')+
        v3Tile(v3Nav('chefcomments'),'fa-comment-dots','Food comments','From staff', c ? c.feedbackNew : 0)+
        v3Tile(v3Nav('chefreports'),'fa-chart-column','Reports','Range · roster compare')+
        v3Tile("v3OpenSpecialForm()",'fa-star','Special meal','Order for someone')+'</div>'+
      v3ChefDashCard(c), 'chef-root');
  };
  paint(h.chef);
  const d = await v3Call('getChefDashboard', {});
  if (d && state.tab === 'chef') { const cur = v3Home(); cur.chef = d; cacheSet('v3home', cur); paint(d); }
}
async function v3RenderChefRequests(){
  const canAll = v3CanChef();
  $('#main-content').innerHTML = v3Page(v3Back(v3IsChef()?'chef':'more', v3IsChef()?'Chef':'More') +
    (canAll ? '<div class="grid grid-cols-2 gap-2"><button type="button" id="cr-acc-all" class="btn-primary rounded-xl py-2.5 text-sm text-white font-semibold"><i class="fa-solid fa-check-double mr-1"></i>Accept all</button>'+
      '<button type="button" id="cr-dec-all" class="rounded-xl py-2.5 text-sm border border-rose-500/40 text-rose-200"><i class="fa-solid fa-xmark mr-1"></i>Decline all</button></div>'+
      '<div class="grid grid-cols-2 gap-2"><button type="button" id="cr-print" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-print mr-1"></i>Print late & special list</button>'+
      '<button type="button" id="cr-csv" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-download mr-1"></i>Download CSV</button></div>' : '')+
    '<div id="cr-body" class="space-y-4">'+v3Loading()+'</div>', 'chefreq-root');
  const d = await v3Call('getMealRequests', { days: 3 });
  if (state.tab !== 'chefreq' || !d) return;
  const reqs = d.requests || [];
  const pend = reqs.filter(function(x){ return x.canDecide; }), done = reqs.filter(function(x){ return !x.canDecide; });
  $('#cr-body').innerHTML = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="cr-pending">'+v3Title('fa-hourglass-half','Waiting', v3Chip(pend.length+' ('+d.pendingLate+' late · '+d.pendingSpecial+' special)', pend.length?'warn':'mute'))+
    (pend.length ? pend.map(function(x){ return v3RequestCard(x, true); }).join('') : v3Empty('Nothing waiting.'))+'</section>'+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="cr-done">'+v3Title('fa-check','Decided (last 3 days)')+(done.length ? done.map(function(x){ return v3RequestCard(x, false); }).join('') : v3Empty('None.'))+'</section>';
  v3BindRequestCards($('#cr-body'), v3RenderChefRequests);
  const all = async function(dec){
    if (!pend.length) { toast('Nothing waiting','info'); return; }
    if (!confirm((dec === 'approve' ? 'Accept' : 'Decline')+' all '+pend.length+' waiting requests?')) return;
    const r = await v3Call('decideAllMealRequests', { decision: dec, kind:'all' }, dec === 'approve' ? 'All accepted' : 'All declined');
    if (r) { cacheInvalidate(['v3home','kitchenDashboard']); v3RefreshHome(); v3RenderChefRequests(); }
  };
  if (canAll) {
    $('#cr-acc-all').onclick = function(){ all('approve'); };
    $('#cr-dec-all').onclick = function(){ all('decline'); };
    const active = reqs.filter(function(x){ return x.status !== 'rejected' && x.status !== 'cancelled'; });
    const rowsOf = function(){ return active.map(function(x){ return [x.kind, V3_MEAL_LABEL[x.meal], x.serviceDate, x.userName, x.department, x.meal==='dinner'?x.mealChoice:'', x.specialNote||'', x.reason||'', V3_STATUS_TEXT[x.status]||x.status]; }); };
    $('#cr-print').onclick = function(){ v3Print('Late & special meals', v3Table(['Type','Meal','Date','Name','Dept / company','Dish','Notes & allergies','Reason','Status'], rowsOf(), ['Total', '', '', String(active.length), '', '', '', '', ''])); };
    $('#cr-csv').onclick = function(){ v3Download('late-special-meals-'+fijiDateString()+'.csv', active.map(function(x){ return { type:x.kind, meal:x.meal, date:x.serviceDate, name:x.userName, department:x.department, dish:x.meal==='dinner'?x.mealChoice:'', notes:x.specialNote, reason:x.reason, status:x.status, requestedBy:x.requestedBy, createdAt:x.createdAt }; })); };
  }
}
async function v3RenderChefComments(){
  $('#main-content').innerHTML = v3Page(v3Back(v3IsChef()?'chef':'more', v3IsChef()?'Chef':'More') + '<div id="cc-list" class="space-y-2">'+v3Loading()+'</div>', 'chefcomments-root');
  const d = await v3Call('getChefFeedback', {});
  if (state.tab !== 'chefcomments' || !d) return;
  $('#cc-list').innerHTML = (d.feedback||[]).length ? d.feedback.map(function(f){
    return '<article class="glass rounded-2xl p-3 space-y-1.5 min-w-0"><div class="v3-row"><p class="text-sm text-slate-100 truncate min-w-0">'+esc(f.userName)+' <span class="text-[10px] text-slate-400">· '+esc(f.department)+'</span></p>'+
      v3Chip(esc(f.status), f.status==='new'?'warn':(f.status==='done'?'ok':'info'))+'</div><p class="text-[11px]">'+v3Chip(esc(f.kind), f.kind==='issue'?'bad':(f.kind==='compliment'?'ok':'info'))+' <span class="text-slate-500">'+esc(v3Ts(f.createdAt))+'</span></p>'+
      '<p class="text-xs text-slate-200 break-words">'+esc(f.message)+'</p>'+(f.chefNote?'<p class="text-[11px] text-teal-200 break-words">Chef: '+esc(f.chefNote)+'</p>':'')+
      '<div class="flex gap-2"><button type="button" class="v3-cf flex-1 rounded-lg py-1.5 text-xs border border-slate-600 text-slate-200" data-id="'+esc(f.id)+'" data-s="seen">Seen</button><button type="button" class="v3-cf flex-1 rounded-lg py-1.5 text-xs border border-teal-500/40 text-teal-200" data-id="'+esc(f.id)+'" data-s="done">Reply & close</button></div></article>';
  }).join('') : v3Card(v3Empty('No food comments yet.'));
  $$('.v3-cf').forEach(function(b){ b.onclick = function(){
    if (b.dataset.s === 'seen') { v3Call('markChefFeedback', { id: b.dataset.id, status:'seen' }, 'Marked seen').then(function(r){ if (r) v3RenderChefComments(); }); return; }
    v3Form('Reply to staff', [{ id:'chefNote', label:'Reply (sent as a notification)', type:'textarea', max:300 }], 'Send & close', async function(v){
      const r = await v3Call('markChefFeedback', { id: b.dataset.id, status:'done', chefNote: v.chefNote }, 'Closed'); if (r) v3RenderChefComments(); return !!r; });
  }; });
}
async function v3RenderMenuEditor(){
  const wd = state.menuWd != null ? state.menuWd : addFijiDays(getFijiNow(),1).getUTCDay();
  $('#main-content').innerHTML = v3Page(v3Back(v3IsChef()?'chef':'more', v3IsChef()?'Chef':'More') +
    '<div class="grid grid-cols-7 gap-1">'+[1,2,3,4,5,6,0].map(function(i){ return '<button type="button" class="v3-wd rounded-lg py-2 text-[11px] '+(i===wd?'bg-teal-600 text-white font-semibold':'bg-slate-800/70 text-slate-300')+'" data-wd="'+i+'">'+WEEKDAY_NAMES[i].slice(0,3)+'</button>'; }).join('')+'</div>'+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-utensils', esc(WEEKDAY_NAMES[wd])+' dinner menu')+'<div id="me-list">'+v3Loading()+'</div>'+
    '<div class="flex gap-2 pt-2"><input id="me-new" class="ui-input flex-1 min-w-0" maxlength="80" placeholder="Add a dish"/><button type="button" id="me-add" class="btn-primary rounded-xl px-4 text-sm text-white font-semibold">Add</button></div></section>'+
    '<p class="text-[10px] text-slate-400 px-1">Dishes with the most dislikes are good candidates to replace. Burger and pizza are daily items and are not voted on.</p>', 'chefmenu-root');
  $$('.v3-wd').forEach(function(b){ b.onclick = function(){ state.menuWd = Number(b.dataset.wd); v3RenderMenuEditor(); }; });
  const [m, w] = await Promise.all([api('getDinnerMenus', { weekday: wd, includeInactive:true }).catch(function(){ return null; }), api('getWeeklyMenu', {}).catch(function(){ return null; })]);
  if (state.tab !== 'chefmenu') return;
  const items = ((m && m.data && (m.data.items || m.data.serviceItems)) || []).filter(function(it){ return Number(it.weekday) === wd; });
  const tally = {}; ((w && w.data && w.data.days) || []).forEach(function(d){ d.items.forEach(function(it){ tally[String(it.dish).toLowerCase()] = it; }); });
  $('#me-list').innerHTML = items.length ? items.map(function(it){
    const t = tally[String(it.itemName).toLowerCase()] || { likes:0, dislikes:0 };
    const daily = /burger|pizza/i.test(it.itemName);
    return '<div class="v3-row py-2 border-b border-slate-700/40 last:border-0 min-w-0"><div class="min-w-0"><p class="text-sm text-slate-100 break-words">'+esc(it.itemName)+(it.active===false?' <span class="text-[10px] text-slate-500">(hidden)</span>':'')+'</p>'+
      '<p class="text-[10px] text-slate-400">'+(daily ? 'Daily item' : '<i class="fa-solid fa-thumbs-up text-teal-300"></i> '+t.likes+' · <i class="fa-solid fa-thumbs-down text-rose-300"></i> '+t.dislikes)+'</p></div>'+
      '<div class="flex gap-1 shrink-0"><button type="button" class="v3-me-ren rounded-lg px-2 py-1 text-[11px] border border-slate-600 text-slate-200" data-id="'+esc(it.id)+'" data-name="'+esc(it.itemName)+'">Rename</button>'+
      '<button type="button" class="v3-me-del rounded-lg px-2 py-1 text-[11px] border border-rose-500/40 text-rose-200" data-id="'+esc(it.id)+'">Delete</button></div></div>';
  }).join('') : v3Empty('No dishes for this day.');
  const done = function(){ cacheInvalidate(['weeklyMenu', 'dinnerMenus:'+dinnerCutoffInfo().serviceDate]); v3RenderMenuEditor(); };
  $('#me-add').onclick = async function(){ const n = $('#me-new').value.trim(); if (!n) { toast('Type a dish name','error'); return; } const r = await v3Call('saveDinnerMenuItem', { weekday: wd, itemName: n, sortOrder: items.length + 1 }, 'Dish added'); if (r) done(); };
  $$('.v3-me-ren').forEach(function(b){ b.onclick = function(){ v3Form('Rename dish', [{ id:'itemName', label:'Dish name', value: b.dataset.name, required:true, max:80 }], 'Save', async function(v){ const r = await v3Call('saveDinnerMenuItem', { id: b.dataset.id, weekday: wd, itemName: v.itemName }, 'Saved'); if (r) done(); return !!r; }); }; });
  $$('.v3-me-del').forEach(function(b){ b.onclick = async function(){ if (!confirm('Delete this dish from '+WEEKDAY_NAMES[wd]+'?')) return; const r = await v3Call('deleteDinnerMenuItem', { id: b.dataset.id }, 'Deleted'); if (r) done(); }; });
}
/* reports + roster compare */
function v3ParseCsv(text){
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(c){ return String(c).trim() !== ''; }); });
}
async function v3ReadRoster(file){
  // CSV is read on the phone (no download needed); Excel uses the 2.7.0 roster parser
  if (/\.csv$/i.test(file.name) || /text\/csv/.test(file.type||'')) {
    const shifts = sheetRowsToShifts(v3ParseCsv(await file.text()), '');
    if (!shifts.length) throw new Error('No shift rows found. Use CSV columns: name,department,date,start,end,dayOff');
    return { shifts: shifts, fileType:'csv' };
  }
  return parseRosterFile(file, '');
}
function v3RosterExpected(shifts){
  const by = {};
  (shifts||[]).forEach(function(s){ const d = String(s.date||'').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || s.dayOff) return; (by[d] = by[d] || {})[String(s.rawName).trim().toLowerCase()] = 1; });
  const out = {}; Object.keys(by).forEach(function(d){ out[d] = Object.keys(by[d]).length; });
  return out;
}
async function v3RenderChefReports(){
  const today = fijiDateString();
  const st = state.rep || { period:'weekly', from: fijiDateString(addFijiDays(getFijiNow(), -6)), to: fijiDateString(addFijiDays(getFijiNow(), 1)), meal:'all' };
  state.rep = st;
  $('#main-content').innerHTML = v3Page(v3Back(v3IsChef()?'chef':'more', v3IsChef()?'Chef':'More') +
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-chart-column','Meal report')+
    '<div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/60 p-1">'+['daily','weekly','monthly'].map(function(p){ return '<button type="button" class="v3-per rounded-lg py-1.5 text-xs '+(st.period===p?'bg-teal-600 text-white font-semibold':'text-slate-300')+'" data-p="'+p+'">'+p[0].toUpperCase()+p.slice(1)+'</button>'; }).join('')+'</div>'+
    '<div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400 space-y-1 min-w-0"><span>From</span><input type="date" id="rp-from" class="ui-input w-full min-w-0" value="'+st.from+'"/></label><label class="text-[10px] text-slate-400 space-y-1 min-w-0"><span>To</span><input type="date" id="rp-to" class="ui-input w-full min-w-0" value="'+st.to+'"/></label></div>'+
    '<select id="rp-meal" class="ui-input w-full">'+[['all','All meals'],['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner']].map(function(o){ return '<option value="'+o[0]+'"'+(st.meal===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>'+
    '<button type="button" id="rp-go" class="btn-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold">Show report</button></section>'+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="rp-roster">'+v3Title('fa-file-excel','Compare with staff roster')+
    '<p class="text-[11px] text-slate-400">Upload the weekly roster (CSV or Excel: name, department, date, start, end, dayOff). Staff on the roster and not on a day off are "expected on the island" for each meal.</p>'+
    '<input type="file" id="rp-file" accept=".csv,.xlsx,.xls,text/csv" class="block w-full text-xs text-slate-300"/>'+
    '<p id="rp-roster-info" class="text-[11px] text-teal-300">'+(state.repRoster ? esc(state.repRoster.name)+' · '+state.repRoster.count+' shifts loaded' : '')+'</p></section>'+
    '<div id="rp-out" class="space-y-3"></div>', 'chefreports-root');
  $$('.v3-per').forEach(function(b){ b.onclick = function(){
    const p = b.dataset.p; st.period = p;
    if (p === 'daily') { st.from = today; st.to = today; }
    else if (p === 'weekly') { st.from = fijiDateString(addFijiDays(getFijiNow(), -6)); st.to = fijiDateString(addFijiDays(getFijiNow(), 1)); }
    else { st.from = today.slice(0,8)+'01'; st.to = fijiDateString(addFijiDays(getFijiNow(), 1)); }
    v3RenderChefReports();
  }; });
  $('#rp-file').onchange = async function(){
    const f = this.files && this.files[0]; if (!f) return;
    try {
      const r = await v3ReadRoster(f);
      state.repRoster = { name: f.name, count: r.shifts.length, expected: v3RosterExpected(r.shifts) };
      $('#rp-roster-info').textContent = f.name+' · '+r.shifts.length+' shifts loaded';
      toast('Roster loaded — '+Object.keys(state.repRoster.expected).length+' days', 'ok');
      if (state.repData) v3PaintReport(state.repData);
    } catch (e) { toast((e && e.message) || 'Could not read the roster','error'); }
  };
  $('#rp-go').onclick = async function(){
    st.from = $('#rp-from').value; st.to = $('#rp-to').value; st.meal = $('#rp-meal').value;
    $('#rp-out').innerHTML = v3Card(v3Loading());
    const d = await v3Call('getMealReport', { from: st.from, to: st.to, meal: st.meal });
    if (!d || state.tab !== 'chefreports') { $('#rp-out').innerHTML = ''; return; }
    state.repData = d; v3PaintReport(d);
  };
  if (state.repData) v3PaintReport(state.repData);
}
function v3ReportRows(d){
  const exp = state.repRoster ? state.repRoster.expected : null;
  const rows = [];
  d.days.forEach(function(day){ d.meals.forEach(function(m){ const c = day.meals[m]; const e = exp && exp[day.date] != null ? exp[day.date] : null; // days not on the roster stay blank
    rows.push({ date: day.date, meal: m, counted: c.counted, served: c.served, late: c.late, special: c.special, cancelled: c.cancelled, declined: c.declined, pending: c.pending, expected: e, gap: e == null ? null : e - c.counted }); }); });
  return rows;
}
function v3PaintReport(d){
  const rows = v3ReportRows(d), exp = !!state.repRoster;
  const cols = ['Date','Meal','Ordered','Served','Late','Special','Cancelled'].concat(exp ? ['On roster','Not ordered'] : []);
  const tr = rows.map(function(r){ return [r.date, V3_MEAL_LABEL[r.meal], r.counted, r.served, r.late, r.special, r.cancelled].concat(exp ? [r.expected, r.gap] : []); });
  const sum = function(k){ return rows.reduce(function(s, r){ return s + (Number(r[k]) || 0); }, 0); };
  const foot = ['Total','', sum('counted'), sum('served'), sum('late'), sum('special'), sum('cancelled')].concat(exp ? [sum('expected'), sum('gap')] : []);
  // phone table: short labels so every column fits at 390px (print / CSV keep the full labels)
  const shortCols = ['Date','Meal','Ord','Srv','Late','Spec','Cxl'].concat(exp ? ['Rost','Gap'] : []);
  const shortMeal = { breakfast:'Bkf', lunch:'Lun', dinner:'Din' };
  const phoneRows = rows.map(function(r){ const p = String(r.date).split('-'); return [p[2]+'/'+p[1], shortMeal[r.meal], r.counted, r.served, r.late, r.special, r.cancelled].concat(exp ? [r.expected, r.gap] : []); });
  const tableHtml = '<table class="w-full text-[10px] text-left table-fixed"><thead><tr class="text-slate-400">'+shortCols.map(function(c){ return '<th class="px-0.5 py-1 font-medium">'+c+'</th>'; }).join('')+'</tr></thead><tbody>'+
    phoneRows.map(function(r){ return '<tr class="border-t border-slate-700/40">'+r.map(function(c, i){ return '<td class="px-0.5 py-1 '+(i===shortCols.length-1&&exp&&Number(c)>0?'text-amber-300 font-semibold':'text-slate-200')+'">'+esc(c==null?'':c)+'</td>'; }).join('')+'</tr>'; }).join('')+
    '</tbody><tfoot><tr class="border-t border-slate-600 font-semibold">'+foot.map(function(c){ return '<td class="px-0.5 py-1">'+esc(c)+'</td>'; }).join('')+'</tr></tfoot></table>'+
    '<p class="text-[10px] text-slate-500">Ord = ordered (counted) · Srv = served · Spec = special · Cxl = cancelled'+(exp?' · Rost = on the roster · Gap = on roster but not ordered':'')+'</p>';
  $('#rp-out').innerHTML = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="rp-table">'+v3Title('fa-table', esc(d.from)+' → '+esc(d.to))+
    '<div class="grid grid-cols-3 gap-2 text-center">'+d.meals.map(function(m){ return '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2"><p class="text-[10px] text-slate-400">'+V3_MEAL_LABEL[m]+'</p><p class="text-lg font-semibold text-slate-100">'+d.totals[m].counted+'</p><p class="text-[10px] text-slate-500">'+d.totals[m].served+' served</p></div>'; }).join('')+'</div>'+
    tableHtml+(exp ? '<p class="text-[10px] text-slate-400">Gap = staff on the roster minus meals ordered. A positive gap means staff on the island who did not order.</p>' : '')+
    (d.dinnerItems && d.dinnerItems.length ? '<p class="v3-section-title pt-2">Dinner dishes ordered</p>'+d.dinnerItems.slice(0,8).map(function(x){ return '<div class="v3-row text-xs"><span class="truncate min-w-0">'+esc(x.item)+'</span><span class="text-slate-300">'+x.count+'</span></div>'; }).join('') : '')+
    '<div class="grid grid-cols-2 gap-2 pt-2"><button type="button" id="rp-print" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-print mr-1"></i>Print</button><button type="button" id="rp-csv" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-download mr-1"></i>Download CSV</button></div></section>';
  $('#rp-print').onclick = function(){ v3Print('Meal report '+d.from+' → '+d.to+(state.repRoster?' (roster: '+state.repRoster.name+')':''), v3Table(cols, tr.map(function(r){ return r.map(function(c){ return c==null?'':c; }); }), foot)); };
  $('#rp-csv').onclick = function(){ v3Download('meal-report-'+d.from+'-to-'+d.to+'.csv', rows, ['date','meal','counted','served','late','special','cancelled','declined','pending'].concat(exp ? ['expected','gap'] : [])); };
}

/* ============ M. Admin / superadmin ============ */
function v3ManageGroups(){
  const h = v3Home(), hb = h.hodBar || {}, sd = (h.superDash && h.superDash.pending) || {};
  const g = function(title, rows){ return '<section class="space-y-1.5 min-w-0"><h3 class="v3-section-title px-1">'+title+'</h3><div class="glass rounded-2xl overflow-hidden">'+rows+'</div></section>'; };
  let html = g('Approvals', v3Row(v3Nav('approvals'),'fa-inbox','Approvals inbox','Leave, late & special meals, join requests', (hb.leave||0)+(hb.leaveMgmt||0)+(hb.late||0)+(hb.joins||0)) +
    v3Row("state.leaveTabForce='final';navigate('leave')",'fa-stamp','Leave — final approval','After the HOD step', hb.leaveMgmt||sd.leaveMgmt||0));
  html += g('People', v3Row(v3Nav('usersv3'),'fa-users-gear','Users & roles','Edit, delete, roles, departments, assistant HOD') +
    v3Row(v3Nav('deptstaff'),'fa-people-group','Departments','Join requests and staff per department', hb.joins||0) +
    v3Row(v3Nav('migrate'),'fa-shuffle','Role migration (3.0)','Preview, then apply'));
  html += g('Kitchen', v3Row(v3Nav('chefreq'),'fa-clock-rotate-left','Late & special requests','', h.chef ? h.chef.pending.late + h.chef.pending.special : 0) +
    v3Row(v3Nav('kitchen'),'fa-list-ol','Kitchen lists','Print / PDF') + v3Row(v3Nav('chefreports'),'fa-chart-column','Meal reports & roster','') +
    v3Row(v3Nav('chefmenu'),'fa-pen-to-square','Edit menu','') + v3Row(v3Nav('chefcomments'),'fa-comment-dots','Food comments','', h.chef ? h.chef.feedbackNew : 0));
  html += g('Boat', v3Row(v3Nav('admin'),'fa-ship','Boat admin','Runs, bookings, manifests, emergency travel') + v3Row(v3Nav('boat'),'fa-calendar-days','Boat schedule',''));
  html += g('Communication', v3Row(v3Nav('reminders'),'fa-bell','Reminders','Add, edit, remove') + v3Row(v3Nav('suggestions'),'fa-lightbulb','Suggestions','Approve / reject') +
    v3Row(v3Nav('deptupdates'),'fa-bullhorn','Department updates',''));
  html += g('Reports & system', v3Row(v3Nav('adminstatus'),'fa-file-arrow-down','Admin status & reports','Download all app data') +
    (v3IsSuper() ? v3Row(v3Nav('settings'),'fa-gear','App settings','Code delivery, features, alert emails') : ''));
  return html;
}
function v3RenderManage(){ $('#main-content').innerHTML = v3Page(v3ManageGroups(), 'manage-root'); }
async function v3RenderUsers(){
  const f = state.uf || { q:'', role:'', dept:'' }; state.uf = f;
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') +
    '<section class="glass rounded-2xl p-3 space-y-2 min-w-0"><input id="uf-q" class="ui-input w-full" placeholder="Search name or email" value="'+esc(f.q)+'"/>'+
    '<div class="grid grid-cols-2 gap-2"><select id="uf-role" class="ui-input w-full min-w-0"><option value="">All roles</option>'+Object.keys(V3_ROLE_LABEL).map(function(r){ return '<option value="'+r+'"'+(f.role===r?' selected':'')+'>'+V3_ROLE_LABEL[r]+'</option>'; }).join('')+'<option value="asst"'+(f.role==='asst'?' selected':'')+'>Assistant HOD</option><option value="pending"'+(f.role==='pending'?' selected':'')+'>Waiting to join</option></select>'+
    '<select id="uf-dept" class="ui-input w-full min-w-0"><option value="">All departments</option>'+PCR_DEPARTMENTS.map(function(d){ return '<option'+(f.dept===d?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select></div></section>'+
    '<div id="uf-list" class="space-y-2">'+v3Loading()+'</div>', 'users-root');
  const r = await api('getUsers', { activeOnly:false }).catch(function(){ return null; });
  if (state.tab !== 'usersv3') return;
  if (!r || !r.success) { $('#uf-list').innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((r && r.error) || 'Could not load users')+'</p>'); return; }
  const all = r.data.users || [];
  const paint = function(){
    const q = f.q.toLowerCase();
    const list = all.filter(function(u){
      if (q && (u.email+' '+u.firstName+' '+u.lastName+' '+(u.preferredName||'')).toLowerCase().indexOf(q) < 0) return false;
      if (f.dept && u.department !== f.dept) return false;
      if (f.role === 'asst') return !!u.assistantHod || userPerms(u).includes('assistant_hod');
      if (f.role === 'pending') return u.deptStatus === 'pending';
      if (f.role && v3RoleOf(u) !== f.role) return false;
      return true;
    });
    $('#uf-list').innerHTML = '<p class="text-[11px] text-slate-400 px-1">'+list.length+' of '+all.length+' users</p>'+list.slice(0, 200).map(function(u){
      return '<button type="button" class="v3-user w-full text-left glass rounded-xl p-3 min-w-0" data-email="'+esc(u.email)+'"><div class="v3-row"><p class="text-sm text-slate-100 truncate min-w-0">'+esc(fullDisplayName(u))+'</p>'+
        '<span class="flex gap-1 shrink-0">'+v3Chip(esc(V3_ROLE_LABEL[v3RoleOf(u)]), v3RoleOf(u)==='staff'?'mute':'ok')+(u.assistantHod||userPerms(u).includes('assistant_hod')?v3Chip('Asst HOD','info'):'')+(!u.active?v3Chip('inactive','bad'):'')+'</span></div>'+
        '<p class="text-[11px] text-slate-400 truncate">'+esc(u.email)+' · '+esc(u.department||'—')+(u.deptStatus && u.deptStatus!=='approved'?' · <span class="text-amber-300">'+esc(u.deptStatus)+'</span>':'')+'</p></button>';
    }).join('');
    $$('.v3-user').forEach(function(b){ b.onclick = function(){ v3EditUser(all.find(function(u){ return u.email === b.dataset.email; })); }; });
  };
  paint();
  $('#uf-q').oninput = function(){ f.q = this.value; paint(); };
  $('#uf-role').onchange = function(){ f.role = this.value; paint(); };
  $('#uf-dept').onchange = function(){ f.dept = this.value; paint(); };
}
function v3EditUser(u){
  if (!u) return;
  const roles = Object.keys(V3_ROLE_LABEL).filter(function(r){ return v3IsSuper() || (r !== 'admin' && r !== 'super_admin') || r === v3RoleOf(u); });
  v3Form('Edit '+fullDisplayName(u), [
    { id:'role', label:'Role', type:'select', options: roles.map(function(r){ return { value:r, label:V3_ROLE_LABEL[r] }; }), value: v3RoleOf(u) },
    { id:'department', label:'Department', type:'select', options: PCR_DEPARTMENTS.indexOf(u.department) >= 0 || !u.department ? PCR_DEPARTMENTS : [u.department].concat(PCR_DEPARTMENTS), value: u.department },
    { id:'deptStatus', label:'Department status', type:'select', options:[{value:'approved',label:'Accepted'},{value:'pending',label:'Waiting for HOD'},{value:'declined',label:'Declined'},{value:'removed',label:'Removed'}], value: u.deptStatus || 'approved' },
    { id:'assistantHod', label:'Assistant HOD of this department (HOD approval rights for leave & late meals)', type:'checkbox', value: !!u.assistantHod || userPerms(u).includes('assistant_hod') },
    { id:'active', label:'Account active', type:'checkbox', value: !!u.active }
  ], 'Save changes', async function(v){
    const p = { targetEmail: u.email, assistantHod: v.assistantHod ? 'true' : 'false', active: v.active ? 'true' : 'false' };
    if (v.role !== v3RoleOf(u)) p.role = v.role;
    if (v.department !== u.department) p.department = v.department;
    else if (v.deptStatus !== (u.deptStatus || 'approved')) p.deptStatus = v.deptStatus;
    const r = await v3Call('setUserAccess', p, 'Saved');
    if (r) { v3RenderUsers(); }
    return !!r;
  }, esc(u.email)+'<br><button type="button" id="v3-del-user" class="mt-2 text-rose-300 text-xs"><i class="fa-solid fa-trash mr-1"></i>Delete this user</button>');
  const del = $('#v3-del-user');
  if (del) del.onclick = async function(){
    if (!confirm('Delete '+u.email+' permanently? Their past orders stay in the sheets.')) return;
    const r = await v3Call('deleteUser', { targetEmail: u.email }, 'User deleted');
    if (r) { closeModal(); v3RenderUsers(); }
  };
}
async function v3RenderReminders(){
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') + '<button type="button" id="rm-add" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white"><i class="fa-solid fa-plus mr-1"></i>Add reminder</button><div id="rm-list" class="space-y-2">'+v3Loading()+'</div>', 'reminders-root');
  const form = function(r){
    v3Form(r ? 'Edit reminder' : 'New reminder', [
      { id:'title', label:'Title', value: r && r.title, required:true, max:120 }, { id:'body', label:'Details', type:'textarea', value: r && r.body, max:1000 },
      { id:'dueDate', label:'Due date', type:'date', value: r && String(r.dueDate||'').slice(0,10) }, { id:'important', label:'Important (shown highlighted to everyone)', type:'checkbox', value: r && (r.important === true || r.important === 'TRUE' || String(r.priority) === 'high') }
    ], r ? 'Save' : 'Add', async function(v){
      const p = { title: v.title, body: v.body, dueDate: v.dueDate, important: v.important ? 'true' : 'false', priority: v.important ? 'high' : 'normal' };
      const d = r ? await v3Call('updateReminder', Object.assign({ id: r.id }, p), 'Saved') : await v3Call('addReminder', p, 'Reminder added');
      if (d) { cacheInvalidate(['reminders']); v3RenderReminders(); }
      return !!d;
    });
  };
  $('#rm-add').onclick = function(){ form(null); };
  const d = await v3Call('getReminders', {});
  if (state.tab !== 'reminders' || !d) return;
  const rows = d.reminders || [];
  cacheSet('reminders', rows);
  $('#rm-list').innerHTML = rows.length ? rows.map(function(r){
    const imp = r.important === true || r.important === 'TRUE' || String(r.priority) === 'high';
    return '<article class="glass rounded-2xl p-3 space-y-1.5 min-w-0"><div class="v3-row"><p class="text-sm text-slate-100 break-words min-w-0">'+(imp?'<i class="fa-solid fa-triangle-exclamation text-amber-300 mr-1"></i>':'')+esc(r.title)+'</p>'+(r.dueDate?v3Chip('Due '+esc(String(r.dueDate).slice(0,10)),'mute'):'')+'</div>'+
      (r.body?'<p class="text-xs text-slate-300 break-words">'+esc(r.body)+'</p>':'')+
      '<div class="flex gap-2"><button type="button" class="v3-rm flex-1 rounded-lg py-1.5 text-xs border border-slate-600 text-slate-200" data-a="edit" data-id="'+esc(r.id)+'">Edit</button><button type="button" class="v3-rm flex-1 rounded-lg py-1.5 text-xs border border-teal-500/40 text-teal-200" data-a="done" data-id="'+esc(r.id)+'">Done</button><button type="button" class="v3-rm flex-1 rounded-lg py-1.5 text-xs border border-rose-500/40 text-rose-200" data-a="del" data-id="'+esc(r.id)+'">Remove</button></div></article>';
  }).join('') : v3Card(v3Empty('No active reminders.'));
  $$('.v3-rm').forEach(function(b){ b.onclick = async function(){
    const r = rows.find(function(x){ return x.id === b.dataset.id; });
    if (b.dataset.a === 'edit') return form(r);
    if (b.dataset.a === 'del' && !confirm('Remove this reminder?')) return;
    const d2 = await v3Call(b.dataset.a === 'done' ? 'completeReminder' : 'deleteReminder', { id: b.dataset.id }, b.dataset.a === 'done' ? 'Marked done' : 'Removed');
    if (d2) { cacheInvalidate(['reminders']); v3RenderReminders(); }
  }; });
}
async function v3RenderAdminStatus(){
  const from = state.exFrom || fijiDateString(addFijiDays(getFijiNow(), -30)), to = state.exTo || fijiDateString(addFijiDays(getFijiNow(), 1));
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') +
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-file-arrow-down','Generate reports')+'<div class="grid grid-cols-2 gap-2"><input type="date" id="ex-from" class="ui-input w-full min-w-0" value="'+from+'"/><input type="date" id="ex-to" class="ui-input w-full min-w-0" value="'+to+'"/></div>'+
    '<button type="button" id="ex-go" class="btn-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold">Generate</button><p class="text-[10px] text-slate-400">Passwords are never included. Files are CSV (open in Excel / Google Sheets).</p></section><div id="ex-out"></div>', 'adminstatus-root');
  $('#ex-go').onclick = async function(){
    state.exFrom = $('#ex-from').value; state.exTo = $('#ex-to').value;
    $('#ex-out').innerHTML = v3Card(v3Loading());
    const d = await v3Call('getAdminExport', { from: state.exFrom, to: state.exTo });
    if (!d || state.tab !== 'adminstatus') { $('#ex-out').innerHTML = ''; return; }
    const reqs = [].concat((d.breakfast||[]).map(function(o){ return Object.assign({ meal:'breakfast' }, o); }), (d.lunch||[]).map(function(o){ return Object.assign({ meal:'lunch' }, o); }), (d.dinner||[]).map(function(o){ return Object.assign({ meal:'dinner' }, o); }))
      .filter(function(o){ return o.orderType === 'special' || o.orderType === 'late_request' || o.status === 'late_pending' || String(o.late) === 'true' || o.late === true; });
    const orders = [].concat((d.breakfast||[]).map(function(o){ return Object.assign({ meal:'breakfast' }, o); }), (d.lunch||[]).map(function(o){ return Object.assign({ meal:'lunch' }, o); }), (d.dinner||[]).map(function(o){ return Object.assign({ meal:'dinner' }, o); }));
    const sets = [['orders','Meal orders (all)', orders], ['breakfast','Breakfast orders', d.breakfast], ['lunch','Lunch orders', d.lunch], ['dinner','Dinner orders', d.dinner], ['requests','Late & special requests', reqs],
      ['leave','Leave requests', d.leave], ['boat-runs','Boat runs', d.boatRuns], ['boat-bookings','Boat bookings', d.boatBookings], ['users','Users', d.users], ['feedback','Chef feedback', d.feedback], ['suggestions','Suggestions', d.suggestions], ['menu-votes','Menu likes & dislikes', d.menuVotes]];
    state._exSets = sets;
    $('#ex-out').innerHTML = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ex-list">'+v3Title('fa-table-list', esc(d.from)+' → '+esc(d.to))+
      sets.map(function(s, i){ return '<div class="v3-row py-1.5 border-b border-slate-700/40 last:border-0"><span class="text-sm text-slate-200 min-w-0 truncate">'+s[1]+' <span class="text-[11px] text-slate-400">('+(s[2]||[]).length+')</span></span><button type="button" class="v3-ex rounded-lg px-3 py-1.5 text-xs border border-slate-600 text-slate-200" data-i="'+i+'"><i class="fa-solid fa-download mr-1"></i>CSV</button></div>'; }).join('')+
      '<button type="button" id="ex-all" class="btn-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold mt-2">Download all ('+sets.length+' files)</button><p class="text-[10px] text-slate-500">Generated '+esc(v3Ts(d.generatedAt))+' · server '+esc(d.version)+'</p></section>';
    const one = function(i){ const s = sets[i]; v3Download('pcr-'+s[0]+'-'+d.from+'-to-'+d.to+'.csv', s[2]||[]); };
    $$('.v3-ex').forEach(function(b){ b.onclick = function(){ one(Number(b.dataset.i)); }; });
    $('#ex-all').onclick = function(){ sets.forEach(function(s, i){ if ((s[2]||[]).length) setTimeout(function(){ one(i); }, i*350); }); };
  };
}
async function v3RenderMigrate(){
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') + v3Card(v3Title('fa-shuffle','3.0 role migration')+
    '<p class="text-xs text-slate-300">Roles become: superadmin, admin, chef, boat manager, HOD, staff. Captain → boat manager; assistant HOD → staff + assistant HOD flag (same department); basic → staff. Run the preview first — nothing changes until you press Apply.</p>'+
    '<div class="grid grid-cols-2 gap-2"><button type="button" id="mg-dry" class="rounded-xl py-2.5 text-sm border border-teal-500/40 text-teal-200">Preview</button><button type="button" id="mg-apply" class="rounded-xl py-2.5 text-sm border border-rose-500/40 text-rose-200">Apply</button></div>')+'<div id="mg-out"></div>', 'migrate-root');
  const show = function(d){
    $('#mg-out').innerHTML = v3Card(v3Title('fa-table', d.applied ? 'Applied' : 'Preview (nothing changed)')+'<p class="text-xs text-slate-300">'+d.totalUsers+' users · '+d.changeCount+' need a change · '+d.assistantHodFlags+' assistant HOD flag(s)</p>'+
      Object.keys(d.mapping).sort().map(function(k){ return '<div class="v3-row text-xs py-1 border-b border-slate-700/40 last:border-0"><span class="min-w-0 break-words text-slate-200">'+esc(k)+'</span><span class="text-slate-100 font-semibold">'+d.mapping[k]+'</span></div>'; }).join('')+
      '<p class="v3-section-title pt-2">After migration</p>'+Object.keys(d.byRole).map(function(r){ return '<div class="v3-row text-xs"><span>'+esc(V3_ROLE_LABEL[r]||r)+'</span><span>'+d.byRole[r]+'</span></div>'; }).join(''));
  };
  $('#mg-dry').onclick = async function(){ const d = await v3Call('migrateRoles', { dryRun: 'true' }); if (d) show(d); };
  $('#mg-apply').onclick = async function(){ if (!confirm('Apply the role migration to all users now?')) return; const d = await v3Call('migrateRoles', { apply: 1 }, 'Migration applied'); if (d) show(d); };
}
async function v3RenderSettings(){
  const s = state.appSettings || {};
  const cur = String(s.verification_delivery || v3Home().verificationDelivery || 'screen');
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') +
    v3Card(v3Title('fa-key','Verification & reset codes')+'<p class="text-xs text-slate-300">Where sign-up and forgot-password codes are delivered.</p>'+
      '<div class="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/60 p-1">'+['screen','email'].map(function(v){ return '<button type="button" class="v3-vd rounded-lg py-2 text-xs '+(cur===v?'bg-teal-600 text-white font-semibold':'text-slate-300')+'" data-v="'+v+'">'+(v==='screen'?'Show on screen':'Send by email')+'</button>'; }).join('')+'</div>'+
      '<p class="text-[10px] text-amber-200/80">On screen: anyone who knows a staff email can reset that password. Email is safer once staff emails are reliable.</p>')+
    v3Card(v3Title('fa-toggle-on','Feature flags')+'<div id="admin-body"></div>')+
    v3Card(v3Title('fa-envelope','Alert emails & other tools')+'<button type="button" onclick="openAlertEmails()" class="w-full rounded-xl py-2.5 text-sm border border-slate-600 text-slate-200">Manage alert emails</button>'+
      '<button type="button" onclick="navigate(\'admin\')" class="w-full rounded-xl py-2.5 text-sm border border-slate-600 text-slate-200">Classic admin tools (boat, import, alerts)</button>'), 'settings-root');
  $$('.v3-vd').forEach(function(b){ b.onclick = async function(){
    const passcode = await askPasscode('super'); if (!passcode) return;
    const d = await v3Call('setAppSetting', { key:'verification_delivery', value: b.dataset.v, passcode: passcode }, 'Codes will be '+(b.dataset.v === 'screen' ? 'shown on screen' : 'sent by email'));
    if (d) { state.appSettings = Object.assign({}, state.appSettings, { verification_delivery: b.dataset.v }); cacheInvalidate(['featureFlags','v3home']); v3RenderSettings(); }
  }; });
  try { await renderAdminFeaturesTab(); } catch (e) {}
}
async function v3RenderSuperHome(){
  const paint = function(sd){
    const u = state.user;
    const head = '<section class="glass rounded-2xl p-4 min-w-0" id="v3-greet"><div class="flex items-center gap-3 min-w-0">'+homeAvatarHtml(u)+'<div class="min-w-0"><h2 class="text-lg font-semibold text-slate-100 truncate">Bula, '+esc(displayName(u))+'</h2>'+
      '<p class="text-[11px] text-slate-400">Superadmin · <span id="v3-clock" class="v3-countdown">'+formatFiji()+'</span></p></div></div></section>';
    if (!sd) { $('#main-content').innerHTML = v3Page(head + v3Card(v3Loading()), 'home'); return; }
    const m = sd.meals || { today:{}, tomorrow:{} }, p = sd.pending || {};
    const stat = function(label, val, sub, tab){ return '<button type="button" '+(tab?'onclick="navigate(\''+tab+'\')"':'')+' class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2.5 text-left min-w-0"><p class="text-[10px] text-slate-400 truncate">'+label+'</p><p class="text-xl font-semibold text-slate-100">'+val+'</p>'+(sub?'<p class="text-[10px] text-slate-500 truncate">'+sub+'</p>':'')+'</button>'; };
    const totalPending = (p.leaveHod||0)+(p.leaveMgmt||0)+(p.late||0)+(p.special||0)+(p.joins||0);
    const meals = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-meals">'+v3Title('fa-utensils','Meals')+
      '<div class="grid grid-cols-3 gap-2">'+V3_MEALS.map(function(k){ return stat(V3_MEAL_LABEL[k], m.tomorrow[k]||0, 'tomorrow · today '+(m.today[k]||0), 'kitchen'); }).join('')+'</div>'+v3WeeklyChart(sd.weekly)+'</section>';
    const pend = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-pending">'+v3Title('fa-inbox','Waiting for approval', v3Chip(String(totalPending), totalPending?'warn':'mute'))+
      '<div class="grid grid-cols-3 gap-2">'+stat('Leave · HOD', p.leaveHod||0, '', 'approvals')+stat('Leave · final', p.leaveMgmt||0, '', 'approvals')+stat('Join requests', p.joins||0, '', 'approvals')+
      stat('Late meals', p.late||0, '', 'approvals')+stat('Special meals', p.special||0, '', 'approvals')+stat('Food comments', p.feedback||0, 'new', 'chefcomments')+'</div></section>';
    const boat = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-boat">'+v3Title('fa-ship','Boat load · today & tomorrow')+
      ((sd.boat||[]).length ? sd.boat.map(function(b){ const pct = b.capacity ? Math.min(100, Math.round(b.pax*100/b.capacity)) : 0;
        return '<div class="space-y-1"><div class="v3-row text-xs"><span class="truncate min-w-0 text-slate-200">'+esc(v3DateLabel(b.date))+' '+esc(b.time)+' · '+esc(b.route)+'</span><span class="text-slate-300">'+b.pax+(b.capacity?'/'+b.capacity:'')+'</span></div><div class="v3-bar"><span style="width:'+pct+'%'+(pct>=90?';background:#f59e0b':'')+'"></span></div></div>'; }).join('') : v3Empty('No runs today or tomorrow.'))+'</section>';
    const users = sd.users || {}, hl = sd.health || {};
    const people = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-users">'+v3Title('fa-users','People & app health')+
      '<div class="grid grid-cols-3 gap-2">'+stat('Users', users.total||0, (users.active||0)+' active', 'usersv3')+stat('New this week', users.newThisWeek||0, '', 'usersv3')+stat('Version', esc(String(hl.version||APP_VERSION).replace('-demo','')), state.demo?'demo':'live', 'settings')+'</div>'+
      '<p class="text-[11px] text-slate-400">'+Object.keys(users.byRole||{}).map(function(r){ return esc(V3_ROLE_LABEL[r]||r)+' '+users.byRole[r]; }).join(' · ')+'</p>'+
      '<p class="text-[11px] text-slate-400">Codes: '+(hl.verificationDelivery==='email'?'sent by email':'shown on screen')+' · server time '+esc(v3Ts(hl.fijiNow))+'</p></section>';
    $('#main-content').innerHTML = v3Page(head + pend + meals + boat + people + '<p class="text-center text-[10px] text-slate-500" id="home-ver">UI '+APP_VERSION+(state.backendVersion?' · API '+esc(state.backendVersion):'')+(state.demo?' · demo':'')+'</p>', 'home');
    v3StartTicker();
  };
  paint(v3Home().superDash);
  let d = null; try { const r = await v3ApiShared('getSuperDashboard', {}); d = r && r.success ? (r.data || {}) : null; if (r && !r.success) toast(r.error || 'Something went wrong','error'); } catch (e) {}
  if (d && state.tab === 'home') { const cur = v3Home(); cur.superDash = d; cacheSet('v3home', cur); paint(d); renderNav('#bottom-nav'); }
}

/* ============ N. start ============ */
boot();
