/* PCR Staff App 3.0 — redesigned screens (loaded after the inline 2.x app script in index.html).
 * Replaces Home / Meals / More / navigation and adds leave, department, chef, admin and superadmin areas.
 * Everything still goes through api() (GET only), Fiji time comes from getFijiNow(), demo mode (?demo=1) runs
 * the real 3.0 server rules from assets/v3-demo-server.js (generated from apps-script/V3.gs).
 * boot() is called at the very end of this file. */
'use strict';

/* ============ A. roles & small helpers ============ */
/* 3.0.0 role model: everyone uses the normal staff layout (Home / Meals / Boat / More). Roles only add buttons in More:
 * admin → Admin Settings · chef/kitchen → Kitchen Admin · boat manager/captain → Boat Admin · HOD / assistant HOD → Department Admin.
 * The superadmin keeps its own Dashboard / Approvals / Manage / More layout. Role pages need a signed session (v3. token). */
const V3_ROLE_LABEL = { super_admin:'Superadmin', admin:'Admin', hod:'HOD', assistant_hod:'Assistant HOD', chef:'Chef', kitchen:'Chef', boat_manager:'Boat manager', boat_captain:'Boat captain', boat:'Boat manager', staff:'Staff' };
const V3_ROLE_FILTERS = ['super_admin','admin','hod','assistant_hod','chef','boat_manager','boat_captain','staff'];
/** Assignable roles (multi-select). staff is implied. */
const V3_PERM_OPTIONS = [['hod','HOD'],['assistant_hod','Assistant HOD'],['chef','Chef / Kitchen'],['boat_manager','Boat manager'],['boat_captain','Boat captain'],['admin','Admin'],['super_admin','Superadmin']];
const V3_BUTTONS = { admin:{ tab:'adminhub', icon:'fa-user-shield', label:'Admin Settings', sub:'Users & roles, leave, reminders, reports' },
  kitchen:{ tab:'kitchenadmin', icon:'fa-fire-burner', label:'Kitchen Admin', sub:'Lists, menus, requests, meal times' },
  boat:{ tab:'boatadmin', icon:'fa-anchor', label:'Boat Admin', sub:'Runs, passengers, emergency travel' },
  dept:{ tab:'deptadmin', icon:'fa-people-group', label:'Department Admin', sub:'Approvals, staff, updates, leave' } };
/* stations were removed in 3.0.0 — kept as no-op stubs so older helpers stay safe */
function v3Station(){ return ''; }
function v3Exclusive(){ return false; }
const V3_LEAVE_TYPES = ['Day off','Annual leave','Sick sheet','Other'];
const V3_MEALS = ['breakfast','lunch','dinner'];
const V3_MEAL_LABEL = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner' };
const V3_MEAL_ICON = { breakfast:'fa-mug-saucer', lunch:'fa-bowl-food', dinner:'fa-moon' };

function v3Truthy(v){ return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1'; }
/** Every role the account holds (permissions + roles column + assistant HOD flag). */
function v3Perms(u){
  u = u || state.user; if (!u) return ['staff'];
  const out = userPerms(u).map(function(x){ return x === 'kitchen' ? 'chef' : (x === 'boat' ? 'boat_manager' : x); });
  const extra = Array.isArray(u.roles) ? u.roles : String(u.roles || '').split(/[,|\s]+/);
  extra.forEach(function(r){ r = String(r||'').trim(); if (r === 'kitchen') r = 'chef'; if (r === 'boat') r = 'boat_manager'; if (r && out.indexOf(r) < 0) out.push(r); });
  if (v3Truthy(u.assistantHod) && out.indexOf('assistant_hod') < 0) out.push('assistant_hod');
  return out.length ? out : ['staff'];
}
function v3Has(r, u){ return v3Perms(u).indexOf(r) >= 0; }
/** Role buttons for the More tab: ['admin','kitchen','boat','dept'] (same rule as Release3.gs roleButtons). */
function v3Buttons(u){
  u = u || state.user;
  if (u && Array.isArray(u.roleButtons)) return u.roleButtons.slice();
  const p = v3Perms(u), b = [];
  if (p.includes('admin') || p.includes('super_admin')) b.push('admin');
  if (p.includes('chef')) b.push('kitchen');
  if (p.includes('boat_manager') || p.includes('boat_captain')) b.push('boat');
  if (p.includes('hod') || p.includes('assistant_hod')) b.push('dept');
  return b;
}
function v3RoleOf(u){
  const p = v3Perms(u);
  if (p.includes('super_admin')) return 'super_admin';
  if (p.includes('admin')) return 'admin';
  if (p.includes('hod')) return 'hod';
  if (p.includes('chef')) return 'chef';
  if (p.includes('boat_manager')) return 'boat_manager';
  if (p.includes('boat_captain')) return 'boat_captain';
  return 'staff';
}
function v3Home(){ return cachePeek('v3home') || {}; }
function v3IsAsst(u){ return v3Has('assistant_hod', u); }
function v3IsSuper(){ return v3Has('super_admin'); }
function v3IsAdmin(){ return v3IsSuper() || v3Has('admin'); }
function v3IsLead(){ return v3Has('hod') || v3IsAsst(); }
function v3IsChef(){ return v3Has('chef'); }
/** Kitchen Admin pages: chef, admin, superadmin (server: isChefPerm). */
function v3CanChef(){ return v3IsChef() || v3IsAdmin(); }
function v3CanDept(){ return v3IsLead() || v3IsAdmin(); }
function v3DeptStatus(){ return 'approved'; } // 3.0.0: no department join approval
function v3DeptOk(){ return true; }
/** Boat Admin: boat manager / captain, admin, superadmin. */
function v3HasBoat(){ return v3Has('boat_manager') || v3Has('boat_captain') || v3IsAdmin(); }
function v3IsBoatManager(){ return v3Has('boat_manager') || v3IsAdmin(); }
function v3RoleLabel(u){
  const p = v3Perms(u).filter(function(x){ return x !== 'staff'; });
  if (!p.length) return 'Staff';
  const order = ['super_admin','admin','hod','assistant_hod','chef','boat_manager','boat_captain'];
  return order.filter(function(r){ return p.includes(r); }).map(function(r){ return V3_ROLE_LABEL[r]; }).join(' · ');
}
/** Role counts chips on the Users page (from getUsers roleCounts; people can hold more than one role). */
const V3_ROLE_COUNT_KEYS = [['super_admin','Superadmin'],['admin','Admin'],['hod','HOD'],['assistant_hod','Assistant HOD'],['chef','Kitchen'],['boat_manager','Boat manager'],['boat_captain','Boat captain'],['staff','Staff only'],['inactive','Inactive']];
function v3RoleCountChips(rc){
  if (!rc) return '';
  return '<div class="grid grid-cols-3 gap-2" id="role-counts">'+V3_ROLE_COUNT_KEYS.map(function(k){
    return '<div class="rounded-xl border border-slate-700/60 bg-slate-900/50 p-2 min-w-0" data-rolecount="'+k[0]+'"><p class="text-[10px] text-slate-400 truncate">'+esc(k[1])+'</p><p class="text-sm font-semibold text-slate-100">'+(rc[k[0]]||0)+'</p></div>';
  }).join('')+'</div>';
}
/** Role pages only work in role mode (Kitchen / Boat / Department / Admin page), never on the plain staff tabs. */
function v3InRoleMode(){ return !!state._roleMode; }

/* overrides of 2.x permission helpers (same names, 3.0.0 meaning). The Boat / Kitchen 2.x screens only show role tools
 * when opened from a role page (state._roleMode), so the staff Boat tab is the normal staff view for everyone. */
canHod = function(){ return v3CanDept(); };
canKitchen = function(){ return v3CanChef(); };
canBoatManager = function(){ return v3InRoleMode() && v3IsBoatManager(); };
canBoatCaptain = function(){ return v3InRoleMode() && v3HasBoat(); };
roleLabel = function(r){ return V3_ROLE_LABEL[r] || r; };

function v3Esc(s){ return esc(s); }
function v3Page(inner, id){ return '<div class="fade-in max-w-lg mx-auto space-y-4 pb-6 min-w-0"'+(id?' id="'+id+'"':'')+'>'+inner+'</div>'; }
/** Card; the optional 2nd argument is the section id (a value with spaces is treated as extra classes). */
function v3Card(inner, extra){ extra = extra || ''; const isId = extra && !/\s/.test(extra);
  return '<section'+(isId?' id="'+extra+'"':'')+' class="glass rounded-2xl p-4 space-y-3 min-w-0 '+(isId?'':extra)+'">'+inner+'</section>'; }
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
function v3Ts(s){ return String(s||'').replace(/ FJT$/,'').replace(/(\d\d:\d\d):\d\d(\.\d+)?Z?$/,'$1').replace(/^(\d{4}-\d\d-\d\d)T/,'$1 '); } // 3.1.0: "… FJT" no longer shows as "… FJ"
async function v3Call(action, payload, okMsg){
  let r;
  try { r = await api(action, payload || {}); }
  catch (e) { toast((e && e.message) || 'Couldn\'t reach the server — try again','error'); return null; }
  if (!r || !r.success) { if (!(r && r.cancelled)) toast((r && r.error) || 'Something went wrong','error'); return null; }
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
      if (f.type === 'select') inp = '<select id="v3f-'+f.id+'" class="ui-input w-full">'+f.options.map(function(o){ const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return '<option value="'+esc(v)+'"'+(String(v)===String(f.value||'')?' selected':'')+(typeof o === 'object' && o.disabled ? ' disabled' : '')+'>'+esc(l)+'</option>'; }).join('')+'</select>';
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
  'Boat Bookings':'boatBookings', 'Suggestions':'suggestions', 'Reminders':'reminders', 'Notifications':'notifications', 'Dinner Menus':'dinnerMenus',
  'Emergency Travel':'emergencyTravel', 'Role Changes':'roleChanges', 'Dinner Prep Snapshots':'dinnerSummaries', 'Reports':'reports', 'Admin Log':'adminLog' };
/* demo crypto: synchronous SHA-256 / HMAC-SHA256 (same results as Apps Script Utilities) so demo session tokens match the server */
const V3Crypto = (function(){
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const utf8 = function(s){ return Array.from(new TextEncoder().encode(String(s))); };
  function sha256(bytes){
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, m = bytes.slice(); m.push(0x80); while (m.length % 64 !== 56) m.push(0);
    const bits = l * 8; for (let i = 7; i >= 0; i--) m.push(i >= 4 ? 0 : (bits >>> (i*8)) & 255);
    const w = new Array(64);
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o+i*4]<<24)|(m[o+i*4+1]<<16)|(m[o+i*4+2]<<8)|m[o+i*4+3];
      for (let i = 16; i < 64; i++) { const a = w[i-15], b = w[i-2]; const s0 = ((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3), s1 = ((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10); w[i] = (w[i-16]+s0+w[i-7]+s1)|0; }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)), ch = (e&f)^(~e&g), t1 = (h+S1+ch+K[i]+w[i])|0;
        const S0 = ((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)), mj = (a&b)^(a&c)^(b&c), t2 = (S0+mj)|0;
        h = g; g = f; f = e; e = (d+t1)|0; d = c; c = b; b = a; a = (t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0; H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    const out = []; H.forEach(function(x){ out.push((x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255); }); return out;
  }
  function hmac(value, key){
    let k = utf8(key); if (k.length > 64) k = sha256(k); while (k.length < 64) k.push(0);
    const ip = k.map(function(b){ return b ^ 0x36; }), op = k.map(function(b){ return b ^ 0x5c; });
    return sha256(op.concat(sha256(ip.concat(utf8(value)))));
  }
  function b64(bytesOrString){ const bytes = typeof bytesOrString === 'string' ? utf8(bytesOrString) : bytesOrString; let bin = ''; bytes.forEach(function(b){ bin += String.fromCharCode(b & 255); }); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_'); }
  function unb64(s){ const bin = atob(String(s).replace(/-/g,'+').replace(/_/g,'/')); const out = []; for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i)); return out; }
  function uuid(){ const b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(b) : b.forEach(function(_, i){ b[i] = Math.floor(Math.random()*256); }); const h = Array.from(b).map(function(x){ return ('0'+x.toString(16)).slice(-2); }).join(''); return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20); }
  return { sha256: sha256, hmac: hmac, b64: b64, unb64: unb64, uuid: uuid, utf8: utf8 };
})();
const _v3DemoCache = {};
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
  String(u.roles || '').split(/[,|\s]+/).forEach(function(r){ r = r.trim(); if (r && list.indexOf(r) < 0) list.push(r); });
  if (v3Truthy(u.assistantHod) && list.indexOf('assistant_hod') < 0) list.push('assistant_hod');
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
    getRequester: function(p){ const e = String((p && p.requesterEmail) || '').trim().toLowerCase(); return e ? S.findUserByEmail(e) : null; },
    pad2: function(n){ return (n < 10 ? '0' : '') + n; },
    scInvalidateSheet: function(){}, SpreadsheetApp: { flush: function(){} },
    dsumSaveSnapshot: function(d, auto, kind, by){ const row = { id: uid('dps'), serviceDate: d, generatedAt: formatFiji(), autoGenerated: !!auto, kind: kind || 'auto', generatedBy: by || '' }; v3DemoRows('Dinner Prep Snapshots').push(row); return row; },
    dsumTryPdf: function(){ return { ok:false, error:'demo' }; },
    getSetting: function(k, fb){ const v = (V3DB.db.appSettings||{})[k]; return v === undefined || v === '' ? (fb === undefined ? '' : String(fb)) : String(v); },
    setSetting: function(k, v){ const db = V3DB.db; if (!db.appSettings) db.appSettings = {}; db.appSettings[k] = String(v); },
    stationsExclusive: function(){ return false; },
    ALL_PERMISSIONS: ['super_admin','admin','hod','assistant_hod','chef','boat_manager','boat_captain','staff'],
    permissionsToString: function(list){ return (list||[]).join(','); },
    primaryRoleFromPermissions: function(list){ list = list || []; const o = ['super_admin','admin','hod','assistant_hod','chef','boat_manager','boat_captain','staff']; for (const r of o) if (list.includes(r)) return r; return 'staff'; },
    sendAppMail: function(to, subject, body){ (V3DB.db.demoMail = V3DB.db.demoMail || []).push({ to:to, subject:subject, body:body, at: formatFiji() }); return true; },
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
    buildPrepPayload: function(sd){ const p = demoBuildPrep(V3DB.db, sd); return JSON.parse(JSON.stringify(p || {})); },
    preferredNameMap: function(){ const m = {}; (V3DB.db.users||[]).forEach(function(u){ m[String(u.email).toLowerCase()] = S.displayUserName(u); }); return m; },
    decorateOrderNotes: function(rows, map){ (rows||[]).forEach(function(o){ const n = kitchenNoteOf(o); o.specialNote = n; o.noteFlag = noteFlagOf(n); o.displayName = (map && map[String(o.userEmail||'').toLowerCase()]) || o.userName || ''; }); return rows; },
    countedMealStatus: function(st){ st = String(st||''); return !!st && ['cancelled','rejected','declined','late_pending','special_pending'].indexOf(st) < 0; },
    countsInBreakfastTotal: function(o){ const st = String((o && o.status) || ''); return ['ordered','late_approved','approved','prepared','served'].indexOf(st) >= 0; },
    displayUserName: function(u){ if (!u) return ''; const p = String(u.preferredName||'').trim(); return p || ((u.firstName||'')+' '+(u.lastName||'')).trim(); },
    normalizeStaffLocation: function(v){ const s = String(v==null?'':v).trim().toLowerCase(); if (!s) return ''; if (['true','yes','village'].includes(s)) return 'Village'; if (['false','no','mainland','resort'].includes(s)) return 'Mainland'; return String(v); },
    nowIso: function(){ return formatFiji(); },
    publicUser: function(u){ return publicUser(u); },
    truthy: v3Truthy, uid: uid, userPermissions: v3ParsePerms,
    isAdminPerm: function(u){ const p = v3ParsePerms(u); return p.includes('super_admin') || p.includes('admin'); },
    isSuperPerm: function(u){ return v3ParsePerms(u).includes('super_admin'); },
    isChefPerm: function(u){ if (!u) return false; const p = v3ParsePerms(u); return p.includes('chef') || p.includes('kitchen') || p.includes('admin') || p.includes('super_admin'); },
    scKey: function(a,b){ return a+'|'+b; }, scGetJson: function(){ return null; }, scPutJson: function(){}, scBump: function(){},
    withIdempotency: function(a, p, fn){ return fn(p); },
    getSS: function(){ return { getSheetByName: function(){ return {}; } }; }, ensureSheet: function(){}, ensureColumns: function(){},
    Utilities: { getUuid: V3Crypto.uuid, computeHmacSha256Signature: V3Crypto.hmac, base64EncodeWebSafe: V3Crypto.b64, base64DecodeWebSafe: V3Crypto.unb64,
      newBlob: function(bytes){ return { getDataAsString: function(){ return new TextDecoder().decode(new Uint8Array(bytes)); } }; } },
    PropertiesService: { getScriptProperties: function(){ const pr = function(){ const db = V3DB.db; if (!db.props) db.props = {}; return db.props; };
      return { getProperty: function(k){ const v = pr()[k]; return v === undefined ? null : v; }, setProperty: function(k, v){ pr()[k] = String(v); }, deleteProperty: function(k){ delete pr()[k]; } }; } },
    MailApp: { sendEmail: function(m){ (V3DB.db.demoMail = V3DB.db.demoMail || []).push({ to:m.to, subject:m.subject, body:m.body, at: formatFiji() }); } },
    LockService: { getScriptLock: function(){ return { tryLock: function(){ return true; }, releaseLock: function(){} }; } },
    A31IO: (function(){
      const list = function(n){ const db = V3DB.db;
        if (n === 'App Settings') return Object.keys(db.appSettings||{}).map(function(k){ return { key:k, value:String(db.appSettings[k]) }; });
        if (n === 'Alert Emails') { if (!db.alertEmails) db.alertEmails = []; return db.alertEmails; }
        if (n === 'Admin Log') { if (!db.adminLog) db.adminLog = []; return db.adminLog; }
        return v3DemoRows(n); };
      const same = function(a, b){ return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };
      const io = {
        rows: function(n){ return list(n).map(copy); },
        update: function(n, kf, kv, fields){ const db = V3DB.db;
          if (n === 'App Settings') { if (!db.appSettings) db.appSettings = {}; if (fields.value !== undefined) db.appSettings[kv] = String(fields.value); return true; }
          const r = list(n).find(function(x){ return same(x[kf], kv); }); if (!r) return false; Object.assign(r, fields); return true; },
        remove: function(n, kf, kv){ const db = V3DB.db;
          if (n === 'App Settings') { if (db.appSettings) delete db.appSettings[kv]; return true; }
          const a = list(n); const i = a.findIndex(function(x){ return same(x[kf], kv); }); if (i < 0) return false; a.splice(i, 1); return true; },
        append: function(n, row){ const db = V3DB.db;
          if (n === 'App Settings') { if (!db.appSettings) db.appSettings = {}; db.appSettings[row.key] = String(row.value); return true; }
          list(n).push(Object.assign({}, row)); return true; },
        appendLog: function(row){ list('Admin Log').push(Object.assign({}, row)); },
        logRows: function(){ return list('Admin Log').map(copy); },
        updateLog: function(id, patch){ return io.update('Admin Log', 'id', id, patch); },
        saveImage: function(name, d){ return { id: name, url: d, thumb: d }; } // demo: the shrunk image stays on the phone
      };
      return io;
    })(),
    CacheService: { getScriptCache: function(){ return { get: function(k){ const e = _v3DemoCache[k]; return e && e.until > Date.now() ? e.v : null; }, put: function(k, v, sec){ _v3DemoCache[k] = { v: String(v), until: Date.now() + (sec||600)*1000 }; }, remove: function(k){ delete _v3DemoCache[k]; } }; } }
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
  try {
    out = fn(srv, db);
  } finally { V3DB.db = null; }
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
  pu.roles = perms.filter(function(x){ return x !== 'staff'; }).map(function(x){ return x === 'kitchen' ? 'chef' : (x === 'boat' ? 'boat_manager' : x); });
  pu.roleButtons = v3Buttons({ permissions: perms, roles: pu.roles });
  pu.isSuper = perms.includes('super_admin');
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
  Object.keys(p).forEach(function(k){ if (k.charAt(0) === '_') delete p[k]; }); // never trust client "_" fields (same as the server)
  delete p.actorName;
  if (me && action !== 'login') await v3DemoRun(function(srv){ try { srv.mealTick(false); } catch (e) {} }); // same lazy tick as the server (cutoff approve + late auto-approve)
  const v3 = await v3DemoRun(function(srv){ const q = Object.assign({}, p, { requesterEmail: me || p.requesterEmail }); return srv.routeV3(action, q) || srv.routeRelease3(action, q); });
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
      if (r && r.success) {
        // same extra fields as the live server (v3UserOut + role counts for admins)
        const extra = await v3DemoRun(function(srv, d){
          const by = {}; d.users.forEach(function(u){ const o = srv.v3UserOut(Object.assign({}, u)); const roles = srv.userRoles(Object.assign({}, u)); by[u.email] = { warnings: o.warnings, roles: roles, roleButtons: srv.roleButtons(roles) }; });
          return { by: by, roleCounts: srv.v3RoleCounts(d.users.map(function(u){ return Object.assign({}, u); })) };
        });
        r.data.users = r.data.users.map(function(u){ return Object.assign({}, u, extra.by[u.email] || {}); });
        if (isAdm) r.data.roleCounts = extra.roleCounts;
      }
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
      if (!meU || !(v3ParsePerms(meU).includes('super_admin') || v3ParsePerms(meU).includes('admin'))) return { success:false, error:'Admin only' }; // 3.2.0: same as live deleteUser (admins too)
      { const sup = v3ParsePerms(meU).includes('super_admin'), code = String(p.passcode || ''); if (code !== (sup ? SUPER_PASS : ADMIN_PASS)) return { success:false, error: 'Enter the '+(sup ? 'superadmin' : 'admin')+' code to confirm this change', needsCode: true }; }
      const t = db.users.find(function(u){ return u.email === String(p.targetEmail||'').toLowerCase(); });
      if (!t) return { success:false, error:'User not found' };
      if (t.email === me) return { success:false, error:'You cannot delete yourself' };
      if (v3ParsePerms(t).includes('super_admin')) return { success:false, error:'Superadmin accounts cannot be deleted here' };
      db.users = db.users.filter(function(u){ return u !== t; }); saveDemo(db);
      return { success:true, data:{ deleted: t.email } };
    }
    case 'cancelBoatBooking': {
      const b = (db.boatBookings||[]).find(function(x){ return x.id === p.id; });
      if (!b) return { success:false, error:'Booking not found' };
      if (!v3HasBoat() && String(b.userEmail).toLowerCase() !== me) return { success:false, error:'You can only cancel your own booking' };
      return _v2DemoApiCore(action, p);
    }
    case 'addReminder': case 'completeReminder': case 'deleteReminder':
      if (!isAdm) return { success:false, error:'Only admin adds or changes reminders' };
      return _v2DemoApiCore(action, p);
    case 'register': {
      const r = await _v2DemoApiCore(action, p);
      if (r && r.success) r.data = Object.assign({}, r.data, { delivery: 'email' }); // 3.0.0: no department join approval
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
    r.data.mealTimes = await v3DemoRun(function(srv){ return srv.mealTimesOut(); });
    if (r.data.user) r.data.user = publicUser(loadDemo().users.find(function(x){ return x.email === me; }));
  } catch (e) { console.warn('demo v3 home', e); }
  return r;
};

/* demo seed for every 3.0 role (runs once per demo database) */
const V3_DEMO_SEED = 'v3seed-3';
/** seed-3: Kitchen / Boatman staff + a few Kitchen / Boat Admin samples. */
function v3SeedDemo3(db){
  const addU = function(u){ if (!db.users.some(function(x){ return x.email === u.email; })) db.users.push(Object.assign({ id: uid('usr'), password:'staff123', contact:'', roster:'', village:'Resort', active:true, verified:true, deptStatus:'approved', createdAt: formatFiji() }, u)); };
  addU({ email:'vikash.kitchen@paradisecoveresortfiji.com', firstName:'Vikash', lastName:'Chand', department:'Kitchen', role:'staff', permissions:'staff' });
  addU({ email:'mere.kitchen@paradisecoveresortfiji.com', firstName:'Mereani', lastName:'Rokosuka', department:'Kitchen', role:'staff', permissions:'staff' });
  addU({ email:'seru.boat@paradisecoveresortfiji.com', firstName:'Seru', lastName:'Nakau', department:'Boatman', role:'staff', permissions:'staff' });
  addU({ email:'tevita.boat@paradisecoveresortfiji.com', firstName:'Tevita', lastName:'Lomu', department:'Boatman', role:'staff', permissions:'staff' });
  addU({ email:'paradisecove679@gmail.com', firstName:'Test', lastName:'Test', department:'Maintenance', role:'chef', permissions:'staff,chef' });
  // an allergy note + an emergency travel request so the Kitchen / Boat Admin pages have something to show
  const tom = fijiDateString(addFijiDays(getFijiNow(),1));
  const d = (db.dinnerOrders||[]).find(function(o){ return String(o.serviceDate) === tom && o.status !== 'cancelled' && !o.specialNote; });
  if (d) { d.specialNote = 'Allergy: peanuts'; d.notes = 'Allergy: peanuts'; }
  db.emergencyTravel = (db.emergencyTravel||[]).concat([{ id: uid('em'), userEmail:'ana.tui@paradisecoveresortfiji.com', userName:'Ana Tui', department:'Housekeeping', reason:'Family emergency in Nadi', seats:1, preferredTime:'ASAP', status:'pending', reviewedBy:'', reviewNote:'', createdAt: formatFiji() }]);
}
/** seed-2: 3.0 review cases — HOD who is also captain, assistant HOD who is also captain, HOD in department "Other"; codes by email. */
function v3SeedDemo2(db){
  const addU = function(u){ if (!db.users.some(function(x){ return x.email === u.email; })) db.users.push(Object.assign({ id: uid('usr'), password:'staff123', contact:'', roster:'', village:'Resort', active:true, verified:true, createdAt: formatFiji() }, u)); };
  addU({ email:'hod.grounds@paradisecoveresortfiji.com', firstName:'Akuila', lastName:'Tavo', department:'Grounds', role:'hod', permissions:'staff,hod,boat_manager,boat_captain' });
  addU({ email:'asst.other@paradisecoveresortfiji.com', firstName:'Nani', lastName:'Tavu', department:'Other', role:'assistant_hod', permissions:'staff,assistant_hod,boat_manager,boat_captain' });
  addU({ email:'hod.other@paradisecoveresortfiji.com', firstName:'Pranil', lastName:'Rama', department:'Other', role:'hod', permissions:'staff,hod' });
  db.appSettings = db.appSettings || {};
  db.appSettings.verification_delivery = 'email';
}
function v3SeedDemo(db){
  if (db.v3Seed === V3_DEMO_SEED) return false;
  if (db.v3Seed === 'v3seed-1') { v3SeedDemo2(db); v3SeedDemo3(db); db.v3Seed = V3_DEMO_SEED; return true; }
  if (db.v3Seed === 'v3seed-2') { v3SeedDemo3(db); db.v3Seed = V3_DEMO_SEED; return true; }
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
  v3SeedDemo2(db);
  v3SeedDemo3(db);
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
  const mt = (d && (d.mealTimes || (d.v3 && d.v3.mealTimes))) || null;
  if (mt) { state.mealTimes = mt; try { localStorage.setItem('pcr_v3_mealtimes', JSON.stringify(mt)); } catch (e) {} }
  if (d) { state.rolesNeedSignIn = !!d.rolesNeedSignIn; state.heldRoles = d.heldRoles || null; }
  return _v2ApplyBootstrap(d);
};
try { const mt0 = JSON.parse(localStorage.getItem('pcr_v3_mealtimes') || 'null'); if (mt0 && mt0.times) state.mealTimes = mt0; } catch (e) {}
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

/* 3.0.0 session: role pages need the signed token from login. When it is missing / expired the server answers
 * sessionExpired or needsSignIn — the app then asks for the password again (the account itself stays signed in as staff). */
function onAuthProblem(json, action){
  if (json.sessionExpired) { saveToken(''); state.rolesNeedSignIn = true; }
  if (json.needsSignIn) state.rolesNeedSignIn = true;
  if (state._reauthOpen || state.demo) return;
  if (json.sessionExpired || (json.needsSignIn && state._roleMode)) setTimeout(v3AskReauth, 50);
}
function v3AskReauth(){
  if (state._reauthOpen || !state.user) return;
  state._reauthOpen = true;
  openModal('<div class="space-y-3 min-w-0" id="reauth-modal"><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-lock text-teal-400 mr-2"></i>Sign in again</h3>'+
    '<p class="text-xs text-slate-300">For your role pages (Kitchen, Boat, Department or Admin) please confirm your password. Normal staff pages keep working.</p>'+
    '<p class="text-[11px] text-slate-400 break-all">'+esc(state.user.email)+'</p>'+
    '<input id="reauth-pw" type="password" class="ui-input w-full" autocomplete="current-password" placeholder="Password"/>'+
    '<div class="flex gap-2"><button type="button" id="reauth-cancel" class="flex-1 rounded-xl py-2.5 text-sm border border-slate-600 text-slate-300">Later</button>'+
    '<button type="button" id="reauth-go" class="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold text-white">Sign in</button></div></div>');
  const done = function(){ state._reauthOpen = false; closeModal(); };
  $('#reauth-cancel').onclick = done;
  $('#reauth-go').onclick = async function(){
    const pw = $('#reauth-pw').value; if (!pw) { toast('Enter your password','error'); return; }
    this.disabled = true;
    let r = null; try { r = await api('login', { email: state.user.email, password: pw }); } catch (e) {}
    this.disabled = false;
    if (!r || !r.success) { toast((r && r.error) || 'Sign-in failed','error'); return; }
    saveToken(r.data.token || ''); state.user = Object.assign({}, state.user, r.data.user); saveSession();
    state.rolesNeedSignIn = false; done(); toast('Signed in — role pages unlocked','ok');
    cacheInvalidate(['v3home']); state.bootPending = loadBootstrap(); navigate(state.tab || 'more');
  };
}

/* ============ D. navigation ============ */
navItems = function(){
  if (v3IsSuper()) return [
    { id:'home', icon:'fa-gauge-high', label:'Dashboard' }, { id:'approvals', icon:'fa-inbox', label:'Approvals' },
    { id:'manage', icon:'fa-sliders', label:'Manage' }, { id:'more', icon:'fa-ellipsis', label:'More' }];
  return [{ id:'home', icon:'fa-house', label:'Home' }, { id:'meals', icon:'fa-utensils', label:'Meals' },
    { id:'boat', icon:'fa-ship', label:'Boat' }, { id:'more', icon:'fa-ellipsis', label:'More' }];
};
/* role pages (opened from More) and the tab they belong to */
const V3_ROLE_TABS = {
  kitchenadmin:'kitchen', kitchen:'kitchen', chefreq:'kitchen', chefmenu:'kitchen', chefcomments:'kitchen', mealtimes:'kitchen', mealstats:'kitchen', special:'kitchen', offmenu:'kitchen',
  boatadmin:'boat', boatruns:'boat', emergency:'boat',
  deptadmin:'dept', approvals:'dept', deptstaff:'dept', deptupdatespost:'dept', leavecal:'dept', leavesummary:'dept', mealbehalf:'dept',
  adminhub:'admin', usersv3:'admin', users:'admin', reminders:'admin', suggestions:'admin', adminstatus:'admin', settings:'admin', admin:'admin', manage:'admin', migrate:'admin',
  adminoverview:'admin', admintools:'admin', aboutimage:'admin' // 3.2.0
};
const V3_TAB_PARENT = { breakfast:'meals', lunch:'meals', dinner:'meals', myorders:'more', history:'more', leave:'more', profile:'more', notifications:'more', bookings:'more', deptupdates:'more', schedule:'more' };
renderNav = function(targetSel){
  const items = navItems(), ids = items.map(function(n){ return n.id; });
  let active = ids.includes(state.tab) ? state.tab : (V3_TAB_PARENT[state.tab] || (v3IsSuper() && V3_ROLE_TABS[state.tab] ? 'manage' : 'more'));
  if (state.tab === 'approvals' && ids.includes('approvals')) active = 'approvals';
  if (!ids.includes(active)) active = 'more';
  const el = $(targetSel || '#bottom-nav'); if (!el) return;
  const h = v3Home(), sd = h.superDash && h.superDash.pending;
  const badge = function(id){
    if (id === 'approvals' && sd) return (sd.leaveHod||0)+(sd.leaveMgmt||0)+(sd.late||0)+(sd.special||0);
    if (id === 'more') return state._v3Unread || 0;
    if (id === 'manage') return a32Owner() ? (state._a32RepNew || 0) : 0; // 3.1.0 new problem reports
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
  if (tab === 'adminlog') return a31CanArea(state.logArea || 'admin'); // 3.1.0 activity logs
  if (tab === 'superlog') return v3IsSuper();
  if (tab === 'reports') return a32Owner(); // 3.2.0: owner account only
  if (v3IsSuper() && A31_SUPER_NO_TABS[tab]) return false;
  const kind = V3_ROLE_TABS[tab];
  if (tab === 'approvals' && v3IsSuper()) return true;
  if (!kind) return true;
  if (kind === 'kitchen') return v3CanChef();
  if (kind === 'boat') return v3HasBoat();
  if (kind === 'dept') return v3CanDept();
  if (kind === 'admin') return (tab === 'settings' || tab === 'admin' || tab === 'migrate' || tab === 'aboutimage') ? v3IsSuper() : v3IsAdmin();
  return true;
};
roleLandingTab = function(){
  try { const h = (location.hash||'').replace(/^#/, ''); if (h && V3_TITLES[h] && canPrivilegedTab(h)) return h; } catch (e) {}
  return 'home';
};
const V3_TITLES = { home:'Home', meals:'Meals', boat:'Boat', more:'More', bookings:'My boat bookings', profile:'My profile', history:'My orders & history', leave:'My leave',
  notifications:'Notifications', deptstaff:'Department staff', deptupdates:'Department updates', chefreq:'Late & special requests', chefcomments:'Staff feedback',
  chefmenu:'Dinner menus', kitchen:'Kitchen lists & summaries', manage:'Manage', usersv3:'Users & roles', reminders:'Reminders', adminstatus:'Reports & downloads',
  leavecal:'Leave calendar', users:'Staff directory', settings:'App settings', admin:'Classic admin tools', suggestions:'Suggestions', approvals:'Approvals', special:'Special meal order', schedule:'My schedule',
  kitchenadmin:'Kitchen Admin', boatadmin:'Boat Admin', deptadmin:'Department Admin', adminhub:'Admin Settings', mealtimes:'Meal times', mealstats:'Meal statistics', offmenu:'Orders not on the menu',
  boatruns:'Boat runs (admin)', emergency:'Emergency travel', leavesummary:'Leave summary', mealbehalf:'Meal on behalf', migrate:'Role migration', deptupdatespost:'Department updates',
  adminlog:'Activity log', superlog:'Superadmin log', reports:'Reports', myreports:'My reports', pushsettings:'Phone notifications', adminoverview:'Overview', admintools:'System tools', aboutimage:'About image' };
navigate = function(tab){
  if (tab === 'myorders') tab = 'history';
  if (tab === 'breakfast' || tab === 'lunch' || tab === 'dinner') { state.mealFocus = tab; tab = 'meals'; }
  if (tab === 'chef') tab = 'kitchenadmin';
  if (tab === 'stboat') tab = 'boatadmin';
  if (v3IsSuper() && A31_SUPER_NO_TABS[tab]) { toast(A31_SUPER_TOAST,'error'); tab = 'home'; } // 3.1.0: superadmin = admin-only account
  if (!canPrivilegedTab(tab)) { toast('That area is not part of your role','error'); tab = 'home'; }
  if (tab === 'schedule' && !featureOn('feature_my_schedule')) { toast('My Schedule is off for now.','error'); tab = 'more'; }
  if (state._v3Timer) { clearInterval(state._v3Timer); state._v3Timer = null; }
  if (state._homeRemTimer) { clearInterval(state._homeRemTimer); state._homeRemTimer = null; }
  state.tab = tab;
  state._roleMode = V3_ROLE_TABS[tab] || '';
  if (tab === 'approvals' && !v3IsSuper()) state._roleMode = 'dept';
  if (tab === 'adminlog') state._roleMode = state.logArea || 'admin';
  const ht = $('#header-title'); if (ht) ht.textContent = V3_TITLES[tab] || tab;
  const sticky = $('#app-sticky'); if (sticky) sticky.classList.remove('hidden');
  const map = {
    home: renderHome, meals: renderMeals, boat: renderBoat, more: renderMore, bookings: renderMyBookings, profile: renderMyProfile, schedule: renderSchedule,
    history: v3RenderHistory, leave: v3RenderLeave, notifications: v3RenderNotifications, deptstaff: v3RenderDeptStaff, deptupdates: v3RenderDeptUpdates, deptupdatespost: v3RenderDeptUpdates,
    chefreq: v3RenderChefRequests, chefcomments: v3RenderChefComments, chefmenu: v3RenderMenuEditor,
    kitchen: renderKitchen, manage: v3RenderManage, usersv3: v3RenderUsers, users: renderUsers, reminders: v3RenderReminders, adminstatus: v3RenderAdminStatus, leavecal: v3RenderLeaveCalendar,
    settings: v3RenderSettings, admin: renderAdmin, suggestions: renderSuggestions, approvals: v3RenderApprovals, special: v3RenderSpecialPage,
    kitchenadmin: v3RenderKitchenAdmin, boatadmin: v3RenderBoatAdmin, deptadmin: v3RenderDeptAdmin, adminhub: v3RenderAdminHub, mealtimes: v3RenderMealTimes,
    mealstats: v3RenderMealStats, offmenu: v3RenderOffMenu, boatruns: v3RenderBoatRuns, emergency: v3RenderEmergency, leavesummary: v3RenderLeaveSummary, mealbehalf: v3RenderMealBehalf, migrate: v3RenderMigrate,
    adminlog: a31RenderLog, superlog: a31RenderSuperLog, reports: a32RenderReports, myreports: a32RenderMyReports, pushsettings: a33RenderSettings,
    adminoverview: a34RenderOverview, admintools: a34RenderTools, aboutimage: a34RenderAboutImage
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
  v3PollNotifications();
  a32AfterNav(tab); // 3.1.0: page guide "?" + first-time guide, report badge
};
/** Unread notifications badge on More (at most one check a minute, never blocks a screen). */
function v3PollNotifications(){
  if (!state.user || state.tab === 'more' || state.tab === 'notifications') return;
  if (state._v3UnreadAt && Date.now() - state._v3UnreadAt < 60000) return;
  state._v3UnreadAt = Date.now();
  setTimeout(function(){
    api('getMyNotifications', {}).then(function(res){ if (res && res.success) { const n = res.data.unreadCount || 0; if (n !== state._v3Unread) { state._v3Unread = n; renderNav('#bottom-nav'); } } }).catch(function(){});
  }, 1500);
}
/** Role-page header: back to the role dashboard. */
function v3RoleBack(kind){
  const b = V3_BUTTONS[kind]; if (!b) return v3Back('more','More');
  return v3Back(b.tab, b.label);
}

/* ============ E. Home ============ */
/** Countdown target for TOMORROW's meal: the cutoff (Kitchen Admin meal times), then the late-request window, else null (closed). */
function v3CutoffTarget(meal){
  const info = v3Info(meal), now = getFijiNow().getTime();
  if (now < info.cutoffAt) return { t: new Date(info.cutoffAt), label: 'closes '+mtLabel(info.cutoff) };
  if (now < info.lateCloseAt) return { t: new Date(info.lateCloseAt), label: 'late request until '+mtLabel(info.lateClose), late: true };
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
    if (left <= 0) { el.textContent = 'Orders closed'; el.classList.add('text-amber-300'); if (!state._v3ClosedRepaint) { state._v3ClosedRepaint = setTimeout(function(){ state._v3ClosedRepaint = null; if (['home','meals'].includes(state.tab) && !v3HomeTyping()) navigate(state.tab); }, 1500); } }
    else el.textContent = v3Countdown(left);
  });
  const ck = $('#v3-clock'); if (ck) ck.textContent = formatFiji();
  if (!state._v3BannerAt || Date.now() - state._v3BannerAt > 20000) { state._v3BannerAt = Date.now(); try { v3RefreshCutoffBanner(); } catch (e) {} }
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
/** 39: meals that close within the next hour and that I have not ordered (client clock, plus the server's list from getV3Home). */
function v3CutoffReminderList(){
  const tom = fijiDateString(addFijiDays(getFijiNow(),1)), now = getFijiNow().getTime(), out = [];
  V3_MEALS.forEach(function(m){
    const cd = v3CutoffTarget(m); if (!cd || cd.late) return;
    const left = cd.t.getTime() - now; if (left <= 0 || left > 60*60000) return;
    const o = v3MyMeal(m, tom); if (o && !isInactiveMealStatus(o.status)) return;
    out.push({ meal: m, t: cd.t.getTime(), label: cd.label });
  });
  if (!out.length) (v3Home().cutoffReminders || []).forEach(function(r){
    const cd = v3CutoffTarget(r.meal); const o = v3MyMeal(r.meal, tom);
    if (cd && !cd.late && cd.t.getTime() > now && !(o && !isInactiveMealStatus(o.status))) out.push({ meal: r.meal, t: cd.t.getTime(), label: cd.label });
  });
  return out;
}
function v3CutoffBanner(){
  const list = v3CutoffReminderList();
  if (!list.length) return '<div id="v3-cutoff-banner" class="hidden"></div>';
  return '<button type="button" id="v3-cutoff-banner" onclick="navigate(\''+list[0].meal+'\')" class="w-full text-left rounded-2xl border border-amber-400/60 bg-amber-500/15 p-3 text-xs text-amber-100 min-w-0" data-meals="'+list.map(function(x){ return x.meal; }).join(',')+'">'+
    '<i class="fa-solid fa-bell mr-1 text-amber-300"></i><strong>Order soon:</strong> '+list.map(function(x){ return esc(V3_MEAL_LABEL[x.meal])+' for tomorrow closes in <span data-cd="'+x.t+'" class="v3-countdown font-semibold">'+v3Countdown(x.t-getFijiNow().getTime())+'</span>'; }).join(' · ')+
    ' — you have not ordered yet. <span class="underline">Order now</span></button>';
}
function v3RefreshCutoffBanner(){
  const el = $('#v3-cutoff-banner'); if (!el) return;
  const want = v3CutoffReminderList().map(function(x){ return x.meal; }).join(',');
  if ((el.getAttribute('data-meals') || '') !== want) { el.outerHTML = v3CutoffBanner(); if (state.tab === 'home') { const g = $('#home-meal-grid'); if (g) { const n = $('#home-myorders'); if (n) n.outerHTML = v3OrdersGrid(); } } }
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
  const soon = v3CutoffReminderList().map(function(x){ return x.meal; });
  const cards = V3_MEALS.map(function(m){
    const o = v3MyMeal(m, tom), cd = v3CutoffTarget(m);
    if (!cd) anyClosed = true;
    const open = !!cd && !cd.late, hl = soon.indexOf(m) >= 0;
    return '<button type="button" id="home-card-'+m+'" onclick="navigate(\''+m+'\')" class="meal-card-btn glass rounded-xl p-2.5 text-left min-w-0 '+(hl?'border-2 border-amber-400 v3-cutoff-soon':(open?'meal-open-glow border-teal-600/40':''))+'"'+(hl?' data-cutoff-soon="1"':'')+'>'+
      '<p class="text-[10px] uppercase tracking-wide text-slate-400"><i class="fa-solid '+V3_MEAL_ICON[m]+' mr-1"></i>'+V3_MEAL_LABEL[m]+'</p>'+
      '<p class="text-[11px] mt-1 min-w-0 truncate">'+(o ? (m==='dinner'&&o.mealChoice&&!isInactiveMealStatus(o.status) ? '<span class="font-medium text-slate-100">'+esc(o.mealChoice)+'</span>' : '') : '')+'</p>'+
      '<p class="mt-0.5">'+(o ? v3Status(o.status) : '<span class="text-[11px] text-slate-400">Not ordered</span>')+'</p>'+
      '<p class="text-[10px] mt-1 '+(cd?(cd.late?'text-orange-300':'text-teal-300'):'text-amber-300')+'">'+(cd ? '<span data-cd="'+cd.t.getTime()+'" class="v3-countdown">'+v3Countdown(cd.t.getTime()-getFijiNow().getTime())+'</span><br><span class="text-slate-500">'+cd.label+'</span>' : 'Orders closed')+'</p></button>';
  }).join('');
  return '<section class="space-y-2 min-w-0" id="home-myorders">'+v3Title('fa-receipt','My orders · tomorrow '+esc(v3DateLabel(tom)==='Tomorrow'?WEEKDAY_NAMES[addFijiDays(getFijiNow(),1).getUTCDay()]:tom))+
    '<div class="grid grid-cols-3 gap-2" id="home-meal-grid">'+cards+'</div>'+
    (anyClosed ? '<p class="text-[11px] text-amber-200/90 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2" id="home-books-closed"><i class="fa-solid fa-lock mr-1"></i>Orders closed for some meals — use a Late Meal Request on the Meals page while the late window is open.</p>' : '')+
    '</section>';
}
function v3DoThisNow(){
  const tiles = v3Tile(v3Nav('meals'),'fa-utensils','Meals','Order, change, late request') + v3Tile(v3Nav('boat'),'fa-ship','Book a boat','Village runs') +
    v3Tile("v3OpenLeaveForm()",'fa-plane-departure','Request leave','Day off, annual, sick') + v3Tile(v3Nav('history'),'fa-list-check','My orders','Meals, boats, leave');
  return '<section class="space-y-2 min-w-0" id="home-dothisnow">'+v3Title('fa-bolt','Do this now')+'<div class="grid grid-cols-2 gap-2">'+tiles+'</div></section>';
}
function v3HodBar(){
  const hb = v3Home().hodBar; if (!hb) return '';
  const cell = function(tab, n, label, icon){ return '<button type="button" onclick="navigate(\''+tab+'\')" class="rounded-xl p-2.5 text-left border min-w-0 '+(n?'border-amber-400/40 bg-amber-500/10':'border-slate-700/70 bg-slate-900/40')+'">'+
    '<p class="text-xl font-semibold '+(n?'text-amber-200':'text-slate-300')+'">'+n+'</p><p class="text-[10px] text-slate-400 leading-tight"><i class="fa-solid '+icon+' mr-1"></i>'+label+'</p></button>'; };
  const cells = cell('approvals', hb.leave||0, 'Leave to review', 'fa-plane-departure') + cell('approvals', hb.late||0, 'Late meals', 'fa-clock') + cell('leavecal', hb.onLeaveToday||0, 'On leave today', 'fa-calendar-days') +
    (v3IsAdmin() ? cell('approvals', hb.leaveMgmt||0, 'Final approval', 'fa-stamp') : '');
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
  return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="v3-chefdash">'+v3Title('fa-fire-burner','Today & tomorrow')+
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
/** Role pages need the signed session: shown when the server says the token is missing / expired. */
function v3SignInBanner(){
  if (!state.rolesNeedSignIn || !v3Buttons().length || state.demo) return '';
  return '<div class="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-100 min-w-0 flex items-center gap-2" id="v3-signin-banner"><i class="fa-solid fa-lock"></i><span class="flex-1 min-w-0">Sign in again to open your role pages ('+esc(v3Buttons().map(function(b){ return V3_BUTTONS[b].label; }).join(', '))+').</span>'+
    '<button type="button" onclick="v3AskReauth()" class="shrink-0 rounded-lg px-3 py-1.5 border border-sky-400/50 text-sky-100">Sign in</button></div>';
}
function v3DeptBanner(){ return ''; }
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
    v3GreetingCard() + v3CutoffBanner() + v3SignInBanner() + queueHostHtml('*') +
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
  const tabs = v3IsSuper() ? [] : [{ id:'mine', label:'My leave' }]; // 3.1.0: superadmin never applies for leave
  if (v3CanDept()) tabs.push({ id:'dept', label: v3IsAdmin() ? 'HOD step' : 'Department' });
  if (v3IsAdmin()) tabs.push({ id:'final', label:'Final approval' });
  let cur = state.leaveTab && tabs.some(function(t){ return t.id === state.leaveTab; }) ? state.leaveTab : (v3IsAdmin() ? 'final' : (v3CanDept() ? 'dept' : 'mine'));
  if (state.leaveTabForce) { cur = state.leaveTabForce; state.leaveTabForce = null; }
  state.leaveTab = cur;
  $('#main-content').innerHTML = v3Page(v3Back('more','More') +
    (tabs.length > 1 ? '<div class="grid gap-1 rounded-xl bg-slate-900/60 p-1" style="grid-template-columns:repeat('+tabs.length+',1fr)">'+tabs.map(function(t){ return '<button type="button" class="v3-seg rounded-lg py-2 text-xs '+(t.id===cur?'bg-teal-600 text-white font-semibold':'text-slate-300')+'" data-t="'+t.id+'">'+t.label+'</button>'; }).join('')+'</div>' : '')+
    (cur === 'mine' ? '<button type="button" id="lv-new" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white"><i class="fa-solid fa-plus mr-1"></i>New leave request</button>' : '<button type="button" onclick="navigate(\'leavecal\')" class="w-full rounded-xl py-2.5 text-sm border border-teal-500/40 text-teal-200"><i class="fa-solid fa-calendar-days mr-1"></i>Leave calendar</button>')+
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

/** 38: leave calendar — HOD / assistant HOD see their department, admin / superadmin see everyone (or one department). */
async function v3RenderLeaveCalendar(){
  const now = getFijiNow();
  const month = state.lcMonth || fijiDateString(now).slice(0,7);
  state.lcMonth = month;
  const y = +month.slice(0,4), m = +month.slice(5,7);
  const shift = function(k){ const d = new Date(Date.UTC(y, m-1+k, 1)); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0'); };
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  $('#main-content').innerHTML = v3Page(v3Back(v3IsAdmin()?'manage':'more', v3IsAdmin()?'Manage':'More') +
    '<section class="glass rounded-2xl p-3 space-y-3 min-w-0" id="leavecal-root"><div class="v3-row"><button type="button" id="lc-prev" class="rounded-lg px-3 py-2 border border-slate-600 text-slate-200" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>'+
    '<h3 class="text-sm font-semibold text-slate-100" id="lc-title">'+MN[m-1]+' '+y+'</h3><button type="button" id="lc-next" class="rounded-lg px-3 py-2 border border-slate-600 text-slate-200" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button></div>'+
    '<div id="lc-dept"></div><div id="lc-grid">'+v3Loading()+'</div>'+
    '<div class="flex gap-3 text-[10px] text-slate-400"><span><span class="inline-block w-2 h-2 rounded-full bg-teal-400 mr-1"></span>Approved</span><span><span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>Waiting (HOD or management)</span></div></section>'+
    '<div id="lc-list" class="space-y-2"></div>', 'leavecal');
  $('#lc-prev').onclick = function(){ state.lcMonth = shift(-1); v3RenderLeaveCalendar(); };
  $('#lc-next').onclick = function(){ state.lcMonth = shift(1); v3RenderLeaveCalendar(); };
  const d = await v3Call('getLeaveCalendar', { month: month, department: state.lcDept || '' });
  if (state.tab !== 'leavecal' || !d) return;
  if (d.allDepartments) {
    $('#lc-dept').innerHTML = '<select id="lc-dsel" class="ui-input w-full"><option value="">All departments</option>'+(d.departments||[]).map(function(x){ return '<option'+(x===(state.lcDept||'')?' selected':'')+'>'+esc(x)+'</option>'; }).join('')+'</select>';
    $('#lc-dsel').onchange = function(){ state.lcDept = this.value; v3RenderLeaveCalendar(); };
  } else $('#lc-dept').innerHTML = '<p class="text-[11px] text-slate-400">Department: '+esc(d.department||'')+'</p>';
  const rows = d.leave || [];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), startWd = new Date(Date.UTC(y, m-1, 1)).getUTCDay();
  const today = fijiDateString();
  const on = function(ds){ return rows.filter(function(l){ return l.startDate <= ds && l.endDate >= ds; }); };
  let cells = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(w){ return '<div class="text-[10px] text-slate-500 text-center">'+w+'</div>'; }).join('');
  for (let i = 0; i < startWd; i++) cells += '<div></div>';
  for (let dd = 1; dd <= days; dd++) {
    const ds = month+'-'+String(dd).padStart(2,'0'), list = on(ds);
    const ap = list.filter(function(l){ return l.status === 'approved'; }).length, pe = list.length - ap;
    cells += '<button type="button" class="lc-day rounded-lg border p-1 min-h-[44px] text-left min-w-0 '+(ds===today?'border-teal-400':'border-slate-700/60')+(list.length?' bg-slate-800/70':'')+'" data-ds="'+ds+'">'+
      '<span class="block text-[11px] text-slate-200">'+dd+'</span><span class="flex gap-0.5 flex-wrap">'+(ap?'<span class="text-[9px] rounded bg-teal-500/30 text-teal-100 px-1">'+ap+'</span>':'')+(pe?'<span class="text-[9px] rounded bg-amber-500/30 text-amber-100 px-1">'+pe+'</span>':'')+'</span></button>';
  }
  $('#lc-grid').innerHTML = '<div class="grid grid-cols-7 gap-1">'+cells+'</div>';
  const listHtml = function(list, title){
    return v3Card(v3Title('fa-list', title, v3Chip(String(list.length), list.length?'info':'mute'))+(list.length ? list.map(function(l){
      return '<div class="v3-row py-1.5 border-b border-slate-700/40 last:border-0 text-xs min-w-0"><div class="min-w-0"><p class="text-slate-100 truncate">'+esc(l.userName)+' <span class="text-slate-400">· '+esc(l.department)+'</span></p><p class="text-[11px] text-slate-400">'+esc(l.leaveType||'')+' · '+esc(v3DateLabel(l.startDate))+(l.endDate!==l.startDate?' → '+esc(v3DateLabel(l.endDate)):'')+'</p></div>'+v3Status(l.status)+'</div>';
    }).join('') : v3Empty('No approved or waiting leave.')));
  };
  $('#lc-list').innerHTML = listHtml(rows, 'This month');
  $$('.lc-day').forEach(function(b){ b.onclick = function(){ $('#lc-list').innerHTML = listHtml(on(b.dataset.ds), v3DateLabel(b.dataset.ds)) + '<button type="button" id="lc-all" class="text-xs text-teal-300">Show the whole month</button>'; $('#lc-all').onclick = function(){ $('#lc-list').innerHTML = listHtml(rows, 'This month'); }; }; });
}

/* ============ G. Meals (one page: my status, dinner, lunch, breakfast, feedback) ============ */
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
/** Dinner menu for one dinner date (weekday of THAT date only). Default: tomorrow. */
async function v3FetchMenu(force, date){
  const sd = date || dinnerCutoffInfo().serviceDate, key = 'dinnerMenus:'+sd;
  if (!force && cacheGet(key)) return cachePeek(key);
  const m = await api('getDinnerMenus', { serviceDate: sd, includePreviousDay:false });
  const pack = (m && m.data) || {};
  cacheSet(key, pack);
  return pack;
}
function v3MenuItems(pack, date){
  pack = pack || cachePeek('dinnerMenus:'+(date || dinnerCutoffInfo().serviceDate)) || {};
  const items = Array.isArray(pack) ? pack : (pack.serviceItems || pack.items || []);
  return items.map(function(it){ return String(it.itemName || it.name || ''); }).filter(Boolean);
}
function v3DayDate(d){ const p = String(d).slice(0,10).split('-'); const dt = new Date(Date.UTC(+p[0], +p[1]-1, +p[2])); return WEEKDAY_NAMES[dt.getUTCDay()].slice(0,3)+' '+(+p[2])+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1]; }
function v3Today(){ return fijiDateString(); }
function v3Tom(){ return fijiDateString(addFijiDays(getFijiNow(),1)); }
function v3PhaseOf(meal, date){ return mealPhaseC(meal, date); }
function v3MealRowsFor(meal, date){
  if (date === v3Info(meal).serviceDate) { const c = v3MealRows(meal); if (Array.isArray(c)) return c.map(function(o){ return Object.assign({ meal: meal }, o); }); }
  return (v3Home().myMeals || []).filter(function(o){ return o.meal === meal && String(o.serviceDate).slice(0,10) === date; });
}
function v3CurOrder(meal, date){ const rows = v3MealRowsFor(meal, date).filter(function(o){ return !isInactiveMealStatus(o.status); }); return rows[rows.length-1] || null; }

/* Section 1: my meal dashboard */
function v3MealDash(){
  const today = v3Today(), tom = v3Tom(), n = getFijiNow();
  const cell = function(meal, date){
    const o = v3CurOrder(meal, date), ph = v3PhaseOf(meal, date);
    return '<div class="text-[11px] min-w-0">'+(o ? (meal === 'dinner' && o.mealChoice ? '<span class="block truncate text-slate-100">'+esc(o.mealChoice)+'</span>' : '')+v3Status(o.status)
      : (ph === 'open' ? '<span class="text-teal-300">Open</span>' : (ph === 'late' ? '<span class="text-orange-300">Late request</span>' : '<span class="text-slate-500">Not ordered</span>')))+'</div>';
  };
  const row = function(meal){
    const cd = v3CutoffTarget(meal);
    return '<div class="grid grid-cols-[5.5rem_1fr_1fr] gap-2 items-start py-1.5 border-b border-slate-700/40 last:border-0"><span class="text-xs text-slate-300"><i class="fa-solid '+V3_MEAL_ICON[meal]+' text-teal-400 mr-1"></i>'+V3_MEAL_LABEL[meal]+'</span>'+cell(meal, today)+
      '<div class="min-w-0">'+cell(meal, tom)+'<p class="text-[10px] '+(cd?(cd.late?'text-orange-300':'text-teal-300'):'text-amber-300')+'">'+(cd?'<span data-cd="'+cd.t.getTime()+'" class="v3-countdown">'+v3Countdown(cd.t.getTime()-n.getTime())+'</span> · '+esc(cd.label):'Orders closed')+'</p></div></div>';
  };
  // next meal served
  const h = n.getUTCHours(), nextMeal = h < 9 ? ['breakfast', today] : (h < 14 ? ['lunch', today] : (h < 21 ? ['dinner', today] : ['breakfast', tom]));
  const no = v3CurOrder(nextMeal[0], nextMeal[1]);
  const menu = v3MenuItems(null, tom);
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="meal-dash">'+v3Title('fa-gauge','My meals')+
    '<div class="grid grid-cols-[5.5rem_1fr_1fr] gap-2 text-[10px] uppercase tracking-wide text-slate-500"><span></span><span>Today</span><span>Tomorrow</span></div>'+
    V3_MEALS.map(row).join('')+
    '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2.5 text-xs space-y-1" id="meal-next"><p><span class="text-slate-400">Next meal:</span> <strong class="text-slate-100">'+V3_MEAL_LABEL[nextMeal[0]]+' · '+esc(v3DateLabel(nextMeal[1]))+'</strong> '+(no ? v3Status(no.status) : '<span class="text-slate-500">not ordered</span>')+'</p>'+
    '<p><span class="text-slate-400">Tomorrow\'s dinner menu:</span> <span class="text-slate-200">'+(menu.length ? menu.map(esc).join(' · ') : '—')+'</span></p></div></section>';
}

/* late request form (inline) — meal + date fixed */
function v3LateForm(meal, date){
  const id = meal+'-'+date;
  const items = meal === 'dinner' ? v3MenuItems(null, date) : [];
  const lateClose = mealWindowC(meal, date).lateCloseAt;
  return '<div class="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 space-y-2" data-late="'+id+'">'+
    '<p class="text-xs text-orange-200"><i class="fa-solid fa-clock mr-1"></i>Late Meal Request · '+V3_MEAL_LABEL[meal]+' '+esc(v3DateLabel(date))+'. Open until <strong>'+esc(mtLabel(mealTimesNow()['late_close_'+meal]))+'</strong> (<span data-cd="'+lateClose+'" class="v3-countdown">'+v3Countdown(lateClose-getFijiNow().getTime())+'</span>) — then it is approved automatically.</p>'+
    (meal === 'dinner' ? '<label class="text-[10px] text-slate-400" for="late-dish-'+id+'">Dish ('+esc(v3DateLabel(date))+'\'s menu)</label>'+(items.length ? '<select id="late-dish-'+id+'" class="ui-input w-full">'+items.map(function(x){ return '<option>'+esc(x)+'</option>'; }).join('')+'</select>' : '<input id="late-dish-'+id+'" class="ui-input w-full" maxlength="80" value="Standard"/>') : '')+
    '<label class="text-[10px] text-slate-400" for="late-reason-'+id+'">Reason *</label><input id="late-reason-'+id+'" class="ui-input w-full" maxlength="300" placeholder="e.g. came back on the late boat"/>'+
    mealNoteInputHtml('late-note-'+id,'')+
    '<button type="button" class="v3-late-send btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white" data-meal="'+meal+'" data-date="'+date+'">Send Late Meal Request</button></div>';
}
function v3OrderLine(o, meal){
  return '<div class="v3-row text-xs"><span class="text-slate-300 min-w-0 truncate">'+(meal==='dinner'?'Your dinner: <strong class="text-slate-100">'+esc(o.mealChoice)+'</strong>':'You are counted in')+'</span>'+v3Status(o.status)+'</div>'+myNoteLine(o)+
    (o.status === 'late_pending' ? '<p class="text-[10px] text-orange-200">Approved automatically at '+esc(mtLabel(mealTimesNow()['late_close_'+meal]))+'.</p>' : '');
}
function v3MealCard(meal){
  const info = v3Info(meal), tom = info.serviceDate, today = v3Today(), rows = v3MealRows(meal) || [];
  const cur = v3CurOrder(meal, tom);
  const used = rows.filter(function(o){ return o.status === 'cancelled' && o.orderType !== 'special'; }).length;
  const blocked = meal !== 'dinner' && used >= 3 && !cur;
  const idp = meal === 'breakfast' ? 'bf' : (meal === 'lunch' ? 'lu' : 'dinner');
  const noteId = meal === 'dinner' ? 'dinner-notes' : idp+'-note';
  const ph = v3PhaseOf(meal, tom);
  let tonight = '';
  if (meal === 'dinner') {
    const t = v3CurOrder('dinner', today), tph = v3PhaseOf('dinner', today);
    tonight = '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-3 space-y-2" id="dinner-tonight"><p class="v3-section-title">Tonight · '+esc(v3DayDate(today))+'</p>'+
      (t ? v3OrderLine(t, 'dinner') : (tph === 'late' ? v3LateForm('dinner', today) : '<p class="text-xs text-slate-400">No dinner ordered for tonight. '+(tph === 'closed' ? 'Late requests closed at '+esc(mtLabel(mealTimesNow().late_close_dinner))+' — please see the chef.' : '')+'</p>'))+'</div>';
  }
  let body = '';
  if (blocked) {
    body = '<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100" id="'+idp+'-blocked"><i class="fa-solid fa-ban mr-1"></i>You cancelled '+V3_MEAL_LABEL[meal].toLowerCase()+' for '+esc(v3DateLabel(tom))+' 3 times, so it is locked. Contact your HOD or chef if you still need it.</div>';
  } else if (ph === 'open') {
    if (meal === 'dinner') {
      const items = v3MenuItems(null, tom);
      // only tomorrow's menu (the phone's "last dish" is never injected — 3.0.0 menu-day fix)
      const opts = (items.length ? items : ['Standard']).map(function(n){ return '<option'+(cur && String(cur.mealChoice).trim().toLowerCase() === n.trim().toLowerCase() ? ' selected' : '')+'>'+esc(n)+'</option>'; }).join('');
      body = (cur ? v3OrderLine(cur, 'dinner') : '')+'<label class="text-[10px] text-slate-400" for="dinner-choice">Choose from '+esc(v3DateLabel(tom))+'\'s menu ('+esc(WEEKDAY_NAMES[addFijiDays(getFijiNow(),1).getUTCDay()])+')</label><select id="dinner-choice" class="ui-input w-full">'+opts+'</select>'+
        mealNoteInputHtml('dinner-notes', cur ? kitchenNoteOf(cur) : '')+
        '<button id="btn-dinner" class="btn-primary w-full rounded-xl py-3 text-base font-semibold text-white min-h-[48px]">'+(cur?'Change dinner':'Order dinner')+'</button>'+
        (cur ? '<button id="btn-dinner-cancel" class="w-full rounded-xl py-2 text-xs text-amber-300 border border-amber-500/30">Cancel dinner</button>' : '');
    } else {
      body = (cur ? v3OrderLine(cur, meal) : '') + mealNoteInputHtml(noteId, cur ? kitchenNoteOf(cur) : '')+
        '<button id="btn-'+meal+'" class="btn-primary w-full rounded-xl py-3 text-base font-semibold text-white min-h-[48px]">'+(cur?'Update note':'Count me in')+'</button>'+
        (cur ? '<button id="btn-'+meal+'-cancel" class="w-full rounded-xl py-2 text-xs text-amber-300 border border-amber-500/30">Cancel ('+used+' of 3 cancels used)</button>' : (used ? '<p class="text-[10px] text-slate-400">'+used+' of 3 cancels used for this date.</p>' : ''));
    }
  } else {
    body = (cur ? v3OrderLine(cur, meal) + (cur.status === 'late_pending' ? '<button id="btn-'+meal+'-cancel" class="w-full rounded-xl py-2 text-xs text-amber-300 border border-amber-500/30">Withdraw late request</button>' : '') : '')+
      '<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200" id="'+meal+'-closed"><i class="fa-solid fa-lock mr-1"></i>Orders closed ('+esc(mtLabel(info.cutoff))+').'+(cur ? '' : (ph === 'late' ? ' You can still send a Late Meal Request.' : ' Late requests closed — please see the chef.'))+'</div>'+
      (!cur && ph === 'late' ? (state._lateOpen === meal ? v3LateForm(meal, tom) : '<button type="button" class="v3-late-open w-full rounded-xl py-2.5 text-sm border border-orange-500/40 text-orange-200" data-meal="'+meal+'" id="btn-'+meal+'-late"><i class="fa-solid fa-clock mr-1"></i>Late Meal Request</button>') : '');
  }
  const cd = v3CutoffTarget(meal);
  const rule = meal === 'dinner' ? 'Order, change or cancel until '+mtLabel(info.cutoff)+' the day before · late requests until '+mtLabel(info.lateClose)+' on the day.'
    : 'Order until '+mtLabel(info.cutoff)+' the day before · late requests until '+mtLabel(info.lateClose)+'.';
  return '<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="meal-card-'+meal+'">'+
    '<div class="v3-row"><h3 class="font-semibold text-slate-100"><i class="fa-solid '+V3_MEAL_ICON[meal]+' text-teal-400 mr-2"></i>'+V3_MEAL_LABEL[meal]+'</h3>'+
    '<span class="text-[10px] '+(cd?(cd.late?'text-orange-300':'text-teal-300'):'text-amber-300')+'">'+(cd?'<span data-cd="'+cd.t.getTime()+'" class="v3-countdown">'+v3Countdown(cd.t.getTime()-getFijiNow().getTime())+'</span> left':'Orders closed')+'</span></div>'+
    '<p class="text-[10px] text-slate-400">'+esc(rule)+'</p>'+tonight+
    (meal === 'dinner' ? '<p class="v3-section-title pt-1">Tomorrow · '+esc(v3DayDate(tom))+'</p>' : '<p class="text-[11px] text-slate-300">For tomorrow · '+esc(v3DayDate(tom))+'</p>')+body+'</section>';
}
function v3AskCancelReason(meal, onReason){
  v3Form('Cancel '+V3_MEAL_LABEL[meal].toLowerCase(), [
    { id:'why', label:'Reason', type:'select', options:['Going to the mainland','Working through the meal','Not hungry / eating elsewhere','Ordered by mistake','Other'], value:'Going to the mainland' },
    { id:'more', label:'Details (optional)', type:'text', max:150 }
  ], 'Cancel order', async function(v){ return onReason((v.why + (v.more ? ' — ' + v.more : '')).slice(0,200)); },
  meal === 'dinner' ? 'Dinner can be changed or cancelled until '+esc(dinnerCutLabel())+' the day before.' : 'You can cancel and re-order up to 3 times for the same day. After the 3rd cancel this meal is locked.');
}
async function v3AfterMealChange(meal){
  cacheInvalidate([meal+'Orders:'+v3Info(meal).serviceDate, 'kitchenDashboard', 'v3home', 'myOrders']);
  try { await v3FetchMeal(meal, true); } catch (e) {}
  v3RefreshHome().then(function(){ if (state.tab === 'meals') v3PaintMeals(); });
  if (state.tab === 'meals') v3PaintMeals();
}
/* order completed overlay (CSS only, respects reduced motion) */
function v3OrderOverlay(status, line){
  if (!document.getElementById('v3-ov-style')) {
    const st = document.createElement('style'); st.id = 'v3-ov-style';
    st.textContent = '.v3-ov{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.55);animation:v3ovf .25s ease-out}'+
      '.v3-ov-card{max-width:20rem;margin:1rem;padding:1.4rem 1.2rem;border-radius:1.25rem;background:#0f172a;border:1px solid rgba(45,212,191,.45);text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5);animation:v3ovp .35s cubic-bezier(.2,.9,.3,1.3)}'+
      '.v3-ov-tick{width:64px;height:64px;margin:0 auto .6rem;border-radius:9999px;background:rgba(20,184,166,.18);display:flex;align-items:center;justify-content:center;font-size:30px;color:#2dd4bf;animation:v3ovt .6s ease-out .1s both}'+
      '@keyframes v3ovf{from{opacity:0}to{opacity:1}}@keyframes v3ovp{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}@keyframes v3ovt{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}'+
      '@media (prefers-reduced-motion: reduce){.v3-ov,.v3-ov-card,.v3-ov-tick{animation:none!important}}';
    document.head.appendChild(st);
  }
  const pending = /pending/.test(String(status||''));
  const old = document.getElementById('v3-order-overlay'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'v3-ov'; el.id = 'v3-order-overlay'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
  el.innerHTML = '<div class="v3-ov-card"><div class="v3-ov-tick"><i class="fa-solid '+(pending?'fa-hourglass-half':'fa-check')+'"></i></div>'+
    '<p class="text-base font-semibold text-slate-100">Your order is completed – '+(pending ? 'awaiting approval' : 'confirmed')+'</p>'+
    (line ? '<p class="text-xs text-slate-300 mt-1">'+esc(line)+'</p>' : '')+'<button type="button" class="mt-4 btn-primary rounded-xl px-6 py-2 text-sm font-semibold text-white">OK</button></div>';
  document.body.appendChild(el);
  const close = function(){ el.remove(); };
  el.querySelector('button').onclick = close; el.onclick = function(e){ if (e.target === el) close(); };
  setTimeout(close, 4500);
}
function v3BindMealCards(){
  V3_MEALS.forEach(function(meal){
    const info = v3Info(meal);
    const label = V3_MEAL_LABEL[meal]+' ('+info.serviceDate+')';
    const place = async function(){
      const payload = {};
      const nid = meal === 'dinner' ? 'dinner-notes' : (meal === 'breakfast' ? 'bf-note' : 'lu-note');
      const nv = mealNoteValue(nid); if (nv !== undefined) { payload.specialNote = nv; payload.notes = nv; }
      if (meal === 'dinner') payload.mealChoice = $('#dinner-choice').value;
      const r = await sendOrQueue(V3_ORDER_ACTION[meal], payload, { label: label, serviceDate: info.serviceDate });
      if (!r.success && (r.notOnMenu || r.offMenu) && meal === 'dinner') {
        // 2.10.2 / 3.0.0: dish not on the dinner date's menu — reload that menu and ask again
        toast('That dish isn\'t on '+WEEKDAY_NAMES[new Date(info.serviceDate+'T12:00:00Z').getUTCDay()]+'\'s menu – please pick again','error');
        cacheInvalidate(['dinnerMenus:'+info.serviceDate]);
        try { await v3FetchMenu(true); } catch (e) {}
        if (state.tab === 'meals') v3PaintMeals();
        return;
      }
      if (!r.success) { toast(r.error || 'Could not place the order','error'); if (r.needsLateRequest) v3AfterMealChange(meal); return; }
      if (r.queued) { toast('No connection — saved on this phone, will send automatically','info'); renderQueueAreas(); return; }
      const o = r.data && r.data.order;
      v3OrderOverlay(o ? o.status : (meal === 'dinner' ? 'pending' : 'ordered'), meal === 'dinner' ? 'Dinner '+v3DateLabel(info.serviceDate)+': '+payload.mealChoice : V3_MEAL_LABEL[meal]+' '+v3DateLabel(info.serviceDate));
      v3AfterMealChange(meal);
    };
    const b = $('#btn-'+meal); if (b) b.onclick = place;
    const c = $('#btn-'+meal+'-cancel');
    if (c) c.onclick = function(){
      const cur = v3CurOrder(meal, info.serviceDate);
      if (!cur) { toast('No active order to cancel','error'); return; }
      v3AskCancelReason(meal, async function(reason){
        const r = await sendOrQueue('cancelMealOrder', { meal: meal, reason: reason, cancelReason: reason, serviceDate: info.serviceDate }, { label: 'Cancel '+label, serviceDate: info.serviceDate });
        if (!r.success) { toast(r.error || 'Could not cancel','error'); return false; }
        if (r.queued) { toast('No connection — cancel saved, will send automatically','info'); return true; }
        const used = r.data && r.data.cancelsUsed;
        toast(V3_MEAL_LABEL[meal]+' cancelled'+(meal !== 'dinner' && used ? ' ('+used+' of 3 cancels used)' : ''), 'ok');
        v3AfterMealChange(meal);
        return true;
      });
    };
  });
  $$('.v3-late-open').forEach(function(b){ b.onclick = function(){ state._lateOpen = b.dataset.meal; v3PaintMeals(); const f = document.querySelector('[data-late^="'+b.dataset.meal+'-"] input'); if (f) f.focus(); }; });
  $$('.v3-late-send').forEach(function(b){ b.onclick = async function(){
    const meal = b.dataset.meal, date = b.dataset.date, id = meal+'-'+date;
    const reason = ($('#late-reason-'+id).value||'').trim();
    if (!reason) { toast('Please give a reason','error'); $('#late-reason-'+id).focus(); return; }
    const payload = { meal: meal, serviceDate: date, reason: reason, specialNote: mealNoteValue('late-note-'+id) || '', clientRequestId: newRequestId() };
    if (meal === 'dinner') payload.mealChoice = ($('#late-dish-'+id) && $('#late-dish-'+id).value) || 'Standard';
    b.disabled = true;
    const d = await v3Call('requestLateMeal', payload);
    b.disabled = false;
    if (d) { state._lateOpen = null; v3OrderOverlay('late_pending', 'Late '+V3_MEAL_LABEL[meal].toLowerCase()+' · '+v3DateLabel(date)+' — approved automatically at '+mtLabel(mealTimesNow()['late_close_'+meal])); cacheInvalidate(['v3home']); v3AfterMealChange(meal); }
  }; });
}
function v3FeedbackCard(){
  return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="chef-feedback">'+v3Title('fa-comment-dots','Feedback to the chef')+
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
function v3PaintMeals(){
  const focus = state.mealFocus; state.mealFocus = null;
  const keep = {}; $$('#meals-root input, #meals-root textarea, #meals-root select').forEach(function(el){ if (el.id) keep[el.id] = el.value; });
  $('#main-content').innerHTML = v3Page(v3CutoffBanner() + queueHostHtml('breakfast,lunch,dinner') + v3MealDash() +
    v3MealCard('dinner') + v3MealCard('lunch') + v3MealCard('breakfast') + v3FeedbackCard(), 'meals-root');
  Object.keys(keep).forEach(function(k){ const el = document.getElementById(k); if (el && keep[k] && el.tagName !== 'SELECT') el.value = keep[k]; });
  bindQueueButtons(); v3BindMealCards(); v3BindFeedback(); v3StartTicker();
  if (focus) { const el = $('#meal-card-'+focus); if (el) setTimeout(function(){ el.scrollIntoView({ block:'start' }); }, 30); }
}
async function renderMeals(){
  state.mealPill = 'meals';
  v3PaintMeals();
  await bootWait();
  if (state.tab !== 'meals') return;
  const today = v3Today();
  const jobs = V3_MEALS.map(function(m){ return v3FetchMeal(m).catch(function(){ return null; }); });
  jobs.push(v3FetchMenu().catch(function(){ return null; }));
  jobs.push(v3FetchMenu(false, today).catch(function(){ return null; }));
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
    if (state.tab === 'special' || state.tab === 'mealbehalf') v3RenderSpecialPage();
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
  const back = state._roleMode === 'kitchen' ? v3RoleBack('kitchen') : v3RoleBack('dept');
  $('#main-content').innerHTML = v3Page(back + '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sp-entry">'+v3Title('fa-star','Meal on behalf / special meal')+
    '<p class="text-[11px] text-slate-400">Order a meal for staff without a phone or for a contractor. It goes to the chef, within the normal ordering times.</p>'+
    '<button type="button" onclick="v3OpenSpecialForm()" id="btn-special" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white"><i class="fa-solid fa-plus mr-1"></i>New order for someone</button></section>'+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-list','Special orders I sent (last 3 days)')+'<div id="sp-list">'+v3Loading()+'</div></section>', 'special-root');
  const d = await v3Call('getMealRequests', { days: 3 });
  if (state.tab !== 'special' && state.tab !== 'mealbehalf') return;
  const me = String(state.user.email).toLowerCase();
  const rows = ((d && d.requests) || []).filter(function(x){ return x.kind === 'special' && String(x.requestedBy).toLowerCase() === me; });
  $('#sp-list').innerHTML = rows.length ? '<div class="space-y-2">'+rows.map(function(x){ return v3RequestCard(x, false); }).join('')+'</div>' : v3Empty('None yet.');
}

/* ============ I. Approvals inbox (HOD / chef / admin / superadmin) ============ */
async function v3RenderApprovals(){
  $('#main-content').innerHTML = v3Page((v3IsSuper() ? '' : v3RoleBack('dept')) + '<div id="ap-body" class="space-y-4">'+v3Loading()+'</div>', 'approvals-root');
  const me = String(state.user.email).toLowerCase();
  const wantLeave = v3CanDept(), wantMeals = v3CanDept() || v3CanChef();
  const [lv, mr] = await Promise.all([
    wantLeave ? api('getLeave', { scope: v3IsAdmin() ? 'all' : 'dept' }).catch(function(){ return null; }) : null,
    wantMeals ? api('getMealRequests', { days: 3 }).catch(function(){ return null; }) : null
  ]);
  if (state.tab !== 'approvals') return;
  let html = '';
  if (wantLeave) {
    const rows = ((lv && lv.data && lv.data.requests) || []).filter(function(l){ return String(l.userEmail).toLowerCase() !== me; });
    const hodStep = rows.filter(function(l){ return l.status === 'pending_hod'; }).map(function(l){ l.canDecide = true; return l; });
    const mgmt = v3IsAdmin() ? rows.filter(function(l){ return l.status === 'pending_manager'; }).map(function(l){ l.canDecide = true; return l; }) : [];
    html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-leave">'+v3Title('fa-plane-departure','Leave — HOD step', v3Chip(String(hodStep.length), hodStep.length?'warn':'mute'))+
      (hodStep.length ? v3ApproveAllBtn('leave', hodStep.length) + hodStep.map(function(l){ return v3LeaveCard(l, 'review'); }).join('') : v3Empty('No leave waiting for the HOD step.'))+'</section>';
    if (v3IsAdmin()) html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-final">'+v3Title('fa-stamp','Leave — final approval (management)', v3Chip(String(mgmt.length), mgmt.length?'warn':'mute'))+
      (mgmt.length ? v3ApproveAllBtn('final', mgmt.length) + mgmt.map(function(l){ return v3LeaveCard(l, 'review'); }).join('') : v3Empty('Nothing waiting for final approval.'))+'</section>';
  }
  if (wantMeals) {
    const reqs = ((mr && mr.data && mr.data.requests) || []).filter(function(x){ return x.canDecide; });
    const late = reqs.filter(function(x){ return x.kind === 'late'; }), sp = reqs.filter(function(x){ return x.kind === 'special'; });
    html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-late">'+v3Title('fa-clock-rotate-left','Late meal requests', v3Chip(String(late.length), late.length?'warn':'mute'))+
      '<p class="text-[10px] text-slate-400">Late requests are approved automatically when the late window closes ('+esc(mtLabel(mealTimesNow().late_close_dinner))+' dinner · '+esc(mtLabel(mealTimesNow().late_close_breakfast))+' breakfast & lunch). You can decline one before then.</p>'+
      (late.length ? v3ApproveAllBtn('late', late.length) + late.map(function(x){ return v3RequestCard(x, true); }).join('') : v3Empty('No late meal requests waiting.'))+'</section>';
    if (v3CanChef()) html += '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="ap-special">'+v3Title('fa-star','Special meal requests', v3Chip(String(sp.length), sp.length?'warn':'mute'))+
      (sp.length ? sp.map(function(x){ return v3RequestCard(x, true); }).join('') : v3Empty('No special requests waiting.'))+'</section>';
  }
  $('#ap-body').innerHTML = html || v3Empty('Nothing needs your approval.');
  const root = $('#ap-body');
  const again = function(){ cacheInvalidate(['v3home']); v3RefreshHome().then(function(){ renderNav('#bottom-nav'); }); v3RenderApprovals(); };
  v3BindLeaveCards(root, again); v3BindRequestCards(root, again);
  root.querySelectorAll('.v3-ap-all').forEach(function(b){ b.onclick = async function(){
    const what = { leave:'leave requests (HOD step)', final:'leave requests (final approval)', late:'late meal requests' }[b.dataset.k];
    if (!confirm('Approve all '+b.dataset.n+' '+what+'?')) return;
    b.disabled = true;
    const d = await v3Call('approveAllPending', { kind: b.dataset.k });
    b.disabled = false;
    if (d) { toast('Approved '+d.approved+(d.skipped ? ' · '+d.skipped+' skipped (not yours to decide)' : ''), 'ok'); cacheInvalidate(['v3home','mealRequests','kitchenDashboard']); again(); }
  }; });
}
/** Item 37: one "Approve all" button per approvals section (the server re-checks every item). */
function v3ApproveAllBtn(kind, n){
  return '<button type="button" class="v3-ap-all w-full rounded-xl py-2 text-xs font-semibold border border-emerald-500/50 text-emerald-200 bg-emerald-500/10" data-k="'+kind+'" data-n="'+n+'" id="ap-all-'+kind+'"><i class="fa-solid fa-check-double mr-1"></i>Approve all ('+n+')</button>';
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
  $('#main-content').innerHTML = v3Page(v3RoleBack('dept') +
    (v3IsAdmin() ? '<select id="ds-dept" class="ui-input w-full">'+depts.map(function(d){ return '<option'+(d===dept?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select>' : '<p class="text-xs text-slate-400">'+esc(dept)+' · everyone who signs up with your department is listed here. You can edit their details or remove them from the department. Only admin can move someone to another department.</p>')+
    '<div id="ds-body" class="space-y-4">'+v3Loading()+'</div>', 'deptstaff-root');
  const sel = $('#ds-dept'); if (sel) sel.onchange = function(){ state.deptView = sel.value; v3RenderDeptStaff(); };
  const d = await v3Call('getDeptStaff', { department: dept });
  if (state.tab !== 'deptstaff' || !d) return;
  const staffRow = function(u){
    return '<div class="v3-row py-2 border-b border-slate-700/40 last:border-0 min-w-0"><div class="min-w-0"><p class="text-sm text-slate-100 truncate">'+esc(fullDisplayName(u))+(v3RoleOf(u)!=='staff'||v3IsAsst(u)?' '+v3Chip(esc(v3RoleLabel(u)),'ok'):'')+'</p>'+
      '<p class="text-[10px] text-slate-400 truncate">'+esc(u.email)+(u.contact?' · '+esc(u.contact):'')+(u.roster?' · '+esc(u.roster):'')+'</p></div>'+
      (String(u.email).toLowerCase() !== String(state.user.email).toLowerCase() && (v3IsAdmin() || v3RoleLabel(u) === 'Staff') ? '<div class="flex gap-1 shrink-0"><button type="button" class="v3-ds-edit rounded-lg px-2 py-1 text-[11px] border border-slate-600 text-slate-200" data-email="'+esc(u.email)+'">Edit</button>'+
      '<button type="button" class="v3-ds-rm rounded-lg px-2 py-1 text-[11px] border border-rose-500/40 text-rose-200" data-email="'+esc(u.email)+'">Remove</button></div>' : '')+'</div>';
  };
  $('#ds-body').innerHTML =
    '<section class="glass rounded-2xl p-4 space-y-1 min-w-0" id="ds-staff">'+v3Title('fa-users','Department staff', v3Chip(String(d.staff.length),'mute'))+(d.staff.length ? d.staff.map(staffRow).join('') : v3Empty('No accepted staff yet.'))+'</section>'+
    ((d.declined||[]).length ? '<section class="glass rounded-2xl p-4 space-y-1 min-w-0">'+v3Title('fa-user-slash','Removed from the department')+d.declined.map(function(u){ return '<p class="text-xs text-slate-400 truncate">'+esc(fullDisplayName(u))+'</p>'; }).join('')+'</section>' : '');
  const root = $('#ds-body');
  root.querySelectorAll('.v3-ds-edit').forEach(function(b){ b.onclick = function(){
    const u = d.staff.find(function(x){ return x.email === b.dataset.email; }); if (!u) return;
    v3Form('Edit '+fullDisplayName(u), [
      { id:'firstName', label:'First name', value:u.firstName }, { id:'lastName', label:'Last name', value:u.lastName },
      { id:'preferredName', label:'Preferred name', value:u.preferredName, max:40 }, { id:'contact', label:'Contact', value:u.contact },
      { id:'roster', label:'Roster / shift pattern', value:u.roster }, { id:'village', label:'Mainland or Village', type:'select', options:['Mainland','Village'], value: u.village === 'Village' ? 'Village' : 'Mainland' }
    ], 'Save', async function(v){ const r = await v3Call('updateDeptStaff', Object.assign({ targetEmail: u.email }, v), 'Saved'); if (r) v3RenderDeptStaff(); return !!r; }, 'Department: '+esc(u.department)+' (only admin can change it).');
  }; });
  root.querySelectorAll('.v3-ds-rm').forEach(function(b){ b.onclick = async function(){
    if (!confirm('Remove '+b.dataset.email+' from '+dept+'? They stop getting department updates and their HOD approvals until admin sets their department again.')) return;
    const r = await v3Call('removeFromDept', { targetEmail: b.dataset.email }, 'Removed from department');
    if (r) v3RenderDeptStaff();
  }; });
}
async function v3RenderDeptUpdates(){
  const lead = state._roleMode === 'dept' && v3CanDept();
  $('#main-content').innerHTML = v3Page((lead ? v3RoleBack('dept') : v3Back('more','More')) +
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
  if (state.tab !== 'deptupdates' && state.tab !== 'deptupdatespost') return;
  const list = $('#du-list');
  if (!d) { list.innerHTML = ''; return; }
  if (d.locked) { list.innerHTML = v3Card('<p class="text-xs text-slate-400"><i class="fa-solid fa-lock mr-1"></i>Department updates show once you are in a department.</p>'); return; }
  list.innerHTML = (d.updates||[]).length ? d.updates.map(function(u){ return v3UpdateCard(u, false); }).join('') : v3Card(v3Empty('No updates yet.'));
  v3BindUpdateCards(list, v3RenderDeptUpdates);
}

/* ============ K. More, profile summary, history, notifications ============ */
function renderMore(){
  const u = state.user, h = v3Home(), hb = h.hodBar || {};
  const unread = state._v3Unread || 0;
  const group = function(title, rows){ return rows ? '<section class="space-y-1.5 min-w-0"><h3 class="v3-section-title px-1">'+title+'</h3><div class="glass rounded-2xl overflow-hidden">'+rows+'</div></section>' : ''; };
  const profile = '<section class="glass rounded-2xl p-4 min-w-0" id="more-profile"><div class="flex items-center gap-3 min-w-0">'+homeAvatarHtml(u)+'<div class="min-w-0 flex-1">'+
    '<p class="font-semibold text-slate-100 truncate">'+esc(fullDisplayName(u))+'</p><p class="text-[11px] text-slate-400 truncate">'+esc(u.email)+'</p>'+
    '<p class="text-[11px] text-slate-300 mt-0.5" id="more-roles">'+esc(v3RoleLabel(u))+' · '+esc(u.department||'—')+'</p></div>'+
    '<button type="button" onclick="navigate(\'profile\')" class="rounded-lg px-3 py-2 text-xs border border-teal-500/40 text-teal-200 shrink-0">Edit</button></div></section>';
  let html = profile;
  // role buttons (3.0.0): only what the account holds
  const btns = v3IsSuper() ? [] : v3Buttons(u);
  if (btns.length) {
    const badge = { admin: 0, kitchen: h.chef ? (h.chef.pending.late + h.chef.pending.special + (h.chef.feedbackNew||0)) : 0, boat: (h.boat && h.boat.emergencyPending) || 0, dept: (hb.leave||0)+(hb.late||0)+(hb.leaveMgmt||0) };
    html += '<section class="space-y-1.5 min-w-0" id="more-rolebtns"><h3 class="v3-section-title px-1">My role pages</h3><div class="grid grid-cols-2 gap-2">'+btns.map(function(k){
      const b = V3_BUTTONS[k];
      return '<button type="button" onclick="navigate(\''+b.tab+'\')" class="glass rounded-2xl p-3 text-left min-w-0 relative border border-teal-500/30" data-rolebtn="'+k+'">'+
        '<i class="fa-solid '+b.icon+' text-teal-300 text-lg"></i><p class="text-sm font-semibold text-slate-100 mt-1">'+esc(b.label)+'</p><p class="text-[10px] text-slate-400 leading-tight">'+esc(b.sub)+'</p>'+
        (badge[k] ? '<span class="v3-count absolute top-2 right-2">'+badge[k]+'</span>' : '')+'</button>';
    }).join('')+'</div>'+(state.rolesNeedSignIn && !state.demo ? '<button type="button" onclick="v3AskReauth()" class="w-full text-[11px] text-sky-300 py-1"><i class="fa-solid fa-lock mr-1"></i>Sign in again to open role pages</button>' : '')+'</section>';
  }
  if (v3IsSuper()) {
    html += group('Account', v3Row(v3Nav('notifications'),'fa-bell','Notifications','', unread) + v3Row(v3Nav('superlog'),'fa-shield-halved','Superadmin log','Every superadmin change'+(state.a31CanRevert ? ' · revert' : '')) + (a32Owner() ? v3Row(v3Nav('reports'),'fa-bug','Reports','Problems & requests from staff', state._a32RepNew||0) : '') + v3Row(v3Nav('pushsettings'),'fa-bell','Phone notifications', a32Owner() ? 'New reports on your phone' : 'Messages on your phone') + v3Row('a32OpenReport()','fa-flag','Report a problem','')) + a31SuperNoteHtml(); // 3.1.0: no staff features
  } else {
    html += group('Me', v3Row(v3Nav('leave'),'fa-plane-departure','Leave requests','Request, track or cancel') +
      v3Row(v3Nav('history'),'fa-clock-rotate-left','My orders & history','Orders, boats, leave, requests, feedback') +
      v3Row(v3Nav('bookings'),'fa-ticket','My boat bookings','') +
      v3Row(v3Nav('notifications'),'fa-bell','Notifications','', unread) +
      v3Row(v3Nav('pushsettings'),'fa-mobile-screen','Phone notifications','Alerts on your phone, meal reminders') +
      v3Row(v3Nav('deptupdates'),'fa-bullhorn','Department updates', esc(u.department||'')) +
      (featureOn('feature_my_schedule') ? v3Row(v3Nav('schedule'),'fa-calendar-check','My schedule','') : '')) +
      group('Help', v3Row('a32OpenReport()','fa-flag','Report a problem','Error, change request or idea') + v3Row(v3Nav('myreports'),'fa-inbox','My reports','Status and replies'));
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
  const go = { leave: v3CanDept() ? 'approvals' : 'leave', late_meal: v3CanChef() ? 'chefreq' : (v3CanDept() ? 'approvals' : 'meals'), special_meal:'chefreq', meal_request:'meals', meal_cancelled:'meals', order_cancelled:'meals', admin_message:'notifications', chef_feedback: v3CanChef() ? 'chefcomments' : 'history', dept_update:'deptupdates', role:'more' };
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

/* ============ L. Kitchen Admin (chef / admin / superadmin) ============ */
async function v3RenderKitchenAdmin(){
  const h = v3Home();
  const paint = function(c){
    $('#main-content').innerHTML = v3Page(v3Back('more','More') +
      '<div class="grid grid-cols-2 gap-2" id="chef-shortcuts">'+
        v3Tile(v3Nav('kitchen'),'fa-list-ol','Lists & summaries','Prep list · PDF · saved summaries')+
        v3Tile(v3Nav('chefreq'),'fa-clock-rotate-left','Late & special','Auto-approve at the late close', c ? c.pending.late + c.pending.special : 0)+
        v3Tile(v3Nav('chefmenu'),'fa-pen-to-square','Dinner menus','All 7 days')+
        v3Tile(v3Nav('mealtimes'),'fa-clock','Meal times','Cutoffs & late windows')+
        v3Tile(v3Nav('offmenu'),'fa-triangle-exclamation','Not on the menu','Orders to fix')+
        v3Tile(v3Nav('chefcomments'),'fa-comment-dots','Food feedback','From staff', c ? c.feedbackNew : 0)+
        v3Tile(v3Nav('mealstats'),'fa-chart-column','Meal statistics','Range · roster compare')+
        v3Tile(v3Nav('special'),'fa-star','Meal on behalf','Staff without a phone')+
        v3Tile(a31LogNav('kitchen'),'fa-clock-rotate-left','Activity log','Who changed what')+'</div>'+
      '<p class="text-[11px] text-slate-400 px-1" id="ka-times"><i class="fa-solid fa-clock mr-1"></i>Dinner closes '+esc(dinnerCutLabel())+' the day before · late requests until '+esc(mtLabel(mealTimesNow().late_close_dinner))+' (auto-approved then) · breakfast & lunch close '+esc(mtLabel(mealTimesNow().breakfast_cutoff))+' / '+esc(mtLabel(mealTimesNow().lunch_cutoff))+'.</p>'+
      v3ChefDashCard(c)+'<div id="chef-orders">'+(state._chefOrdersHtml||v3Card(v3Loading()))+'</div><div id="chef-notes">'+(state._chefNotesHtml||'')+'</div>', 'chef-root');
    v3BindChefOrders();
  };
  paint(h.chef);
  const d = await v3Call('getChefDashboard', {});
  if (d && state.tab === 'kitchenadmin') { const cur = v3Home(); cur.chef = d; cacheSet('v3home', cur); paint(d); }
  v3LoadChefOrders();
  v3LoadChefNotes();
}
const v3RenderChefHub = v3RenderKitchenAdmin;
/** Chef page: today's / tomorrow's orders (names, dish, notes) with "Served". */
async function v3LoadChefOrders(){
  const day = state.chefDay || 'today';
  const date = day === 'today' ? fijiDateString() : fijiDateString(addFijiDays(getFijiNow(), 1));
  const get = function(a){ return api(a, { serviceDate: date }).then(function(r){ return r && r.success ? ((r.data && r.data.orders) || []) : []; }).catch(function(){ return []; }); };
  const [b, l, dn] = await Promise.all([get('getBreakfastOrders'), get('getLunchOrders'), get('getDinnerOrders')]);
  if (state.tab !== 'kitchenadmin') return;
  const packs = { breakfast: b, lunch: l, dinner: dn };
  const live = function(o){ return String(o.serviceDate).slice(0,10) === date && !isInactiveMealStatus(o.status) && o.status !== 'special_pending' && o.status !== 'late_pending'; };
  const sec = V3_MEALS.map(function(m){
    const rows = (packs[m]||[]).filter(live);
    const served = rows.filter(function(o){ return o.status === 'served'; }).length;
    return '<details class="rounded-xl border border-slate-700/60 bg-slate-900/40 min-w-0" data-chef-meal="'+m+'"><summary class="px-3 py-2 flex items-center justify-between cursor-pointer text-sm"><span><i class="fa-solid '+V3_MEAL_ICON[m]+' text-teal-400 mr-2"></i>'+V3_MEAL_LABEL[m]+'</span><span class="text-xs text-slate-300">'+rows.length+' · '+served+' served</span></summary>'+
      '<div class="px-3 pb-2 space-y-1">'+(rows.length ? rows.map(function(o){
        const note = kitchenNoteOf(o);
        return '<div class="v3-row text-xs py-1 border-t border-slate-700/40 min-w-0"><div class="min-w-0"><p class="text-slate-100 truncate">'+esc(orderDisplayName(o))+' <span class="text-[10px] text-slate-400">· '+esc(o.department||'')+'</span></p>'+
          (m==='dinner' && o.mealChoice ? '<p class="text-[10px] text-slate-300 truncate">'+esc(o.mealChoice)+'</p>' : '')+(note ? '<p class="text-[10px] text-amber-200 break-words">'+esc(note)+'</p>' : '')+'</div>'+
          (o.status === 'served' ? '<span class="text-[10px] text-emerald-300 shrink-0">✓ Served</span>' : '<span class="flex gap-1 shrink-0"><button type="button" class="v3-served rounded-lg px-2 py-1 text-[11px] border border-teal-500/40 text-teal-200" data-id="'+esc(o.id)+'" data-meal="'+m+'">Served</button>'+
            '<button type="button" class="v3-ord-cancel rounded-lg px-2 py-1 text-[11px] border border-rose-500/40 text-rose-200" data-id="'+esc(o.id)+'" data-meal="'+m+'" data-name="'+esc(orderDisplayName(o))+'" aria-label="Cancel order">Cancel</button></span>')+'</div>';
      }).join('') : v3Empty('No orders.'))+'</div></details>';
  }).join('');
  state._chefOrdersHtml = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="chef-orders-card">'+v3Title('fa-utensils','Orders', '<div class="flex gap-1 rounded-lg bg-slate-900/60 p-0.5">'+['today','tomorrow'].map(function(k){ return '<button type="button" class="v3-chefday rounded-md px-2 py-1 text-[11px] '+(day===k?'bg-teal-600 text-white font-semibold':'text-slate-300')+'" data-day="'+k+'">'+(k==='today'?'Today':'Tomorrow')+'</button>'; }).join('')+'</div>')+
    '<p class="text-[10px] text-slate-400">'+esc(v3DateLabel(date))+' · '+esc(date)+' · confirmed orders (late / special requests are under Requests)</p>'+sec+'</section>';
  const box = $('#chef-orders'); if (box) { box.innerHTML = state._chefOrdersHtml; v3BindChefOrders(); }
}
function v3BindChefOrders(){
  $$('.v3-chefday').forEach(function(b){ b.onclick = function(){ state.chefDay = b.dataset.day; state._chefOrdersHtml = ''; const box = $('#chef-orders'); if (box) box.innerHTML = v3Card(v3Loading()); v3LoadChefOrders(); }; });
  $$('.v3-ord-cancel').forEach(function(b){ b.onclick = function(){ v3AdminCancelForm(b.dataset.id, b.dataset.meal, b.dataset.name, function(){ cacheInvalidate(['kitchenDashboard']); v3LoadChefOrders(); }); }; });
  $$('.v3-served').forEach(function(b){ b.onclick = async function(){
    const r = await v3Call('markOrderStatus', { id: b.dataset.id, meal: b.dataset.meal, status:'served' }, 'Marked served');
    if (r) { cacheInvalidate(['kitchenDashboard']); v3LoadChefOrders(); }
  }; });
}
/** Chef page: Allergies & special requests for the upcoming services (same card as the kitchen lists). */
async function v3LoadChefNotes(){
  let r = null; try { r = await api('getKitchenDashboard', {}); } catch (e) {}
  if (state.tab !== 'kitchenadmin' || !r || !r.success) return;
  const dsh = r.data || {};
  const groups = { dinner: noteEntriesFrom('dinner', dsh.dinner && dsh.dinner.orders), breakfast: noteEntriesFrom('breakfast', dsh.breakfast && dsh.breakfast.orders), lunch: noteEntriesFrom('lunch', dsh.lunch && dsh.lunch.orders) };
  state._chefNotesHtml = notesCardHtml(groups, { dinnerDate: dsh.dinnerDate, breakfastDate: dsh.breakfastDate || (dsh.breakfast && dsh.breakfast.serviceDate), lunchDate: dsh.lunchDate || (dsh.lunch && dsh.lunch.serviceDate) });
  const box = $('#chef-notes'); if (box) box.innerHTML = state._chefNotesHtml;
}
async function v3RenderChefRequests(){
  const canAll = v3CanChef();
  $('#main-content').innerHTML = v3Page(v3RoleBack('kitchen') +
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
  $('#main-content').innerHTML = v3Page(v3RoleBack('kitchen') + '<div id="cc-list" class="space-y-2">'+v3Loading()+'</div>', 'chefcomments-root');
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
/** Kitchen Admin: all 7 dinner menus on one page (add, rename, reorder, hide, delete). The staff order list for a date shows ONLY that weekday's dishes. */
async function v3RenderMenuEditor(){
  const order = [1,2,3,4,5,6,0], tomWd = addFijiDays(getFijiNow(),1).getUTCDay();
  $('#main-content').innerHTML = v3Page(v3RoleBack('kitchen') +
    '<p class="text-[11px] text-slate-400 px-1">Staff ordering for a dinner date see only that weekday\'s dishes (e.g. Tuesday\'s dinner shows Tuesday\'s menu). Tomorrow is <strong class="text-slate-200">'+esc(WEEKDAY_NAMES[tomWd])+'</strong>.</p>'+
    '<div class="flex gap-1 overflow-x-auto pb-1" id="me-jump">'+order.map(function(i){ return '<a href="#me-day-'+i+'" class="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] '+(i===tomWd?'bg-teal-600 text-white font-semibold':'bg-slate-800/70 text-slate-300')+'">'+WEEKDAY_NAMES[i].slice(0,3)+'</a>'; }).join('')+'</div>'+
    '<div id="me-days" class="space-y-3">'+v3Card(v3Loading())+'</div>', 'chefmenu-root');
  $$('#me-jump a').forEach(function(a){ a.onclick = function(e){ e.preventDefault(); const el = document.querySelector(a.getAttribute('href')); if (el) el.scrollIntoView({ block:'start', behavior:'smooth' }); }; });
  const [m, w] = await Promise.all([api('getDinnerMenus', { includeInactive:true }).catch(function(){ return null; }), api('getWeeklyMenu', {}).catch(function(){ return null; })]);
  if (state.tab !== 'chefmenu') return;
  if (!m || !m.success) { $('#me-days').innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((m && m.error) || 'Could not load menus')+'</p>'); return; }
  const all = (m.data && (m.data.items || m.data.serviceItems)) || [];
  const tally = {}; ((w && w.data && w.data.days) || []).forEach(function(d){ (d.items||[]).forEach(function(it){ tally[String(it.dish).toLowerCase()] = it; }); });
  const so = function(x){ const n = Number(x.sortOrder); return isFinite(n) ? n : 99; };
  $('#me-days').innerHTML = order.map(function(wd){
    const items = all.filter(function(it){ return Number(it.weekday) === wd; }).sort(function(a, b){ return so(a) - so(b); });
    return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0 scroll-mt-20" id="me-day-'+wd+'" data-wd="'+wd+'">'+v3Title('fa-utensils', esc(WEEKDAY_NAMES[wd]), wd===tomWd ? v3Chip('Tomorrow','ok') : v3Chip(String(items.filter(function(i){ return i.active !== false && String(i.active) !== 'false'; }).length)+' dishes','mute'))+
      (items.length ? items.map(function(it, idx){
        const t = tally[String(it.itemName).toLowerCase()] || { likes:0, dislikes:0 };
        const hidden = it.active === false || String(it.active) === 'false';
        return '<div class="v3-row py-2 border-b border-slate-700/40 last:border-0 min-w-0" data-item="'+esc(it.id)+'"><div class="min-w-0"><p class="text-sm '+(hidden?'text-slate-500 line-through':'text-slate-100')+' break-words">'+esc(it.itemName)+'</p>'+
          '<p class="text-[10px] text-slate-400"><i class="fa-solid fa-thumbs-up text-teal-300"></i> '+t.likes+' · <i class="fa-solid fa-thumbs-down text-rose-300"></i> '+t.dislikes+(hidden?' · hidden':'')+'</p></div>'+
          '<div class="flex gap-1 shrink-0">'+
          '<button type="button" class="v3-me-up rounded-lg px-1.5 py-1 text-[11px] border border-slate-600 text-slate-300" data-wd="'+wd+'" data-i="'+idx+'" aria-label="Move up"'+(idx===0?' disabled':'')+'><i class="fa-solid fa-arrow-up"></i></button>'+
          '<button type="button" class="v3-me-ren rounded-lg px-2 py-1 text-[11px] border border-slate-600 text-slate-200" data-id="'+esc(it.id)+'" data-wd="'+wd+'" data-name="'+esc(it.itemName)+'">Rename</button>'+
          '<button type="button" class="v3-me-hide rounded-lg px-2 py-1 text-[11px] border border-slate-600 text-slate-300" data-id="'+esc(it.id)+'" data-wd="'+wd+'" data-name="'+esc(it.itemName)+'" data-on="'+(hidden?'1':'0')+'">'+(hidden?'Show':'Hide')+'</button>'+
          '<button type="button" class="v3-me-del rounded-lg px-2 py-1 text-[11px] border border-rose-500/40 text-rose-200" data-id="'+esc(it.id)+'" data-wd="'+wd+'" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div></div>';
      }).join('') : v3Empty('No dishes — staff can order "Standard" on this day.'))+
      '<div class="flex gap-2 pt-1"><input id="me-new-'+wd+'" class="ui-input flex-1 min-w-0" maxlength="80" placeholder="Add a dish for '+esc(WEEKDAY_NAMES[wd])+'"/><button type="button" class="v3-me-add btn-primary rounded-xl px-4 text-sm text-white font-semibold" data-wd="'+wd+'">Add</button></div></section>';
  }).join('');
  const byWd = function(wd){ return all.filter(function(it){ return Number(it.weekday) === Number(wd); }).sort(function(a, b){ return so(a) - so(b); }); };
  const done = function(){ cacheInvalidate(['weeklyMenu', 'dinnerMenus:'+dinnerCutoffInfo().serviceDate, 'dinnerMenus:'+fijiDateString()]); v3RenderMenuEditor(); };
  $$('.v3-me-add').forEach(function(b){ b.onclick = async function(){ const wd = Number(b.dataset.wd), inp = $('#me-new-'+wd), n = inp.value.trim(); if (!n) { toast('Type a dish name','error'); inp.focus(); return; }
    b.disabled = true; const r = await v3Call('saveDinnerMenuItem', { weekday: wd, itemName: n, sortOrder: byWd(wd).length + 1, active: true }, 'Dish added to '+WEEKDAY_NAMES[wd]); b.disabled = false; if (r) done(); }; });
  $$('.v3-me-ren').forEach(function(b){ b.onclick = function(){ v3Form('Rename dish ('+WEEKDAY_NAMES[b.dataset.wd]+')', [{ id:'itemName', label:'Dish name', value: b.dataset.name, required:true, max:80 }], 'Save', async function(v){ const r = await v3Call('saveDinnerMenuItem', { id: b.dataset.id, weekday: Number(b.dataset.wd), itemName: v.itemName }, 'Saved'); if (r) done(); return !!r; },
    'Orders already placed keep the old name — they are listed under "Not on the menu" if the old name is gone.'); }; });
  $$('.v3-me-hide').forEach(function(b){ b.onclick = async function(){ const on = b.dataset.on === '1'; const r = await v3Call('saveDinnerMenuItem', { id: b.dataset.id, weekday: Number(b.dataset.wd), itemName: b.dataset.name, active: on }, on ? 'Shown again' : 'Hidden from staff'); if (r) done(); }; });
  $$('.v3-me-del').forEach(function(b){ b.onclick = async function(){ if (!confirm('Delete this dish from '+WEEKDAY_NAMES[b.dataset.wd]+'?')) return; const r = await v3Call('deleteDinnerMenuItem', { id: b.dataset.id }, 'Deleted'); if (r) done(); }; });
  $$('.v3-me-up').forEach(function(b){ b.onclick = async function(){
    const list = byWd(b.dataset.wd), i = Number(b.dataset.i); if (i < 1) return;
    const tmp = list[i-1]; list[i-1] = list[i]; list[i] = tmp;
    b.disabled = true;
    for (let k = 0; k < list.length; k++) { if (so(list[k]) !== k + 1) { const r = await v3Call('saveDinnerMenuItem', { id: list[k].id, weekday: Number(b.dataset.wd), itemName: list[k].itemName, sortOrder: k + 1 }); if (!r) break; } }
    done();
  }; });
}
/** Cancel one order with a reason (stored on the order). The staff member is notified in-app; admin / superadmin can
 *  also choose another user to notify and add a message, or send no notification. */
function v3AdminCancelForm(id, meal, name, after, reasonDefault){
  const admin = v3IsAdmin();
  const fields = [{ id:'reason', label:'Reason (stored on the order, the staff member sees it)', value: reasonDefault || '', required:true, max:200 }];
  if (admin) fields.push({ id:'notifyEmail', label:'Also notify another user (email, optional)', type:'email', max:120 }, { id:'message', label:'Message in the notification (optional)', type:'textarea', max:300 },
    { id:'silent', label:'Do not send any notification', type:'checkbox' });
  v3Form('Cancel '+name+'\'s '+(V3_MEAL_LABEL[meal]||meal).toLowerCase(), fields, 'Cancel order', async function(v){
    const p = { id: id, meal: meal, reason: v.reason };
    if (admin) { if (v.notifyEmail) p.notifyEmail = String(v.notifyEmail).trim(); if (v.message) p.message = v.message; if (v.silent) p.notify = 'false'; }
    const r = await v3Call('adminCancelMealOrder', p);
    if (r) { toast('Cancelled'+(r.notified ? ' — notified '+r.notified : ' — no notification sent'),'ok'); if (after) after(); }
    return !!r;
  }, admin ? 'The staff member gets an in-app notification with the reason unless you tick "Do not send".' : name+' gets an in-app notification with the reason.');
}
/** Kitchen Admin: meal times (cutoffs + late windows). Changes apply straight away for everyone. */
async function v3RenderMealTimes(){
  const t = mealTimesNow();
  const f = function(k, label, hint){ return '<div class="space-y-1 min-w-0"><label for="mt-'+k+'" class="text-[11px] text-slate-400">'+label+'</label><input type="time" id="mt-'+k+'" class="ui-input w-full" value="'+esc(t[k]||'')+'" data-k="'+k+'"/>'+(hint?'<p class="text-[10px] text-slate-500">'+hint+'</p>':'')+'</div>'; };
  $('#main-content').innerHTML = v3Page(v3RoleBack('kitchen') +
    v3Card(v3Title('fa-moon','Dinner')+f('dinner_cutoff','Orders close (the day before)','Default 23:55 — staff can order, change or cancel until then.')+f('late_close_dinner','Late requests close (on the dinner day)','Default 08:00 — late requests are approved automatically at this time and the summary PDF is saved again.'), 'mt-dinner')+
    v3Card(v3Title('fa-mug-saucer','Breakfast')+f('breakfast_cutoff','Orders close (the day before)','')+f('late_close_breakfast','Late requests close','00:00 = midnight (start of the breakfast day).'), 'mt-breakfast')+
    v3Card(v3Title('fa-bowl-food','Lunch')+f('lunch_cutoff','Orders close (the day before)','')+f('late_close_lunch','Late requests close','00:00 = midnight (start of the lunch day).'), 'mt-lunch')+
    '<button type="button" id="mt-save" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white">Save meal times</button>'+
    '<button type="button" id="mt-run" class="w-full rounded-xl py-2.5 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-bolt mr-1"></i>Run the auto-approve check now</button>'+
    '<p class="text-[10px] text-slate-500 px-1">All times are Fiji time, 24-hour. The app checks the cutoffs every few minutes and whenever someone opens it.</p>', 'mealtimes-root');
  $('#mt-save').onclick = async function(){
    const p = {}; $$('#mealtimes-root input[type=time]').forEach(function(i){ if (i.value) p[i.dataset.k] = i.value; });
    this.disabled = true;
    const d = await v3Call('setMealTimes', p, 'Meal times saved');
    this.disabled = false;
    if (d && d.mealTimes) { state.mealTimes = d.mealTimes; try { localStorage.setItem('pcr_v3_mealtimes', JSON.stringify(d.mealTimes)); } catch (e) {} cacheInvalidate(['v3home']); v3RenderMealTimes(); }
  };
  $('#mt-run').onclick = async function(){ const d = await v3Call('runMealTick', {}); if (d) toast('Checked — '+((d.dinnerLateApproved||0)+(d.breakfastLateApproved||0)+(d.lunchLateApproved||0))+' late request(s) approved'+(d.cutoffApproved?' · '+d.cutoffApproved+' dinner order(s) confirmed':''), 'ok'); };
  const d = await v3Call('getMealTimes', {});
  if (d && state.tab === 'mealtimes' && d.times) { state.mealTimes = d; Object.keys(d.times).forEach(function(k){ const i = $('#mt-'+k); if (i && document.activeElement !== i) i.value = d.times[k]; }); }
}
/** Kitchen Admin: dinner orders whose dish is not on that date's menu — cancel with a reason (the staff member is notified). */
async function v3RenderOffMenu(){
  const sd = state.offDate || dinnerCutoffInfo().serviceDate;
  $('#main-content').innerHTML = v3Page(v3RoleBack('kitchen') +
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-triangle-exclamation','Dinner orders not on the menu')+
    '<p class="text-[11px] text-slate-400">They still count in the lists (flagged) until you cancel them. Cancelling notifies the staff member so they can re-order from the right menu.</p>'+
    '<div class="flex gap-2"><input type="date" id="om-date" class="ui-input flex-1 min-w-0" value="'+esc(sd)+'"/><button type="button" id="om-go" class="btn-primary rounded-xl px-4 text-sm text-white font-semibold">Show</button></div></section>'+
    '<div id="om-list">'+v3Card(v3Loading())+'</div>', 'offmenu-root');
  $('#om-go').onclick = function(){ state.offDate = $('#om-date').value; v3RenderOffMenu(); };
  const d = await v3Call('listOffMenuOrders', { serviceDate: sd });
  if (state.tab !== 'offmenu' || !d) return;
  const wd = WEEKDAY_NAMES[new Date(sd+'T00:00:00Z').getUTCDay()];
  $('#om-list').innerHTML = v3Card('<p class="text-[11px] text-slate-400">'+esc(wd)+' '+esc(sd)+' menu: '+(d.menu.length ? d.menu.map(esc).join(' · ') : 'none set (any dish is accepted)')+'</p>'+
    (d.orders.length ? d.orders.map(function(o){
      return '<div class="v3-row py-2 border-t border-slate-700/40 min-w-0" data-off="'+esc(o.id)+'"><div class="min-w-0"><p class="text-sm text-slate-100 truncate">'+esc(o.userName)+' <span class="text-[10px] text-slate-400">· '+esc(o.department||'')+'</span></p><p class="text-[11px] text-amber-200 break-words">'+esc(o.mealChoice)+'</p><p class="text-[10px] text-slate-500">'+v3Status(o.status)+' · ordered '+esc(v3Ts(o.createdAt))+'</p></div>'+
        '<button type="button" class="v3-off-cancel shrink-0 rounded-lg px-2 py-1.5 text-[11px] border border-rose-500/40 text-rose-200" data-id="'+esc(o.id)+'" data-name="'+esc(o.userName)+'">Cancel & notify</button></div>';
    }).join('') : v3Empty('All dinner orders for this date are on the menu.')), 'om-card');
  $$('.v3-off-cancel').forEach(function(b){ b.onclick = function(){
    v3AdminCancelForm(b.dataset.id, 'dinner', b.dataset.name, function(){ cacheInvalidate(['kitchenDashboard']); v3RenderOffMenu(); }, 'Not on '+wd+'\'s menu – please re-order from '+wd+'\'s menu');
  }; });
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
  $('#main-content').innerHTML = v3Page(v3RoleBack('kitchen') +
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-chart-column','Meal statistics')+
    '<div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/60 p-1">'+['daily','weekly','monthly'].map(function(p){ return '<button type="button" class="v3-per rounded-lg py-1.5 text-xs '+(st.period===p?'bg-teal-600 text-white font-semibold':'text-slate-300')+'" data-p="'+p+'">'+p[0].toUpperCase()+p.slice(1)+'</button>'; }).join('')+'</div>'+
    '<div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400 space-y-1 min-w-0"><span>From</span><input type="date" id="rp-from" class="ui-input w-full min-w-0" value="'+st.from+'"/></label><label class="text-[10px] text-slate-400 space-y-1 min-w-0"><span>To</span><input type="date" id="rp-to" class="ui-input w-full min-w-0" value="'+st.to+'"/></label></div>'+
    '<select id="rp-meal" class="ui-input w-full">'+[['all','All meals'],['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner']].map(function(o){ return '<option value="'+o[0]+'"'+(st.meal===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>'+
    '<button type="button" id="rp-go" class="btn-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold">Show report</button></section>'+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="rp-roster">'+v3Title('fa-file-excel','Compare with staff roster')+
    '<p class="text-[11px] text-slate-400">Upload the weekly roster (CSV or Excel: name, department, date, start, end, dayOff). Staff on the roster and not on a day off are "expected on the island" for each meal.</p>'+
    '<input type="file" id="rp-file" accept=".csv,.xlsx,.xls,text/csv" class="block w-full text-xs text-slate-300"/>'+
    '<p id="rp-roster-info" class="text-[11px] text-teal-300">'+(state.repRoster ? esc(state.repRoster.name)+' · '+state.repRoster.count+' shifts loaded' : '')+'</p></section>'+
    '<div id="rp-out" class="space-y-3"></div>', 'mealstats-root');
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
    if (!d || state.tab !== 'mealstats') { const o = $('#rp-out'); if (o) o.innerHTML = ''; return; } // 3.0.1: #rp-out is gone if the page changed
    state.repData = d; v3PaintReport(d);
  };
  if (state.repData) v3PaintReport(state.repData);
}
function v3RenderMealStats(){ return v3RenderChefReports(); }
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
  let html = g('Approvals', v3Row(v3Nav('approvals'),'fa-inbox','Approvals inbox','Leave, late & special meals', (hb.leave||0)+(hb.leaveMgmt||0)+(hb.late||0)) +
    v3Row("state.leaveTabForce='final';navigate('leave')",'fa-stamp','Leave — final approval','After the HOD step', hb.leaveMgmt||sd.leaveMgmt||0));
  html += g('Role pages', v3Row(v3Nav('adminhub'),'fa-user-shield','Admin Settings','Users & roles, leave, reminders, reports') +
    v3Row(v3Nav('kitchenadmin'),'fa-fire-burner','Kitchen Admin','Lists, menus, requests, meal times', h.chef ? h.chef.pending.late + h.chef.pending.special : 0) +
    v3Row(v3Nav('boatadmin'),'fa-anchor','Boat Admin','Runs, passengers, emergency travel') +
    v3Row(v3Nav('deptadmin'),'fa-people-group','Department Admin','Any department: staff, updates, leave'));
  html += g('People', v3Row(v3Nav('usersv3'),'fa-users-gear','Users & roles','Edit, delete, roles (more than one allowed), departments') +
    v3Row(v3Nav('leavecal'),'fa-calendar-days','Leave calendar','Month view · approved and waiting') +
    v3Row(v3Nav('users'),'fa-address-book','Staff directory (classic)','2.x list · add user, import CSV'));
  html += g('Communication', v3Row(v3Nav('reminders'),'fa-bell','Reminders','Add, edit, remove') + v3Row(v3Nav('suggestions'),'fa-lightbulb','Suggestions','Approve / reject'));
  html += g('Reports & system', v3Row(v3Nav('adminstatus'),'fa-file-arrow-down','Reports & downloads','Download all app data') +
    (v3IsSuper() ? v3Row(v3Nav('settings'),'fa-gear','App settings','Email (Brevo), test email, features, alert emails, revert owner') + v3Row(v3Nav('migrate'),'fa-right-left','Role migration','Preview / apply the 3.0.0 roles list') + v3Row(v3Nav('aboutimage'),'fa-image','About image','The picture behind the footer “About” button') : ''));
  if (a32Owner()) html += g('Reports', v3Row(v3Nav('reports'),'fa-bug','Reports inbox','Problems, change requests, ideas', state._a32RepNew||0));
  if (v3IsSuper()) html += g('Logs', v3Row(v3Nav('superlog'),'fa-shield-halved','Superadmin log','Every superadmin change'+(state.a31CanRevert ? ' · revert' : '')) +
    v3Row(a31LogNav('admin'),'fa-user-shield','Activity log · Admin Settings','') + v3Row(a31LogNav('kitchen'),'fa-fire-burner','Activity log · Kitchen Admin','') +
    v3Row(a31LogNav('boat'),'fa-anchor','Activity log · Boat Admin','') + v3Row(a31LogNav('dept'),'fa-people-group','Activity log · Department Admin',''));
  return html;
}
function v3RenderManage(){ $('#main-content').innerHTML = v3Page(v3ManageGroups(), 'manage-root'); }
/** Admin Settings (admin + superadmin): people, leave, reminders, reports. */
function v3RenderAdminHub(){
  const h = v3Home(), hb = h.hodBar || {};
  const g = function(title, rows){ return '<section class="space-y-1.5 min-w-0"><h3 class="v3-section-title px-1">'+title+'</h3><div class="glass rounded-2xl overflow-hidden">'+rows+'</div></section>'; };
  let html = v3Back('more','More');
  html += g('People', v3Row(v3Nav('usersv3'),'fa-users-gear','Users & roles','Give people one or more roles, departments, active') +
    v3Row(v3Nav('users'),'fa-address-book','Staff directory (classic)','Add user, import CSV'));
  html += g('Leave', v3Row("state.leaveTabForce='final';navigate('leave')",'fa-stamp','Leave — final approval','After the HOD step', hb.leaveMgmt||0) +
    v3Row(v3Nav('leavecal'),'fa-calendar-days','Leave calendar','All departments') + v3Row(v3Nav('leavesummary'),'fa-table','Leave summary','Per department'));
  html += g('Communication', v3Row(v3Nav('reminders'),'fa-bell','Reminders','Add, edit, remove') + v3Row(v3Nav('suggestions'),'fa-lightbulb','Suggestions','Approve / reject'));
  html += g('Overview & system', v3Row(v3Nav('adminoverview'),'fa-chart-line','Overview','Meals, approvals, boat load, people') +
    v3Row(v3Nav('admintools'),'fa-screwdriver-wrench','System tools','Alert emails, archive old records, kitchen summaries')); // 3.2.0
  html += g('Reports', v3Row(v3Nav('adminstatus'),'fa-file-arrow-down','Reports & downloads','Meals, boats, leave, users (CSV)') +
    v3Row(a31LogNav('admin'),'fa-clock-rotate-left','Activity log','Users & roles, leave, reminders, suggestions, settings'));
  $('#main-content').innerHTML = v3Page(html, 'adminhub-root');
}
/** Department Admin (HOD / assistant HOD; admin sees every department). */
function v3RenderDeptAdmin(){
  const hb = v3Home().hodBar || {};
  $('#main-content').innerHTML = v3Page(v3Back('more','More') +
    '<p class="text-xs text-slate-400 px-1">'+(v3IsAdmin() ? 'All departments (admin)' : esc(state.user.department||''))+'</p>'+
    v3HodBar()+
    '<div class="grid grid-cols-2 gap-2" id="dept-tiles">'+
      v3Tile(v3Nav('approvals'),'fa-inbox','Approvals','Leave & late meals', (hb.leave||0)+(hb.late||0)+(v3IsAdmin()?(hb.leaveMgmt||0):0))+
      v3Tile(v3Nav('deptstaff'),'fa-users','Department staff','Edit · remove')+
      v3Tile(v3Nav('deptupdatespost'),'fa-bullhorn','Department updates','Post, comments, likes')+
      v3Tile(v3Nav('leavecal'),'fa-calendar-days','Leave calendar','Month view')+
      v3Tile(v3Nav('leavesummary'),'fa-table','Leave summary','Totals & list')+
      v3Tile(v3Nav('mealbehalf'),'fa-star','Meal on behalf','Staff without a phone')+
      v3Tile(a31LogNav('dept'),'fa-clock-rotate-left','Activity log','Who changed what')+'</div>', 'deptadmin-root');
  v3RefreshHome().then(function(){ if (state.tab === 'deptadmin') { const el = $('#v3-hodbar'); if (el) el.outerHTML = v3HodBar(); } }).catch(function(){});
}
async function v3RenderLeaveSummary(){
  $('#main-content').innerHTML = v3Page((state._roleMode === 'admin' ? v3RoleBack('admin') : v3RoleBack('dept')) + '<div id="ls-body">'+v3Card(v3Loading())+'</div>', 'leavesummary-root');
  const d = await v3Call('getHodLeaveSummary', {});
  if (state.tab !== 'leavesummary' || !d) return;
  const rows = d.requests || d.rows || [];
  const counts = d.counts || d.byStatus || {};
  $('#ls-body').innerHTML = v3Card(v3Title('fa-table','Leave · '+esc(d.department||d.deptLabel||'All'))+
    '<div class="grid grid-cols-3 gap-2">'+Object.keys(counts).map(function(k){ return '<div class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2 min-w-0"><p class="text-[10px] text-slate-400 truncate">'+esc(V3_STATUS_TEXT[k]||k)+'</p><p class="text-lg font-semibold text-slate-100">'+counts[k]+'</p></div>'; }).join('')+'</div>'+
    (rows.length ? rows.slice(0, 100).map(function(l){ return '<div class="v3-row py-1.5 border-b border-slate-700/40 last:border-0 text-xs min-w-0"><div class="min-w-0"><p class="text-slate-100 truncate">'+esc(l.userName||l.userEmail)+' · '+esc(l.leaveType||'')+'</p><p class="text-[10px] text-slate-500">'+esc(l.startDate||'')+(l.endDate && l.endDate!==l.startDate?' → '+esc(l.endDate):'')+'</p></div>'+v3Status(l.status)+'</div>'; }).join('') : v3Empty('No leave requests.'))+
    '<button type="button" id="ls-csv" class="w-full rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-download mr-1"></i>Download CSV</button>', 'ls-card');
  $('#ls-csv').onclick = function(){ v3Download('leave-summary-'+fijiDateString()+'.csv', rows); };
}
const v3RenderMealBehalf = function(){ return v3RenderSpecialPage(); };
/** Superadmin: 3.0.0 role migration — preview (no changes), then apply (backs up the Users tab first). */
async function v3RenderMigrate(){
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') + v3Card(v3Title('fa-right-left','Role migration (3.0.0)')+
    '<p class="text-xs text-slate-300">Writes each person\'s roles into the <strong>roles</strong> column from their current role / permissions / assistant HOD flag. Nobody gains or loses a role. Apply makes a copy of the Users tab first.</p>'+
    '<div class="grid grid-cols-2 gap-2"><button type="button" id="mg-preview" class="rounded-xl py-2.5 text-xs border border-teal-500/40 text-teal-200"><i class="fa-solid fa-eye mr-1"></i>Preview</button><button type="button" id="mg-apply" class="rounded-xl py-2.5 text-xs border border-rose-500/40 text-rose-200">Apply…</button></div>', 'mg-card')+'<div id="mg-out"></div>', 'migrate-root');
  const show = function(d){
    const users = d.users || [], changed = users.filter(function(x){ return !x.unchanged; }), shared = users.filter(function(x){ return x.sharedLooking; });
    $('#mg-out').innerHTML = v3Card(v3Title('fa-list', (d.dryRun ? 'Preview' : 'Applied')+' · '+users.length+' accounts with a role', v3Chip(changed.length+' to write', changed.length?'warn':'ok'))+
      (d.backupTab ? '<p class="text-[11px] text-emerald-300">Backup tab: '+esc(d.backupTab)+'</p>' : '')+
      (shared.length ? '<p class="text-[11px] text-amber-200"><i class="fa-solid fa-triangle-exclamation mr-1"></i>'+shared.length+' account(s) look shared (e.g. kitchen@ / boat@) — check they should keep their role.</p>' : '')+
      users.map(function(x){ return '<div class="text-[11px] py-1 border-b border-slate-700/40 last:border-0 min-w-0"><span class="text-slate-100">'+esc(x.name||x.email)+'</span> <span class="text-slate-400">· '+esc(x.department||'—')+(x.active?'':' · inactive')+'</span>'+(x.sharedLooking?' '+v3Chip('shared?','warn'):'')+
        '<br><span class="text-slate-400">'+esc(x.legacy.permissions||x.legacy.role||'')+(String(x.legacy.assistantHod)==='true'?' + asst HOD':'')+'</span> → <span class="text-teal-200">'+esc(x.roles.join(', '))+'</span> <span class="text-slate-500">('+esc((x.buttons||[]).join(', ')||'no buttons')+')</span></div>'; }).join(''), 'mg-list');
  };
  $('#mg-preview').onclick = async function(){ const d = await v3Call('migrateRoles', { dryRun: 1 }); if (d) show(d); };
  $('#mg-apply').onclick = async function(){
    const d0 = await v3Call('migrateRoles', { dryRun: 1 }); if (!d0) return; show(d0);
    if (!confirm('Write the roles column for '+d0.count+' account(s)? A backup copy of the Users tab is made first.')) return;
    const pass = await askPasscode('super', true); if (!pass) return;
    const d = await v3Call('migrateRoles', { dryRun: 0, passcode: pass }, 'Roles written'); if (d) show(d);
  };
}
async function v3RenderUsers(){
  const f = state.uf || { q:'', role:'', dept:'' }; state.uf = f;
  $('#main-content').innerHTML = v3Page((v3IsSuper() ? v3Back('manage','Manage') : v3RoleBack('admin')) +
    '<section class="glass rounded-2xl p-3 space-y-2 min-w-0"><input id="uf-q" class="ui-input w-full" placeholder="Search name or email" value="'+esc(f.q)+'"/>'+
    '<div class="grid grid-cols-2 gap-2"><select id="uf-role" class="ui-input w-full min-w-0"><option value="">All roles</option>'+V3_ROLE_FILTERS.map(function(r){ return '<option value="'+r+'"'+(f.role===r?' selected':'')+'>'+V3_ROLE_LABEL[r]+'</option>'; }).join('')+'<option value="inactive"'+(f.role==='inactive'?' selected':'')+'>Inactive</option></select>'+
    '<select id="uf-dept" class="ui-input w-full min-w-0"><option value="">All departments</option>'+PCR_DEPARTMENTS.map(function(d){ return '<option'+(f.dept===d?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select></div></section>'+
    '<div id="uf-list" class="space-y-2">'+v3Loading()+'</div>', 'users-root');
  const r = await api('getUsers', { activeOnly:false }).catch(function(){ return null; });
  if (state.tab !== 'usersv3') return;
  if (!r || !r.success) { $('#uf-list').innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((r && r.error) || 'Could not load users')+'</p>'); return; }
  const all = r.data.users || [];
  const countBox = r.data.roleCounts ? '<section class="glass rounded-2xl p-3 space-y-2 min-w-0">'+v3Title('fa-users','Role counts')+v3RoleCountChips(r.data.roleCounts)+
    '<p class="text-[10px] text-slate-500">Active accounts. Someone with two roles (e.g. chef + HOD) counts in both. No limits.</p></section>' : '';
  const paint = function(){
    const q = f.q.toLowerCase();
    const list = all.filter(function(u){
      if (q && (u.email+' '+u.firstName+' '+u.lastName+' '+(u.preferredName||'')).toLowerCase().indexOf(q) < 0) return false;
      if (f.dept && u.department !== f.dept) return false;
      if (f.role === 'inactive') return !u.active;
      if (f.role === 'staff') return v3RoleLabel(u) === 'Staff';
      if (f.role && !v3Has(f.role, u)) return false;
      return true;
    });
    $('#uf-list').innerHTML = countBox + '<p class="text-[11px] text-slate-400 px-1">'+list.length+' of '+all.length+' users</p>'+list.slice(0, 200).map(function(u){
      const lab = v3RoleLabel(u), warn = (u.warnings||[]);
      return '<button type="button" class="v3-user w-full text-left glass rounded-xl p-3 min-w-0" data-email="'+esc(u.email)+'"><div class="v3-row"><p class="text-sm text-slate-100 truncate min-w-0">'+esc(fullDisplayName(u))+'</p>'+
        '<span class="flex gap-1 shrink-0">'+(!u.active?v3Chip('inactive','bad'):'')+'</span></div><p class="text-[11px] '+(lab==='Staff'?'text-slate-500':'text-teal-200')+' truncate" data-roles>'+esc(lab)+'</p>'+
        '<p class="text-[11px] text-slate-400 truncate">'+esc(u.email)+' · '+esc(u.department||'—')+'</p>'+
        (warn.length ? '<p class="text-[10px] text-amber-200 mt-1 break-words"><i class="fa-solid fa-triangle-exclamation mr-1"></i>'+esc(warn.join(' · '))+'</p>' : '')+'</button>';
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
  const cur = v3Perms(u).filter(function(x){ return x !== 'staff'; });
  const opts = V3_PERM_OPTIONS;
  const warn = (u.warnings||[]).length ? '<p class="text-amber-200 text-[11px]"><i class="fa-solid fa-triangle-exclamation mr-1"></i>'+esc(u.warnings.join(' · '))+'</p>' : '';
  const permBox = '<div class="space-y-1 min-w-0"><p class="text-[11px] text-slate-400">Roles — tick all that apply (everyone is also staff). Each role adds a button in More.</p><div class="grid grid-cols-2 gap-1" id="eu3-perms">'+opts.map(function(o){
    const top = o[0] === 'admin' || o[0] === 'super_admin', lock = top && !v3IsSuper();
    return '<label class="flex items-center gap-2 text-xs text-slate-200 rounded-lg border border-slate-700/60 px-2 py-1.5 min-w-0'+(lock?' opacity-50':'')+'"><input type="checkbox" class="eu3-perm" value="'+o[0]+'"'+(cur.indexOf(o[0])>=0?' checked':'')+(lock?' disabled':'')+'/> <span class="truncate">'+esc(o[1])+'</span></label>';
  }).join('')+'</div><p class="text-[10px] text-slate-500">Only a superadmin can grant or remove Admin / Superadmin (asks for the superadmin code). Assistant HOD = the same Department Admin page as the HOD.</p></div>';
  const html = '<div class="space-y-3 min-w-0"><h3 class="font-semibold text-slate-100">Edit '+esc(fullDisplayName(u))+'</h3><p class="text-xs text-slate-400 break-all">'+esc(u.email)+'</p>'+warn+permBox+
    '<div class="space-y-1 min-w-0"><label for="eu3-dept" class="text-[11px] text-slate-400">Department</label><select id="eu3-dept" class="ui-input w-full">'+(PCR_DEPARTMENTS.indexOf(u.department) >= 0 || !u.department ? PCR_DEPARTMENTS : [u.department].concat(PCR_DEPARTMENTS)).map(function(d){ return '<option'+(d===u.department?' selected':'')+'>'+esc(d)+'</option>'; }).join('')+'</select></div>'+
    '<label class="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" id="eu3-active"'+(u.active?' checked':'')+'/> Account active</label>'+
    '<div class="flex gap-2 pt-1"><button type="button" id="eu3-cancel" class="flex-1 rounded-xl py-2.5 text-sm border border-slate-600 text-slate-300">Close</button><button type="button" id="eu3-save" class="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold text-white">Save changes</button></div>'+
    '<button type="button" id="v3-msg-user" class="text-teal-300 text-xs mr-4"><i class="fa-solid fa-bell mr-1"></i>Send an in-app notification</button>'+
    (v3IsAdmin() && v3Perms(u).indexOf('super_admin') < 0 ? '<button type="button" id="v3-del-user" class="text-rose-300 text-xs"><i class="fa-solid fa-trash mr-1"></i>Delete this user</button>' : '')+'</div>';
  openModal(html);
  $('#eu3-cancel').onclick = closeModal;
  $('#eu3-save').onclick = async function(){
    const roles = $$('.eu3-perm').filter(function(b){ return b.checked; }).map(function(b){ return b.value; });
    const p = { targetEmail: u.email, active: $('#eu3-active').checked ? 'true' : 'false' };
    const same = roles.slice().sort().join(',') === cur.slice().sort().join(',');
    if (!same) p.roles = roles.length ? roles.join(',') : 'staff';
    const dept = $('#eu3-dept').value;
    if (dept !== u.department) p.department = dept;
    const top = function(l){ return l.filter(function(x){ return x === 'admin' || x === 'super_admin'; }).sort().join(','); };
    if (!same && top(roles) !== top(cur)) { const pass = await askPasscode('super', true); if (!pass) return; p.passcode = pass; }
    this.disabled = true;
    const r = await v3Call('setUserAccess', p, 'Saved');
    this.disabled = false;
    if (r && r.warnings && r.warnings.length) toast(r.warnings[0], 'info');
    if (r) { closeModal(); v3RenderUsers(); }
  };
  $('#v3-msg-user').onclick = function(){
    closeModal();
    v3Form('Notify '+fullDisplayName(u), [{ id:'title', label:'Title', value:'Message from admin', max:100 }, { id:'body', label:'Message', type:'textarea', required:true, max:600 }], 'Send', async function(v){
      const r = await v3Call('adminNotifyUser', { targetEmail: u.email, title: v.title, body: v.body }, 'Notification sent'); return !!r; });
  };
  const del = $('#v3-del-user');
  if (del) del.onclick = async function(){
    if (!confirm('Delete '+u.email+' permanently? Their past orders stay in the sheets.')) return;
    const pass = await askAdminCode(); if (!pass) return; // 3.2.0: admins too (admin code)
    const r = await v3Call('deleteUser', { targetEmail: u.email, passcode: pass }, 'User deleted');
    if (r) { closeModal(); v3RenderUsers(); }
  };
}
async function v3RenderReminders(){
  $('#main-content').innerHTML = v3Page((v3IsSuper() ? v3Back('manage','Manage') : v3RoleBack('admin')) + '<button type="button" id="rm-add" class="btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white"><i class="fa-solid fa-plus mr-1"></i>Add reminder</button><div id="rm-list" class="space-y-2">'+v3Loading()+'</div>', 'reminders-root');
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
  $('#main-content').innerHTML = v3Page((v3IsSuper() ? v3Back('manage','Manage') : v3RoleBack('admin')) +
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-file-arrow-down','Generate reports')+'<div class="grid grid-cols-2 gap-2"><input type="date" id="ex-from" class="ui-input w-full min-w-0" value="'+from+'"/><input type="date" id="ex-to" class="ui-input w-full min-w-0" value="'+to+'"/></div>'+
    '<button type="button" id="ex-go" class="btn-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold">Generate</button><p class="text-[10px] text-slate-400">Passwords are never included. Files are CSV (open in Excel / Google Sheets).</p></section><div id="ex-out"></div>', 'adminstatus-root');
  $('#ex-go').onclick = async function(){
    state.exFrom = $('#ex-from').value; state.exTo = $('#ex-to').value;
    $('#ex-out').innerHTML = v3Card(v3Loading());
    const d = await v3Call('getAdminExport', { from: state.exFrom, to: state.exTo });
    if (!d || state.tab !== 'adminstatus') { const o = $('#ex-out'); if (o) o.innerHTML = ''; return; } // 3.0.1: #ex-out is gone if the page changed
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
async function v3RenderSettings(){
  const s = state.appSettings || {};
  const prov = s.mail_provider === 'brevo' ? 'brevo' : 'mailapp';
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') +
    v3Card(v3Title('fa-key','Verification & reset codes · email sender')+
      '<p class="text-xs text-slate-300"><i class="fa-solid fa-envelope text-teal-300 mr-1"></i>Sign-up and forgot-password codes are <strong>sent by email</strong> to the registered address only — never shown on screen.</p>'+
      '<div class="space-y-1"><label for="st-prov" class="text-[11px] text-slate-400">Send with</label><select id="st-prov" class="ui-input w-full"><option value="mailapp"'+(prov==='mailapp'?' selected':'')+'>Google (the account that runs the script) — default</option><option value="brevo"'+(prov==='brevo'?' selected':'')+'>Brevo email service (API key in Script Properties)</option></select></div>'+
      '<div id="st-g" class="space-y-2'+(prov==='brevo'?' hidden':'')+'"><div class="space-y-1"><label for="st-from" class="text-[11px] text-slate-400">Send from (Gmail “send as” alias · blank = the script account)</label><input id="st-from" type="email" class="ui-input w-full" placeholder="blank = script account" value="'+esc(s.mail_from||'')+'"/></div>'+
      '<p class="text-[10px] text-slate-500">An alias must first be added in that Gmail (Settings → Accounts → Send mail as). If it fails, mail goes from the script account.</p></div>'+
      '<div id="st-b" class="space-y-2'+(prov==='brevo'?'':' hidden')+'"><div class="space-y-1"><label for="st-bmail" class="text-[11px] text-slate-400">Brevo sender address (verified in Brevo)</label><input id="st-bmail" type="email" class="ui-input w-full" value="'+esc(s.brevo_sender_email||'')+'"/></div>'+
      '<p class="text-[11px] '+(s.brevo_key_set?'text-emerald-300':'text-amber-200')+'"><i class="fa-solid '+(s.brevo_key_set?'fa-check':'fa-triangle-exclamation')+' mr-1"></i>'+(s.brevo_key_set?'Brevo API key is set (Script Properties → BREVO_API_KEY)':'No Brevo API key yet — add BREVO_API_KEY in Apps Script → Project settings → Script properties. Until then mail falls back to Google.')+'</p></div>'+
      '<div class="space-y-1"><label for="st-name" class="text-[11px] text-slate-400">Sender name</label><input id="st-name" class="ui-input w-full" maxlength="60" value="'+esc(s.mail_sender_name||'PCR Staff App')+'"/></div>'+
      '<button type="button" id="st-save" class="btn-primary w-full rounded-xl py-2.5 text-sm text-white font-semibold">Save sender</button>'+
      '<div class="pt-2 space-y-2 border-t border-slate-700/60" id="st-test"><p class="text-[11px] text-slate-400" id="st-mailstatus">Email status: checking…</p><div class="flex gap-2"><input id="st-testto" type="email" class="ui-input flex-1 min-w-0" placeholder="Send a test to (blank = me)"/><button type="button" id="st-testgo" class="rounded-xl px-3 text-xs border border-teal-500/40 text-teal-200">Send test</button></div></div>')+
    v3Card(v3Title('fa-rotate-left','Superadmin log · revert owner')+
      '<p class="text-[11px] text-slate-400">Only this superadmin account can undo entries in the Superadmin log. Once set, only that account can change it.</p>'+
      '<div class="flex gap-2"><input id="st-owner" type="email" class="ui-input flex-1 min-w-0" placeholder="owner email" value="'+esc(s.revert_owner_email||'')+'"/><button type="button" id="st-owner-save" class="rounded-xl px-3 text-xs border border-teal-500/40 text-teal-200">Save</button></div>', 'st-owner-card')+
    v3Card(v3Title('fa-toggle-on','Feature flags')+'<div id="admin-body"></div>')+
    v3Card(v3Title('fa-envelope','Alert emails & other tools')+'<button type="button" onclick="openAlertEmails()" class="w-full rounded-xl py-2.5 text-sm border border-slate-600 text-slate-200">Manage alert emails</button>'+
      '<button type="button" onclick="navigate(\'admin\')" class="w-full rounded-xl py-2.5 text-sm border border-slate-600 text-slate-200">Classic admin tools (boat, kitchen, archive)</button>'), 'settings-root');
  $('#st-owner-save').onclick = async function(){
    const v = String($('#st-owner').value||'').trim().toLowerCase();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('Enter a valid email','error'); return; }
    const passcode = await askPasscode('super', true); if (!passcode) return;
    const a = await v3Call('setAppSetting', { key: 'revert_owner_email', value: v, passcode: passcode }, 'Revert owner saved');
    if (a) { state.appSettings = Object.assign({}, state.appSettings, { revert_owner_email: v }); state.a31CanRevert = !!v && v === String(state.user.email).toLowerCase(); state._a32RepAt = 0; }
  };
  $('#st-prov').onchange = function(){ const b = this.value === 'brevo'; $('#st-g').classList.toggle('hidden', b); $('#st-b').classList.toggle('hidden', !b); };
  $('#st-save').onclick = async function(){
    const pv = $('#st-prov').value, from = String($('#st-from').value||'').trim(), bm = String($('#st-bmail').value||'').trim(), name = String($('#st-name').value||'').trim() || 'PCR Staff App';
    const okMail = function(x){ return !x || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); };
    if (!okMail(from) || !okMail(bm)) { toast('Enter a valid email or leave it blank','error'); return; }
    if (pv === 'brevo' && !bm) { toast('Brevo needs a sender address','error'); return; }
    const passcode = await askPasscode('super', true); if (!passcode) return;
    const sets = [['mail_provider', pv], ['mail_from', from], ['brevo_sender_email', bm], ['mail_sender_name', name], ['brevo_sender_name', name]];
    for (let i = 0; i < sets.length; i++) { const a = await v3Call('setAppSetting', { key: sets[i][0], value: sets[i][1], passcode: passcode }, i === sets.length-1 ? 'Sender saved' : null); if (!a) return; }
    state.appSettings = Object.assign({}, state.appSettings, { mail_provider: pv, mail_from: from, brevo_sender_email: bm, mail_sender_name: name, brevo_sender_name: name }); cacheInvalidate(['featureFlags','v3home']);
  };
  $('#st-testgo').onclick = async function(){
    this.disabled = true;
    const r = await api('sendTestEmail', { to: String($('#st-testto').value||'').trim() }).catch(function(){ return null; });
    this.disabled = false;
    if (r && r.success) toast('Test email sent to '+r.data.to+' via '+(r.data.via === 'brevo' ? 'Brevo' : 'Google')+(r.data.warning ? ' · '+r.data.warning : ''),'ok');
    else toast((r && r.error) || 'Test email failed','error');
    if (r && r.data && r.data.mail) paintMail(r.data.mail);
  };
  const paintMail = function(m){ const el = $('#st-mailstatus'); if (!el || !m) return;
    el.innerHTML = 'Email status: sending with <strong class="text-slate-200">'+(m.effective === 'brevo' ? 'Brevo' : 'Google (MailApp)')+'</strong> · Brevo key '+(m.brevoKeySet ? '<span class="text-emerald-300">set</span>' : '<span class="text-amber-200">missing</span>')+' · sender '+esc(m.brevoSender||'')+(m.lastWarning ? '<br><span class="text-amber-200">Last warning: '+esc(m.lastWarning)+'</span>' : ''); };
  api('getSuperDashboard', {}).then(function(r){ const hl = r && r.success && r.data && r.data.health; if (hl && hl.mail) paintMail(hl.mail); else if (hl) paintMail({ effective: hl.mailProvider, brevoKeySet: !!hl.brevoKeySet, brevoSender: hl.mailFrom||'' }); }).catch(function(){});
  try { await renderAdminFeaturesTab(); } catch (e) {}
}
/* ============ 3.2.0: admin Overview + System tools (admins and superadmins) · About image (superadmin) ============ */
function a34Back(){ return v3IsSuper() && state._a34From === 'manage' ? v3Back('manage','Manage') : v3Back('adminhub','Admin Settings'); }
async function a34RenderOverview(){
  const tab = state.tab;
  $('#main-content').innerHTML = v3Page(a34Back() + '<div id="ov-body" class="space-y-4">'+v3Card(v3Loading())+'</div>', 'adminoverview-root');
  let r = null; try { r = await v3ApiShared('getSuperDashboard', {}); } catch (e) {}
  const box = $('#ov-body'); if (!box || state.tab !== tab) return;
  if (!r || !r.success) { box.innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((r && r.error) || 'Could not load the overview')+'</p>'); return; }
  const sec = v3DashSections(r.data || {});
  box.innerHTML = sec.pend + sec.meals + sec.boat + sec.people;
}
async function a34RenderTools(){
  const tab = state.tab;
  $('#main-content').innerHTML = v3Page(a34Back() +
    v3Card(v3Title('fa-envelope','Alert emails')+'<p class="text-[11px] text-slate-400">Who gets the app’s alert emails (one per line).</p><button type="button" id="at-alerts" class="w-full rounded-xl py-2.5 text-sm border border-slate-600 text-slate-200">Manage alert emails</button>', 'at-alerts-card')+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="archive-card">'+v3Title('fa-box-archive','Archive old records')+
      '<p class="text-[11px] text-slate-400">Moves rows older than 60 days from Dinner / Breakfast / Lunch Orders, Boat Bookings and Boat Runs into matching <strong>Archive_</strong> tabs (copy → check → delete). Check the counts first; the real move asks for your '+(v3IsSuper() ? 'superadmin' : 'admin')+' code.</p>'+
      '<div class="flex gap-2 flex-wrap"><button type="button" id="arch-dry" class="rounded-xl px-3 py-2 text-xs border border-slate-600 text-slate-200">Check counts (dry run)</button>'+
      '<button type="button" id="arch-run" class="rounded-xl px-3 py-2 text-xs bg-rose-700/80 text-white hidden">Archive now…</button></div><div id="arch-out" class="text-[11px] text-slate-300"></div></section>'+
    v3Card(v3Title('fa-file-pdf','Kitchen summaries')+'<p class="text-[11px] text-slate-400">Saved dinner summaries (the 8pm snapshot + PDF). Check the automatic save and the Drive folder, or back-fill the last days.</p>'+
      '<div class="flex gap-2 flex-wrap"><button type="button" id="ks-status" class="rounded-xl px-3 py-2 text-xs border border-slate-600 text-slate-200">Check status</button><button type="button" id="ks-backfill" class="rounded-xl px-3 py-2 text-xs border border-teal-500/40 text-teal-200">Back-fill last days</button></div><div id="ks-out" class="text-[11px] text-slate-300 break-words"></div>', 'ks-card'),
    'admintools-root');
  if (state.tab !== tab) return;
  $('#at-alerts').onclick = function(){ openAlertEmails(); };
  bindArchiveCard();
  const out = $('#ks-out');
  $('#ks-status').onclick = async function(){
    out.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Checking…';
    const r = await api('dinnerSummaryStatus', {}).catch(function(){ return null; });
    if (!r || !r.success) { out.innerHTML = '<span class="text-rose-300">'+esc((r && r.error) || 'Failed')+'</span>'; return; }
    const d = r.data || {}, tr = d.triggers;
    out.innerHTML = '<p>Server time '+esc(d.fijiNow||'')+'</p>'+
      '<p>Automatic save: '+(d.triggersError ? '<span class="text-amber-200">'+esc(d.triggersError)+'</span>' : (tr && (tr.length || tr.count) ? '<span class="text-emerald-300">on</span>' : '<span class="text-amber-200">not set</span>'))+'</p>'+
      '<p>Drive folder: '+(d.driveError ? '<span class="text-amber-200">'+esc(d.driveError)+'</span>' : (d.folder ? '<a class="text-teal-300 underline" target="_blank" rel="noopener" href="'+esc(d.folder)+'">open</a>' : '—'))+'</p>'+
      (Array.isArray(d.days) ? '<p>'+d.days.map(function(x){ return esc(x.serviceDate||x.date||'')+(x.saved||x.snapshot ? ' ✓' : ' –'); }).join(' · ')+'</p>' : '');
  };
  $('#ks-backfill').onclick = async function(){
    if (!confirm('Save any missing dinner summaries for the last days? Existing ones are kept.')) return;
    out.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Saving…';
    const r = await api('backfillDinnerSummaries', {}).catch(function(){ return null; });
    if (!r || !r.success) { out.innerHTML = '<span class="text-rose-300">'+esc((r && r.error) || 'Failed')+'</span>'; return; }
    out.innerHTML = (r.data.backfill||[]).map(function(x){ return '<p>'+esc(x.serviceDate)+': '+(x.saved ? 'saved' : x.kept ? 'already saved' : esc(x.error || 'skipped'))+'</p>'; }).join('') || 'Nothing to do.';
    toast('Summaries checked','ok');
  };
}
/* ---- footer credit + About ---- */
const A34_ABOUT_DEFAULT = 'assets/about-default.jpg';
function a34AboutUrl(){ const s = state.appSettings || {}; return String(s.about_image_url || '') || A34_ABOUT_DEFAULT; }
function a34CreditHtml(withVer){
  return '<div class="pcr-credit-wrap no-print" id="pcr-credit">'+
    (withVer ? '<p class="text-[10px] text-slate-500 text-center">PCR Staff App '+esc(APP_VERSION)+(state.backendVersion ? ' · API '+esc(state.backendVersion) : '')+(state.demo ? ' · demo' : '')+'</p>' : '')+
    '<div class="pcr-credit"><span class="pcr-rasta">Made by Pranav Kumar (Group IT Manager)</span></div>'+
    '<button type="button" class="pcr-about-btn" onclick="a34OpenAbout()"><i class="fa-solid fa-circle-info mr-1"></i>About</button></div>';
}
function a34OpenAbout(){
  openModal('<div class="space-y-3 min-w-0" id="about-modal"><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-circle-info text-teal-400 mr-2"></i>About</h3>'+
    '<img id="about-img" src="'+esc(a34AboutUrl())+'" alt="About" class="w-full rounded-xl border border-amber-400/40 object-contain max-h-[70vh] bg-slate-900" onerror="if(this.src.indexOf(\''+A34_ABOUT_DEFAULT+'\')<0){this.src=\''+A34_ABOUT_DEFAULT+'\';}"/>'+
    '<p class="text-[11px] text-slate-400 text-center">PCR Staff App '+esc(APP_VERSION)+' · Made by Pranav Kumar (Group IT Manager)</p>'+
    '<button type="button" onclick="closeModal()" class="w-full rounded-xl py-2.5 text-sm border border-slate-600 text-slate-300">Close</button></div>');
}
/** keeps the credit at the bottom of every page (pages repaint #main-content after loading) */
function a34EnsureCredit(){
  const mc = document.getElementById('main-content'); if (!mc) return;
  const last = mc.lastElementChild;
  if (last && last.id === 'pcr-credit') return;
  const old = document.getElementById('pcr-credit'); if (old && old.parentNode === mc) old.remove();
  mc.insertAdjacentHTML('beforeend', a34CreditHtml(!mc.querySelector('#home-ver')));
}
(function(){
  let t = null;
  const start = function(){
    const mc = document.getElementById('main-content'); if (!mc || mc._a34) return; mc._a34 = true;
    new MutationObserver(function(){ if (t) return; t = setTimeout(function(){ t = null; a34EnsureCredit(); }, 60); }).observe(mc, { childList: true });
    a34EnsureCredit();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
async function a34RenderAboutImage(){
  const cur = String((state.appSettings||{}).about_image_url || '');
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') +
    v3Card(v3Title('fa-image','About image')+'<p class="text-[11px] text-slate-400">Shown when anyone taps “About” at the bottom of a page. The picture is made smaller on this phone, then saved to Drive (like report screenshots).</p>'+
      '<img id="ai-prev" src="'+esc(cur || A34_ABOUT_DEFAULT)+'" alt="About image preview" class="w-full rounded-xl border border-amber-400/40 object-contain max-h-80 bg-slate-900"/>'+
      '<p class="text-[11px] text-slate-400" id="ai-state">'+(cur ? 'Custom image' : 'Default poster')+'</p>'+
      '<input type="file" id="ai-file" accept="image/*" class="hidden"/>'+
      '<div class="grid grid-cols-2 gap-2"><button type="button" id="ai-pick" class="rounded-xl py-2.5 text-sm border border-slate-600 text-slate-200"><i class="fa-solid fa-upload mr-1"></i>Choose image</button>'+
      '<button type="button" id="ai-reset" class="rounded-xl py-2.5 text-sm border border-slate-600 text-slate-300"'+(cur ? '' : ' disabled')+'>Reset to default</button></div>'+
      '<button type="button" id="ai-save" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white hidden">Save this image</button>', 'aboutimage-card'), 'aboutimage-root');
  let data = '';
  $('#ai-pick').onclick = function(){ $('#ai-file').click(); };
  $('#ai-file').onchange = async function(){
    const f = this.files && this.files[0]; if (!f) return;
    try { data = await a32Shrink(f); $('#ai-prev').src = data; $('#ai-state').textContent = 'New image (not saved yet) · '+Math.round(data.length*0.75/1024)+' KB'; $('#ai-save').classList.remove('hidden'); }
    catch (e) { toast('That file is not an image','error'); }
  };
  const done = function(url){ state.appSettings = Object.assign({}, state.appSettings, { about_image_url: url }); cacheInvalidate(['featureFlags']); a34RenderAboutImage(); };
  $('#ai-save').onclick = async function(){
    if (!data) return; this.disabled = true; this.textContent = 'Saving…';
    const r = await v3Call('setAboutImage', { image: data }, 'About image saved');
    if (r) done(r.url || ''); else { this.disabled = false; this.textContent = 'Save this image'; }
  };
  $('#ai-reset').onclick = async function(){
    if (!confirm('Go back to the default About poster?')) return;
    const r = await v3Call('setAboutImage', { reset: true }, 'Back to the default image');
    if (r) done('');
  };
}
/** 3.2.0: dashboard sections (superadmin Home and Admin Settings → Overview). */
function v3DashSections(sd){
    const m = sd.meals || { today:{}, tomorrow:{} }, p = sd.pending || {};
    const stat = function(label, val, sub, tab){ return '<button type="button" '+(tab?'onclick="navigate(\''+tab+'\')"':'')+' class="rounded-xl bg-slate-900/50 border border-slate-700/60 p-2.5 text-left min-w-0"><p class="text-[10px] text-slate-400 truncate">'+label+'</p><p class="text-xl font-semibold text-slate-100">'+val+'</p>'+(sub?'<p class="text-[10px] text-slate-500 truncate">'+sub+'</p>':'')+'</button>'; };
    const totalPending = (p.leaveHod||0)+(p.leaveMgmt||0)+(p.late||0)+(p.special||0);
    const meals = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-meals">'+v3Title('fa-utensils','Meals')+
      '<div class="grid grid-cols-3 gap-2">'+V3_MEALS.map(function(k){ return stat(V3_MEAL_LABEL[k], m.tomorrow[k]||0, 'tomorrow · today '+(m.today[k]||0), 'kitchen'); }).join('')+'</div>'+v3WeeklyChart(sd.weekly)+'</section>';
    const pend = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-pending">'+v3Title('fa-inbox','Waiting for approval', v3Chip(String(totalPending), totalPending?'warn':'mute'))+
      '<div class="grid grid-cols-3 gap-2">'+stat('Leave · HOD', p.leaveHod||0, '', 'approvals')+stat('Leave · final', p.leaveMgmt||0, '', 'approvals')+stat('Off-menu dinners', p.offMenu||0, 'tomorrow', 'offmenu')+
      stat('Late meals', p.late||0, '', 'approvals')+stat('Special meals', p.special||0, '', 'approvals')+stat('Food comments', p.feedback||0, 'new', 'chefcomments')+'</div></section>';
    const boat = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-boat">'+v3Title('fa-ship','Boat load · today & tomorrow')+
      ((sd.boat||[]).length ? sd.boat.map(function(b){ const pct = b.capacity ? Math.min(100, Math.round(b.pax*100/b.capacity)) : 0;
        return '<div class="space-y-1"><div class="v3-row text-xs"><span class="truncate min-w-0 text-slate-200">'+esc(v3DateLabel(b.date))+' '+esc(b.time)+' · '+esc(b.route)+'</span><span class="text-slate-300">'+b.pax+(b.capacity?'/'+b.capacity:'')+'</span></div><div class="v3-bar"><span style="width:'+pct+'%'+(pct>=90?';background:#f59e0b':'')+'"></span></div></div>'; }).join('') : v3Empty('No runs today or tomorrow.'))+'</section>';
    const users = sd.users || {}, hl = sd.health || {};
    const people = '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" id="sa-users">'+v3Title('fa-users','People & app health')+
      '<div class="grid grid-cols-3 gap-2">'+stat('Users', users.total||0, (users.active||0)+' active', 'usersv3')+stat('New this week', users.newThisWeek||0, '', 'usersv3')+stat('Version', esc(String(hl.version||APP_VERSION).replace('-demo','')), state.demo?'demo':'live', 'settings')+'</div>'+
      '<p class="text-[11px] text-slate-400">'+Object.keys(users.byRole||{}).map(function(r){ return esc(V3_ROLE_LABEL[r]||r)+' '+users.byRole[r]; }).join(' · ')+'</p>'+
      '<p class="text-[11px] text-slate-400">Codes: sent by email · '+(hl.mailProvider === 'brevo' ? 'Brevo' : 'Google'+(hl.mailFrom?' ('+esc(hl.mailFrom)+')':''))+' · server time '+esc(v3Ts(hl.fijiNow))+'</p></section>';
    return { pend: pend, meals: meals, boat: boat, people: people };
}
async function v3RenderSuperHome(){
  const paint = function(sd){
    const u = state.user;
    const head = '<section class="glass rounded-2xl p-4 min-w-0" id="v3-greet"><div class="flex items-center gap-3 min-w-0">'+homeAvatarHtml(u)+'<div class="min-w-0"><h2 class="text-lg font-semibold text-slate-100 truncate">Bula, '+esc(displayName(u))+'</h2>'+
      '<p class="text-[11px] text-slate-400">Superadmin · <span id="v3-clock" class="v3-countdown">'+formatFiji()+'</span></p></div></div></section>';
    if (!sd) { $('#main-content').innerHTML = v3Page(head + v3Card(v3Loading()), 'home'); return; }
    const sec = v3DashSections(sd), pend = sec.pend, meals = sec.meals, boat = sec.boat, people = sec.people;
    $('#main-content').innerHTML = v3Page(head + a31SuperNoteHtml() + pend + meals + boat + people + '<p class="text-center text-[10px] text-slate-500" id="home-ver">UI '+APP_VERSION+(state.backendVersion?' · API '+esc(state.backendVersion):'')+(state.demo?' · demo':'')+'</p>', 'home');
    v3StartTicker();
  };
  paint(v3Home().superDash);
  a31MaybeNotice();
  let d = null; try { const r = await v3ApiShared('getSuperDashboard', {}); d = r && r.success ? (r.data || {}) : null; if (r && !r.success) toast(r.error || 'Something went wrong','error'); } catch (e) {}
  if (d && state.tab === 'home') { const cur = v3Home(); cur.superDash = d; cacheSet('v3home', cur); paint(d); renderNav('#bottom-nav'); }
}


/* ============ O. Boat Admin (boat manager / captain / admin) ============ */
async function v3LoadEmergencyInbox(sel){
  let r = null; try { r = await api('getEmergencyTravel', { status:'pending' }); } catch (e) {}
  const box = $(sel); if (!box || !r || !r.success) return;
  const list = ((r.data && r.data.requests) || []).filter(function(x){ return x.status === 'pending'; });
  box.innerHTML = v3Card(v3Title('fa-triangle-exclamation','Emergency travel', v3Chip(String(list.length), list.length?'warn':'mute'))+(list.length ? list.map(function(x){
    return '<div class="rounded-xl border border-slate-700/60 p-2 text-xs space-y-1 min-w-0"><p class="text-slate-100">'+esc(x.userName)+' <span class="text-slate-400">· '+esc(x.department)+'</span></p><p class="text-slate-300">'+esc(x.seats)+' seat(s) · '+esc(x.preferredTime||'—')+'</p><p class="text-slate-400 break-words">'+esc(x.reason)+'</p>'+
      '<div class="grid grid-cols-2 gap-2"><button type="button" class="v3-em rounded-lg py-1.5 btn-primary text-white" data-id="'+esc(x.id)+'" data-s="confirmed">Confirm</button><button type="button" class="v3-em rounded-lg py-1.5 border border-rose-500/40 text-rose-200" data-id="'+esc(x.id)+'" data-s="rejected">Reject</button></div></div>';
  }).join('') : v3Empty('Nothing waiting.')), 'emerg-card');
  $$(sel+' .v3-em').forEach(function(b){ b.onclick = async function(){ const d = await v3Call('reviewEmergencyTravel', { id: b.dataset.id, status: b.dataset.s }, b.dataset.s === 'confirmed' ? 'Confirmed' : 'Rejected'); if (d) v3LoadEmergencyInbox(sel); }; });
}

/** Boat page: today's + upcoming bookings, passenger lists, PDF / Dive PDF, boat tools. */
async function v3RenderBoatAdmin(){
  const from = fijiDateString(), to = fijiDateString(addFijiDays(getFijiNow(), 7));
  const mgr = v3IsBoatManager();
  $('#main-content').innerHTML = v3Page(v3Back('more','More') +
    '<section class="glass rounded-2xl p-3 space-y-2 min-w-0" id="stb-tools">'+v3Title('fa-toolbox','Boat tools')+
    '<div class="grid grid-cols-2 gap-2">'+(mgr ? '<button type="button" id="stb-add" class="btn-primary rounded-xl py-2 text-xs text-white font-semibold"><i class="fa-solid fa-plus mr-1"></i>Add run</button>'+
    '<button type="button" id="stb-dedupe" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-clone mr-1"></i>Remove duplicate runs</button>' : '')+
    '<button type="button" id="stb-copy" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-copy mr-1"></i>Copy today\u2019s pax</button>'+
    '<button type="button" onclick="navigate(\'boatruns\')" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-ship mr-1"></i>Runs & timetable (admin)</button>'+
    '<button type="button" onclick="navigate(\'emergency\')" class="col-span-2 rounded-xl py-2 text-xs border border-amber-500/40 text-amber-200"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Emergency travel requests</button>'+
    '<button type="button" onclick="'+a31LogNav('boat')+'" id="stb-log" class="col-span-2 rounded-xl py-2 text-xs border border-slate-600 text-slate-200"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Activity log — who changed what</button></div></section>'+
    '<div id="stb-list" class="space-y-3">'+v3Loading()+'</div><div id="stb-emerg"></div>', 'boat-station');
  const add = $('#stb-add'); if (add) add.onclick = function(){ openEditBoatRunModal(null); };
  const dd = $('#stb-dedupe'); if (dd) dd.onclick = async function(){ if (!confirm('Hide duplicate runs (same date, time and route)? Bookings stay.')) return; const d = await v3Call('dedupeBoatRuns', {}); if (d) { toast(d.message || 'Done', 'ok'); cacheInvalidate(['boatRuns']); v3RenderBoatAdmin(); } };
  let runs = [], bookings = [];
  try {
    const [r1, r2] = await Promise.all([api('getBoatRuns', { fromDate: from, toDate: to }), api('getBoatBookings', {})]);
    runs = (r1 && r1.success && r1.data && r1.data.runs) || []; bookings = (r2 && r2.success && r2.data && r2.data.bookings) || [];
    if (r1 && !r1.success) toast(r1.error || 'Could not load runs','error');
  } catch (e) { toast('Couldn\u2019t reach the server — try again','error'); }
  if (state.tab !== 'boatadmin') return;
  runs = runs.filter(function(r){ return r.active !== false; }).sort(function(a, b){ return (String(a.date)+String(a.time)).localeCompare(String(b.date)+String(b.time)); });
  $('#stb-copy').onclick = function(){
    const lines = ['PCR boat pax — '+from+' Fiji'];
    runs.filter(function(r){ return String(r.date).slice(0,10) === from; }).forEach(function(r){ lines.push((r.route||'')+' '+(r.time||'')+': '+(r.paxBooked||0)+'/'+(r.capacity||'?')+' pax'); });
    if (lines.length === 1) lines.push('(no runs today)');
    copyPlainText(lines.join('\n'), 'Boat pax copied');
  };
  const byDate = {};
  runs.forEach(function(r){ const d = String(r.date).slice(0,10); (byDate[d] = byDate[d] || []).push(r); });
  const dates = Object.keys(byDate).sort();
  $('#stb-list').innerHTML = dates.length ? dates.map(function(d){
    return '<section class="glass rounded-2xl p-4 space-y-2 min-w-0" data-boat-date="'+esc(d)+'">'+v3Title('fa-calendar-day', esc(v3DateLabel(d))+' <span class="text-[11px] text-slate-400 font-normal">'+esc(d)+'</span>')+
      byDate[d].map(function(r){
        const pax = bookings.filter(function(b){ return String(b.runId) === String(r.id) && b.status !== 'cancelled'; });
        const used = pax.reduce(function(s, b){ return s + Number(b.seats || 1); }, 0), cap = Number(r.capacity || 20);
        const pct = cap ? Math.min(100, Math.round(used * 100 / cap)) : 0;
        return '<details class="rounded-xl border border-slate-700/60 bg-slate-900/40 min-w-0" data-run="'+esc(r.id)+'"'+(d === from ? ' open' : '')+'><summary class="px-3 py-2 cursor-pointer space-y-1"><div class="v3-row text-sm"><span class="truncate min-w-0 text-slate-100">'+esc(r.time||'')+' · '+esc(r.route||'')+'</span><span class="text-xs text-slate-300 shrink-0">'+used+'/'+cap+'</span></div><div class="v3-bar"><span style="width:'+pct+'%'+(pct>=90?';background:#f59e0b':'')+'"></span></div>'+(r.notes?'<p class="text-[10px] text-slate-400">'+esc(r.notes)+'</p>':'')+'</summary>'+
          '<div class="px-3 pb-3 space-y-1.5"><p class="text-[10px] uppercase tracking-wide text-slate-500">Passengers ('+pax.length+' booking'+(pax.length===1?'':'s')+' · '+used+' seat'+(used===1?'':'s')+')</p>'+
          (pax.length ? pax.map(function(b){ return '<div class="v3-row text-xs py-1 border-t border-slate-700/40 min-w-0"><span class="truncate min-w-0 text-slate-100">'+esc(b.userName||b.userEmail)+' <span class="text-slate-400">· '+esc(b.seats||1)+' seat'+(Number(b.seats||1)===1?'':'s')+'</span></span><button type="button" class="v3-bk-cancel shrink-0 text-[11px] text-rose-300" data-id="'+esc(b.id)+'">Cancel</button></div>'; }).join('') : v3Empty('No bookings yet.'))+
          '<div class="grid grid-cols-3 gap-2 pt-1"><button type="button" class="v3-pax-pdf rounded-lg py-1.5 text-[11px] btn-primary text-white" data-id="'+esc(r.id)+'"><i class="fa-solid fa-file-pdf mr-1"></i>Passengers</button><button type="button" class="v3-dive-pdf rounded-lg py-1.5 text-[11px] border border-sky-500/40 text-sky-200" data-id="'+esc(r.id)+'"><i class="fa-solid fa-person-swimming mr-1"></i>Dive PDF</button>'+(mgr ? '<button type="button" class="v3-run-edit rounded-lg py-1.5 text-[11px] border border-slate-600 text-slate-200" data-id="'+esc(r.id)+'">Edit run</button>' : '')+'</div></div></details>';
      }).join('')+'</section>';
  }).join('') : v3Card(v3Empty('No boat runs in the next 7 days.'));
  $$('.v3-pax-pdf').forEach(function(b){ b.onclick = function(){ v3BoatPdf(b.dataset.id, 'Passenger list'); }; });
  $$('.v3-dive-pdf').forEach(function(b){ b.onclick = function(){ v3BoatPdf(b.dataset.id, 'Boat Trip Summary — Dive'); }; });
  $$('.v3-run-edit').forEach(function(b){ b.onclick = function(){ openEditBoatRunModal(runs.find(function(r){ return String(r.id) === b.dataset.id; })); }; });
  $$('.v3-bk-cancel').forEach(function(b){ b.onclick = async function(){ if (!confirm('Cancel this booking?')) return; const d = await v3Call('cancelBoatBooking', { id: b.dataset.id }, 'Booking cancelled'); if (d) { cacheInvalidate(['boatRuns']); v3RenderBoatAdmin(); } }; });
  v3LoadEmergencyInbox('#stb-emerg');
}
const v3RenderBoatStation = v3RenderBoatAdmin;
/** Boat Admin → runs editor: the 2.x Boat screen with the manager / captain tools (only in role mode). */
async function v3RenderBoatRuns(){
  state.tab = 'boat'; // the 2.x screen paints only while the tab is 'boat'; role mode stays 'boat'
  state._roleMode = 'boat';
  const ht = $('#header-title'); if (ht) ht.textContent = 'Boat runs (admin)';
  await renderBoat();
}
async function v3RenderEmergency(){
  $('#main-content').innerHTML = v3Page(v3RoleBack('boat') + '<div id="em-box">'+v3Card(v3Loading())+'</div>', 'emergency-root');
  await v3LoadEmergencyInbox('#em-box');
}
const _v2RenderBoat = renderBoat;
renderBoat = async function(){
  const out = await _v2RenderBoat.apply(this, arguments);
  if (state.tab === 'boat' && state._roleMode === 'boat' && $('#boat-root') && !$('#boat-role-back')) {
    const bar = document.createElement('div'); bar.id = 'boat-role-back'; bar.className = 'space-y-2';
    bar.innerHTML = v3RoleBack('boat') + '<p class="text-[11px] text-teal-200 px-1"><i class="fa-solid fa-anchor mr-1"></i>Boat Admin mode — run and passenger tools are shown. Tap Boat in the bar below for your normal staff view.</p>';
    $('#boat-root').prepend(bar);
  }
  return out;
};
async function v3BoatPdf(runId, title){
  try {
    toast('Preparing PDF…','ok');
    const r = await api('getBoatTripSummary', { runId: runId });
    if (!r || !r.success) { toast((r && r.error) || 'Failed','error'); return; }
    const html = buildBoatTripSummaryHtml(Object.assign({}, r.data, { title: title }));
    await ensureHtml2Pdf();
    const el = document.createElement('div'); el.innerHTML = html;
    const name = (/dive/i.test(title) ? 'dive-trip-' : 'passengers-') + ((r.data.run && r.data.run.date) || 'run') + '.pdf';
    const blob = await html2pdf().set({ margin:8, filename:name, image:{type:'jpeg',quality:0.95}, html2canvas:{scale:2,useCORS:true}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} }).from(el).outputPdf('blob');
    downloadBlob(name, blob); toast('PDF downloaded','ok');
  } catch (e) { toast((e && e.message) || 'PDF failed','error'); }
}
/* ============ 3.1.0: superadmin = admin-only account · activity logs · superadmin log + revert ============ */
const A31_SUPER_NO_TABS = { meals:1, boat:1, bookings:1, history:1, schedule:1 };
const A31_SUPER_TOAST = "Superadmin accounts can't place orders or bookings. Use a staff account.";
const A31_NOTICE = 'Superadmin is now an admin-only account. To order meals, book the boat or apply for leave, please register a separate staff account with a different email.';
const A31_AREA_LABEL = { kitchen:'Kitchen Admin', boat:'Boat Admin', dept:'Department Admin', admin:'Admin Settings', super:'Superadmin' };
const A31_ACTION_LABEL = { setMealTimes:'Meal times changed', saveDinnerMenuItem:'Dinner menu item saved', deleteDinnerMenuItem:'Dinner menu item removed',
  adminCancelMealOrder:'Meal order cancelled', markOrderStatus:'Order status changed', approveLateDinnerOrder:'Late dinner decided', approveLateBreakfastOrder:'Late breakfast decided',
  approveAllLateBreakfast:'Late breakfasts approved', decideMealRequest:'Meal request decided', decideAllMealRequests:'Meal requests decided (all)', markChefFeedback:'Food feedback handled',
  placeSpecialMeal:'Special meal ordered', saveDinnerSummary:'Dinner summary saved', saveBoatRun:'Boat run saved', deleteBoatRun:'Boat run removed', dedupeBoatRuns:'Duplicate runs removed',
  cancelBoatBooking:'Passenger booking cancelled', reviewEmergencyTravel:'Emergency travel decided', decideLeave:'Leave decided', escalateLeave:'Leave escalated',
  approveAllPending:'Approve all', updateDeptStaff:'Staff details changed', removeFromDept:'Removed from department', decideJoinRequest:'Join request decided',
  postDeptUpdate:'Department update posted', deleteDeptUpdate:'Department update removed', placeMealOnBehalf:'Meal on behalf', setUserAccess:'Roles / access changed',
  updateUser:'User edited', addUser:'User added', importUsersCSV:'Users imported', approveUser:'User approved', deleteUser:'User deleted', addReminder:'Reminder added',
  updateReminder:'Reminder edited', completeReminder:'Reminder done', deleteReminder:'Reminder removed', approveSuggestion:'Suggestion approved', rejectSuggestion:'Suggestion rejected',
  setAppSetting:'App setting changed', saveAlertEmails:'Alert emails changed', migrateRoles:'Role migration applied', adminNotifyUser:'Notification sent', sendTestEmail:'Test email sent',
  archiveOldRows:'Old rows archived', uploadRosterParsed:'Roster uploaded', backfillDinnerSummaries:'Summaries back-filled', runMealTick:'Meal tick run', revert:'Reverted' };
function a31CanArea(a){
  if (a === 'kitchen') return v3CanChef();
  if (a === 'boat') return v3HasBoat();
  if (a === 'dept') return v3CanDept();
  if (a === 'admin') return v3IsAdmin();
  if (a === 'super') return v3IsSuper();
  return false;
}
function a31LogNav(area){ return "state.logArea='"+area+"';navigate('adminlog')"; }
function a31SuperNoteHtml(){ return v3IsSuper() ? '<p class="text-[11px] text-amber-200 px-1" id="a31-super-note"><i class="fa-solid fa-circle-info mr-1"></i>'+esc(A31_NOTICE)+'</p>' : ''; }
/** One-time notice for every superadmin (remembered on the server, so other devices don't show it again). */
async function a31MaybeNotice(){
  if (!v3IsSuper() || state._a31NoticeChecked) return;
  state._a31NoticeChecked = true;
  let r = null; try { r = await api('getSuperNotice', {}); } catch (e) { state._a31NoticeChecked = false; return; }
  if (!r || !r.success || !r.data || !r.data.show || !v3IsSuper()) return;
  openModal('<div class="space-y-3 min-w-0" id="a31-notice" role="alertdialog" aria-labelledby="a31-notice-t"><h3 id="a31-notice-t" class="font-semibold text-slate-100"><i class="fa-solid fa-shield-halved text-teal-400 mr-2"></i>Superadmin is now admin-only</h3>'+
    '<p class="text-sm text-slate-200">'+esc(r.data.text || A31_NOTICE)+'</p>'+
    '<button type="button" id="a31-notice-ok" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">OK, got it</button></div>');
  $('#a31-notice-ok').onclick = function(){ closeModal(); };
  try { await api('ackSuperNotice', {}); } catch (e) {} // shown once = remembered (also if closed by tapping outside)
}
function a31Pretty(v){
  if (v === null || v === undefined) return '—';
  const keys = Object.keys(v); if (!keys.length) return '—';
  return keys.slice(0, 12).map(function(k){ return k+': '+(v[k] === '' ? '∅' : String(v[k]).slice(0, 80)); }).join('\n') + (keys.length > 12 ? '\n…' : '');
}
function a31EntryHtml(e, area){
  const before = e.before || [], after = e.after || [];
  const det = after.length ? after.map(function(a, i){ const b = before[i] || {};
    return '<div class="text-[10px] text-slate-400 space-y-0.5"><p class="text-slate-300">'+esc(a.sheet)+' · '+esc(a.key)+' · '+esc(a.kind)+'</p>'+
      '<div class="grid grid-cols-2 gap-2"><pre class="rounded-lg bg-slate-900/60 p-1.5 text-[10px] text-slate-400" style="white-space:pre-wrap;word-break:break-word">Before\n'+esc(a31Pretty(b.v))+'</pre>'+
      '<pre class="rounded-lg bg-slate-900/60 p-1.5 text-[10px] text-slate-200" style="white-space:pre-wrap;word-break:break-word">After\n'+esc(a31Pretty(a.v))+'</pre></div></div>'; }).join('') : '';
  let rev = '';
  if (area === 'super' || e.bySuper) {
    if (e.revertedAt) rev = '<p class="text-[10px] text-emerald-300"><i class="fa-solid fa-rotate-left mr-1"></i>Reverted '+esc(v3Ts(e.revertedAt))+' by '+esc(e.revertedBy)+'</p>';
    else if (e.canRevert) rev = '<button type="button" class="a31-rev rounded-lg px-3 py-1.5 text-[11px] border border-amber-500/40 text-amber-200" data-id="'+esc(e.id)+'"><i class="fa-solid fa-rotate-left mr-1"></i>Revert</button>';
    else if (area === 'super') rev = '<p class="text-[10px] text-slate-500 a31-norev">'+esc(e.revertable ? 'Only the revert owner can revert this' : (e.noRevertReason || "Can't be reverted"))+'</p>';
  }
  return '<article class="glass rounded-2xl p-3 space-y-1.5 min-w-0 a31-entry" data-log="'+esc(e.id)+'" data-action="'+esc(e.action)+'">'+
    '<div class="v3-row"><p class="text-sm font-medium text-slate-100 min-w-0 break-words">'+esc(A31_ACTION_LABEL[e.action] || e.action)+'</p><span class="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">'+esc(v3Ts(e.at))+'</span></div>'+
    '<p class="text-[11px] text-slate-300 break-words">'+esc(e.actorName || e.actorEmail)+' · '+esc(V3_ROLE_LABEL[e.actorRole] || e.actorRole)+(area === 'super' ? ' · '+esc(A31_AREA_LABEL[e.area] || e.area) : '')+'</p>'+
    '<p class="text-xs text-slate-200 break-words">'+esc(e.summary || e.target || '')+'</p>'+
    (det ? '<details><summary class="text-[11px] text-teal-300 cursor-pointer">Before / after</summary><div class="space-y-2 pt-1">'+det+'</div></details>' : '')+rev+'</article>';
}
async function a31RenderLog(){ return a31RenderLogPage(state.logArea || 'admin'); }
async function a31RenderSuperLog(){ return a31RenderLogPage('super'); }
async function a31RenderLogPage(area){
  const tab = state.tab;
  state.a31Off = state.a31Off || {};
  const off = state.a31Off[area] || 0;
  const back = (area === 'super' || v3IsSuper()) ? v3Back(v3IsSuper() ? 'manage' : 'more', v3IsSuper() ? 'Manage' : 'More') : v3RoleBack(area);
  $('#main-content').innerHTML = v3Page(back + '<div id="al-body" class="space-y-2">'+v3Card(v3Loading())+'</div>', 'adminlog-root');
  const ht = $('#header-title'); if (ht) ht.textContent = area === 'super' ? 'Superadmin log' : 'Activity log · '+(A31_AREA_LABEL[area] || area);
  let r = null; try { r = await api('getAdminLog', { area: area, offset: off, limit: 50 }); } catch (e) {}
  const box = $('#al-body'); if (!box || state.tab !== tab) return;
  if (!r || !r.success) { box.innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((r && r.error) || 'Could not load the log')+'</p>'); return; }
  const d = r.data;
  if (area === 'super') state.a31CanRevert = !!d.canRevert;
  let html = '<p class="text-[11px] text-slate-400 px-1" id="al-meta">'+d.total+' change'+(d.total === 1 ? '' : 's')+' · newest first'+
    (area === 'super' ? (d.canRevert ? ' · you can revert' : (d.revertOwnerSet ? ' · only the revert owner can revert' : ' · no revert owner set yet (App settings)')) : '')+'</p>';
  html += d.entries.length ? d.entries.map(function(e){ return a31EntryHtml(e, area); }).join('') : v3Card(v3Empty('No changes logged yet.'));
  if (d.offset > 0 || d.total > d.offset + d.entries.length) html += '<div class="grid grid-cols-2 gap-2">'+
    '<button type="button" id="al-prev" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"'+(d.offset > 0 ? '' : ' disabled')+'>Newer</button>'+
    '<button type="button" id="al-next" class="rounded-xl py-2 text-xs border border-slate-600 text-slate-200"'+(d.total > d.offset + d.entries.length ? '' : ' disabled')+'>Older</button></div>';
  box.innerHTML = html;
  const pv = $('#al-prev'), nx = $('#al-next');
  if (pv) pv.onclick = function(){ state.a31Off[area] = Math.max(0, off - d.limit); a31RenderLogPage(area); };
  if (nx) nx.onclick = function(){ state.a31Off[area] = off + d.limit; a31RenderLogPage(area); };
  $$('#al-body .a31-rev').forEach(function(b){ b.onclick = async function(){
    if (!confirm('Revert this change? The saved "before" state is written back.')) return;
    b.disabled = true;
    const x = await v3Call('revertAdminLog', { id: b.dataset.id }, 'Change reverted');
    b.disabled = false;
    if (x) { cacheInvalidate(['v3home','boatRuns','reminders','featureFlags']); a31RenderLogPage(area); }
  }; });
}
/* ============ 3.1.0: first-time role page guides · Report a problem · superadmin Reports inbox ============ */
const A32_GUIDE_TABS = { kitchenadmin:'kitchen', boatadmin:'boat', deptadmin:'dept', adminhub:'admin', manage:'manage' };
const A32_GUIDES = {
  kitchen: { title:'Kitchen Admin', steps: [
    { icon:'fa-list-check', title:'Order lists & PDFs', body:'Today and tomorrow: who ordered what for breakfast, lunch and dinner. Open “Lists & summaries” for the printable prep list and the saved dinner summary PDF.' },
    { icon:'fa-book-open', title:'Dinner menus', body:'Edit the 7-day dinner menu per weekday: add, rename, reorder, hide or delete dishes. Staff only see the menu of the dinner date.' },
    { icon:'fa-hourglass-half', title:'Late & special requests', body:'Late meal and special meal requests wait here. Approve or decline them; the staff member is told right away.' },
    { icon:'fa-ban', title:'Cancel with a reason', body:'Tap Cancel on an order and give a reason. The reason is saved on the order and the staff member gets a notification.' },
    { icon:'fa-clock', title:'Meal times & cutoffs', body:'Dinner orders close 11:55pm the day before and late requests at 8:00am (editable in Meal times). At the late close pending late requests are approved automatically.' },
    { icon:'fa-clock-rotate-left', title:'Activity log', body:'Every change made here is logged with who and when. Open “Activity log” to see it.' } ] },
  boat: { title:'Boat Admin', steps: [
    { icon:'fa-ship', title:'Runs', body:'Add, edit or remove boat runs (date, time, route, seats). Staff book seats from the Boat tab.' },
    { icon:'fa-users', title:'Passengers', body:'See who is booked on each run, download the passenger PDF and cancel a booking if needed.' },
    { icon:'fa-triangle-exclamation', title:'Emergency travel', body:'Emergency travel requests arrive here. Approve or decline them — the staff member is told straight away.' },
    { icon:'fa-clock-rotate-left', title:'Activity log', body:'Every change on runs, passengers and emergencies is logged with who and when.' } ] },
  dept: { title:'Department Admin', steps: [
    { icon:'fa-inbox', title:'Approvals', body:'Leave requests and late meal requests from your department wait here. Approve or decline; big leave goes on to management for the final OK.' },
    { icon:'fa-people-group', title:'Staff', body:'Your department list: edit details, see who is on leave, remove someone who moved.' },
    { icon:'fa-bullhorn', title:'Updates', body:'Post a short update for everyone in your department. They see it under More → Department updates.' },
    { icon:'fa-utensils', title:'Meal on behalf', body:'Order a meal for a staff member who can’t use the app (for example no phone).' },
    { icon:'fa-clock-rotate-left', title:'Activity log', body:'Every approval and change here is logged with who and when.' } ] },
  admin: { title:'Admin Settings', steps: [
    { icon:'fa-users-gear', title:'Users & roles', body:'Find any account, edit details and give or remove roles (chef, HOD, boat, admin…). One person can hold several roles.' },
    { icon:'fa-stamp', title:'Leave — final approval', body:'Leave that passed the HOD step waits here for the final management decision.' },
    { icon:'fa-bell', title:'Reminders & suggestions', body:'Post reminders for all staff and approve or reject staff suggestions.' },
    { icon:'fa-file-arrow-down', title:'Reports & downloads', body:'Meal and leave reports and CSV downloads.' },
    { icon:'fa-clock-rotate-left', title:'Activity log', body:'Every admin change is logged with who changed what and when.' } ] },
  manage: { title:'Manage (superadmin)', steps: [
    { icon:'fa-shield-halved', title:'Admin-only account', body:'This superadmin account has no staff features (no meal orders, boat bookings or leave). Use a separate staff account for those.' },
    { icon:'fa-users-gear', title:'Users & roles', body:'Give or remove any role, including Admin and Superadmin (asks for the superadmin code). Delete users if needed.' },
    { icon:'fa-eye', title:'Role pages', body:'Open Kitchen, Boat, Department and Admin pages to oversee and manage them.' },
    { icon:'fa-gear', title:'App settings', body:'Email (Brevo), alert emails, meal times, feature switches and the revert owner.' },
    { icon:'fa-bug', title:'Reports', body:'Problems and requests sent with “Report a problem”. Set a status or reply — the sender is notified.' },
    { icon:'fa-rotate-left', title:'Logs & revert', body:'Activity logs per area, and the Superadmin log. Only the revert owner can undo a superadmin change.' } ] }
};
function a32GuideKey(g){ return 'pcr_guide_'+String((state.user && state.user.email) || '').toLowerCase()+'_'+g; }
async function a32MaybeGuide(g){
  if (!A32_GUIDES[g] || !state.user) return;
  try { if (localStorage.getItem('pcr_guides_off') === '1') return; } catch (e) {} // test switch (automated browser tests)
  try { if (localStorage.getItem(a32GuideKey(g)) === '1') return; } catch (e) {}
  if (!state._a32Seen) {
    try { const r = await api('getMyGuides', {}); state._a32Seen = (r && r.success && r.data.seen) || null; } catch (e) { state._a32Seen = null; }
    if (!state._a32Seen) return; // offline: try again next time
  }
  if (state._a32Seen.indexOf(g) >= 0) { try { localStorage.setItem(a32GuideKey(g), '1'); } catch (e) {} return; }
  if (A32_GUIDE_TABS[state.tab] !== g) return;
  const m = $('#modal'); if (m && !m.classList.contains('hidden')) return; // something else is open (e.g. the superadmin notice)
  a32ShowGuide(g);
}
function a32MarkGuide(g){
  try { localStorage.setItem(a32GuideKey(g), '1'); } catch (e) {}
  if (state._a32Seen && state._a32Seen.indexOf(g) < 0) state._a32Seen.push(g);
  api('markGuideSeen', { guide: g }).catch(function(){});
}
function a32ShowGuide(g){
  const G = A32_GUIDES[g]; if (!G) return;
  let step = 0;
  a32MarkGuide(g); // shown once = seen (also when closed by tapping outside)
  function paint(){
    const st = G.steps[step];
    openModal('<div class="space-y-3" id="guide-root" data-guide="'+g+'">'+
      '<p class="text-[10px] uppercase tracking-wide text-teal-400">'+esc(G.title)+' guide · '+(step+1)+' / '+G.steps.length+'</p>'+
      '<h3 class="font-semibold text-lg"><i class="fa-solid '+st.icon+' text-teal-400 mr-2"></i>'+esc(st.title)+'</h3>'+
      '<p class="text-sm text-slate-300">'+esc(st.body)+'</p>'+
      '<div class="flex gap-2 pt-1">'+
      (step > 0 ? '<button type="button" id="guide-back" class="rounded-xl px-3 py-2.5 text-sm text-slate-300 border border-slate-600 min-h-[44px]">Back</button>' : '')+
      (step < G.steps.length-1 ? '<button type="button" id="guide-next" class="btn-primary flex-1 rounded-xl py-2.5 text-sm text-white min-h-[44px]">Next</button>' :
        '<button type="button" id="guide-done" class="btn-primary flex-1 rounded-xl py-2.5 text-sm text-white min-h-[44px]">Got it</button>')+
      '<button type="button" id="guide-skip" class="flex-1 rounded-xl py-2.5 text-sm text-slate-400 border border-slate-600">Skip</button></div>'+
      '<p class="text-[10px] text-slate-500 text-center">Reopen any time with the <i class="fa-solid fa-circle-question"></i> button at the top.</p></div>');
    const n = $('#guide-next'); if (n) n.onclick = function(){ step++; paint(); };
    const b = $('#guide-back'); if (b) b.onclick = function(){ step--; paint(); };
    const d = $('#guide-done'); if (d) d.onclick = function(){ closeModal(); };
    const k = $('#guide-skip'); if (k) k.onclick = function(){ closeModal(); };
  }
  paint();
}
/** Header buttons: "?" (page guide, role pages only) and "Report a problem" (every page, every user). */
function a32HeaderButtons(){
  const lo = $('#btn-logout'); if (!lo || $('#btn-report')) return;
  const mk = function(id, icon, title){ const b = document.createElement('button'); b.type = 'button'; b.id = id; b.title = title; b.setAttribute('aria-label', title);
    b.className = 'text-sand-200/60 hover:text-teal-400 text-sm px-2 py-1'; b.innerHTML = '<i class="fa-solid '+icon+'"></i>'; lo.parentNode.insertBefore(b, lo); return b; };
  mk('btn-guide', 'fa-circle-question', 'Page guide').onclick = function(){ const g = A32_GUIDE_TABS[state.tab]; if (g) a32ShowGuide(g); };
  mk('btn-report', 'fa-flag', 'Report a problem').onclick = function(){ a32OpenReport(); };
}
/** 3.2.0: only the report owner (App setting revert_owner_email, else it@) gets the Reports inbox. The server decides (getReportCount.owner); remembered per account. */
function a32OwnerKey(){ return 'pcr_repowner_' + String((state.user && state.user.email) || '').toLowerCase(); }
function a32Owner(){
  if (!v3IsSuper()) return false;
  const k = a32OwnerKey();
  if (state._a32OwnerFor === k && typeof state._a32Owner === 'boolean') return state._a32Owner;
  try { const v = localStorage.getItem(k); if (v === '1' || v === '0') { state._a32OwnerFor = k; return (state._a32Owner = v === '1'); } } catch (e) {}
  return false;
}
function a32SetOwner(o){ state._a32Owner = !!o; state._a32OwnerFor = a32OwnerKey(); try { localStorage.setItem(a32OwnerKey(), o ? '1' : '0'); } catch (e) {} }
function a32AfterNav(tab){
  a32HeaderButtons();
  if (tab === 'home') a33MaybePrompt(); // 3.2.0 phone notifications
  const g = A32_GUIDE_TABS[tab];
  const gb = $('#btn-guide'); if (gb) gb.classList.toggle('hidden', !g);
  if (g) setTimeout(function(){ a32MaybeGuide(g); }, 900);
  if (v3IsSuper() && (!state._a32RepAt || Date.now() - state._a32RepAt > 60000)) {
    state._a32RepAt = Date.now();
    setTimeout(function(){ api('getReportCount', {}).then(function(r){ if (r && r.success) { const n = r.data['new'] || 0, o = r.data.owner !== false, was = a32Owner(); a32SetOwner(o); if (n !== state._a32RepNew || o !== was) { state._a32RepNew = n; renderNav('#bottom-nav'); if (o !== was && (state.tab === 'more' || state.tab === 'adminhub' || state.tab === 'manage')) navigate(state.tab); } } }).catch(function(){}); }, 1200);
  }
}
/* ---- Report a problem ---- */
/** Shrink a picked image for slow island internet: longest side ≤ 1280px, JPEG, target < ~300 KB. */
function a32Shrink(file){
  return new Promise(function(res, rej){
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      try {
        let out = '', side = 1280, q = 0.62;
        for (let i = 0; i < 4; i++) {
          const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth*k)); c.height = Math.max(1, Math.round(img.naturalHeight*k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', q);
          if (out.length < 400000) break;
          side = Math.round(side * 0.75); q = Math.max(0.4, q - 0.08);
        }
        URL.revokeObjectURL(url); res(out);
      } catch (e) { URL.revokeObjectURL(url); rej(e); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('Not an image')); };
    img.src = url;
  });
}
function a32Device(){
  const n = navigator, sa = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || n.standalone;
  return String(n.userAgent || '').slice(0, 200)+' · '+(window.screen ? screen.width+'x'+screen.height : '')+' · '+(sa ? 'installed app' : 'browser')+(n.onLine === false ? ' · offline' : '');
}
function a32OpenReport(){
  if (!state.user) return;
  const page = state.tab || 'home', imgs = [];
  openModal('<form id="rp31-form" class="space-y-3 min-w-0" novalidate><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-flag text-teal-400 mr-2"></i>Report a problem</h3>'+
    '<label class="block text-xs text-slate-300">Type<select id="rp31-type" class="ui-input w-full mt-1"><option value="problem">Problem / error</option><option value="change">Change request</option><option value="feature">New feature / other</option></select></label>'+
    '<label class="block text-xs text-slate-300">What happened? What should change?<textarea id="rp31-desc" rows="5" maxlength="3000" class="ui-input w-full mt-1" placeholder="Describe it in your own words — what you tapped, what you expected, what you saw."></textarea></label>'+
    '<div class="space-y-1"><label class="inline-flex items-center gap-2 text-xs text-teal-300 cursor-pointer"><i class="fa-solid fa-image"></i><span>Add screenshots (up to 3)</span><input id="rp31-file" type="file" accept="image/*" multiple class="hidden"/></label>'+
    '<div id="rp31-thumbs" class="flex gap-2 flex-wrap"></div></div>'+
    '<p class="text-[10px] text-slate-500">Sent with: page “'+esc(V3_TITLES[page] || page)+'”, app '+esc(APP_VERSION)+', your device and your name.</p>'+
    '<p id="rp31-err" class="text-xs text-rose-300 hidden"></p>'+
    '<div class="flex gap-2"><button type="submit" id="rp31-send" class="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold text-white">Send report</button>'+
    '<button type="button" id="rp31-cancel" class="flex-1 rounded-xl py-2.5 text-sm text-slate-300 border border-slate-600">Cancel</button></div></form>');
  const thumbs = function(){ $('#rp31-thumbs').innerHTML = imgs.map(function(d, i){ return '<div class="relative"><img src="'+d+'" alt="screenshot '+(i+1)+'" class="h-16 w-16 object-cover rounded-lg border border-slate-600"/><button type="button" data-i="'+i+'" class="rp31-x absolute -top-1 -right-1 bg-slate-800 rounded-full h-5 w-5 text-[10px] text-slate-200" aria-label="Remove">×</button></div>'; }).join('');
    $$('#rp31-thumbs .rp31-x').forEach(function(b){ b.onclick = function(){ imgs.splice(Number(b.dataset.i), 1); thumbs(); }; }); };
  const err = function(t){ const e = $('#rp31-err'); if (!e) return; e.textContent = t || ''; e.classList.toggle('hidden', !t); };
  $('#rp31-cancel').onclick = function(){ closeModal(); };
  $('#rp31-file').onchange = async function(ev){
    const files = Array.from(ev.target.files || []);
    for (const f of files) { if (imgs.length >= 3) { err('Up to 3 screenshots.'); break; } try { imgs.push(await a32Shrink(f)); } catch (e) { err('That file is not an image.'); } }
    ev.target.value = ''; thumbs();
  };
  $('#rp31-form').onsubmit = async function(ev){
    ev.preventDefault();
    const desc = $('#rp31-desc').value.trim();
    if (desc.length < 5) { err('Please describe the problem (a few words at least).'); return; }
    const btn = $('#rp31-send'); btn.disabled = true; btn.textContent = imgs.length ? 'Sending (with screenshots)…' : 'Sending…'; err('');
    let r = null; try { r = await api('submitReport', { type: $('#rp31-type').value, description: desc, images: imgs, page: page, appVersion: APP_VERSION, device: a32Device() }); } catch (e) {}
    if (!r || !r.success) { btn.disabled = false; btn.textContent = 'Send report'; err((r && r.error) || 'Could not send — check your connection and try again.'); return; }
    closeModal();
    toast(r.data && r.data.imageError ? 'Report sent (screenshots: '+r.data.imageError+')' : 'Thanks — report sent. You’ll be notified when it’s looked at.', 'success');
    if (v3IsSuper()) { state._a32RepAt = 0; }
  };
}
const A32_STATUS = { 'new':'New', noted:'Noted', in_progress:'In progress', done:'Done' };
const A32_STATUS_CLS = { 'new':'text-amber-200 border-amber-500/40', noted:'text-sky-200 border-sky-500/40', in_progress:'text-teal-200 border-teal-500/40', done:'text-emerald-200 border-emerald-500/40' };
function a32Chip(st){ return '<span class="rounded-full border px-2 py-0.5 text-[10px] shrink-0 '+(A32_STATUS_CLS[st]||'text-slate-300 border-slate-600')+'">'+esc(A32_STATUS[st]||st)+'</span>'; }
function a32Imgs(list){ return (list||[]).length ? '<div class="flex gap-2 flex-wrap">'+list.map(function(im, i){ const src = im.thumb || im.url; return '<a href="'+esc(im.url)+'" target="_blank" rel="noopener"><img src="'+esc(src)+'" alt="screenshot '+(i+1)+'" loading="lazy" class="h-20 w-20 object-cover rounded-lg border border-slate-600"/></a>'; }).join('')+'</div>' : ''; }
async function a32RenderReports(){
  const tab = state.tab; state.a32Filter = state.a32Filter || '';
  $('#main-content').innerHTML = v3Page(v3Back('manage','Manage') + '<div id="rep-body" class="space-y-2">'+v3Card(v3Loading())+'</div>', 'reports-root');
  let r = null; try { r = await api('getReports', { status: state.a32Filter, limit: 50 }); } catch (e) {}
  const box = $('#rep-body'); if (!box || state.tab !== tab) return;
  if (!r || !r.success) { box.innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((r && r.error) || 'Could not load reports')+'</p>'); return; }
  const d = r.data, c = d.counts;
  state._a32RepNew = c['new'] || 0; renderNav('#bottom-nav');
  const f = function(v, l, n){ return '<button type="button" class="rep-f rounded-full px-3 py-1 text-[11px] border '+(state.a32Filter === v ? 'border-teal-500 text-teal-200' : 'border-slate-600 text-slate-300')+'" data-f="'+v+'">'+l+(n !== undefined ? ' '+n : '')+'</button>'; };
  let html = '<div class="flex gap-1.5 flex-wrap" id="rep-filters">'+f('', 'All', c.total)+f('new','New',c['new'])+f('noted','Noted',c.noted)+f('in_progress','In progress',c.in_progress)+f('done','Done',c.done)+'</div>';
  html += d.reports.length ? d.reports.map(function(x){
    return '<article class="glass rounded-2xl p-3 space-y-2 min-w-0 rep-item" data-id="'+esc(x.id)+'">'+
      '<div class="v3-row"><p class="text-sm font-semibold text-slate-100 min-w-0">'+esc(x.typeLabel)+'</p>'+a32Chip(x.status)+'</div>'+
      '<p class="text-[11px] text-slate-300">'+esc(x.userName)+' · '+esc(V3_ROLE_LABEL[x.userRole]||x.userRole)+(x.department ? ' · '+esc(x.department) : '')+' · '+esc(v3Ts(x.createdAt))+'</p>'+
      '<p class="text-sm text-slate-200 whitespace-pre-wrap break-words">'+esc(x.description)+'</p>'+a32Imgs(x.images)+
      '<p class="text-[10px] text-slate-500 break-words">Page: '+esc(x.page)+' · app '+esc(x.appVersion)+' · '+esc(x.device)+'</p>'+
      (x.reply ? '<p class="text-xs text-teal-200 break-words"><i class="fa-solid fa-reply mr-1"></i>'+esc(x.reply)+' <span class="text-slate-500">— '+esc(x.repliedBy)+', '+esc(v3Ts(x.repliedAt))+'</span></p>' : '')+
      '<div class="flex gap-2 items-start"><select class="ui-input text-xs rep-st" aria-label="Status">'+Object.keys(A32_STATUS).map(function(k){ return '<option value="'+k+'"'+(k === x.status ? ' selected' : '')+'>'+A32_STATUS[k]+'</option>'; }).join('')+'</select>'+
      '<textarea rows="1" class="ui-input flex-1 min-w-0 text-xs rep-reply" placeholder="Reply to '+esc(x.userName)+' (optional)"></textarea>'+
      '<button type="button" class="rep-save rounded-xl px-3 py-2 text-xs border border-teal-500/40 text-teal-200">Save</button></div></article>';
  }).join('') : v3Card(v3Empty('No reports here.'));
  box.innerHTML = html;
  $$('#rep-filters .rep-f').forEach(function(b){ b.onclick = function(){ state.a32Filter = b.dataset.f; a32RenderReports(); }; });
  $$('#rep-body .rep-item').forEach(function(a){ const sv = a.querySelector('.rep-save'); sv.onclick = async function(){
    sv.disabled = true;
    const x = await v3Call('updateReport', { id: a.dataset.id, status: a.querySelector('.rep-st').value, reply: a.querySelector('.rep-reply').value.trim() }, 'Saved — the sender was notified');
    sv.disabled = false; if (x) a32RenderReports();
  }; });
}
async function a32RenderMyReports(){
  const tab = state.tab;
  $('#main-content').innerHTML = v3Page(v3Back('more','More') + '<button type="button" onclick="a32OpenReport()" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white"><i class="fa-solid fa-flag mr-1"></i>Report a problem</button><div id="myrep-body" class="space-y-2">'+v3Card(v3Loading())+'</div>', 'myreports-root');
  let r = null; try { r = await api('getMyReports', {}); } catch (e) {}
  const box = $('#myrep-body'); if (!box || state.tab !== tab) return;
  if (!r || !r.success) { box.innerHTML = v3Card('<p class="text-sm text-rose-300">'+esc((r && r.error) || 'Could not load')+'</p>'); return; }
  box.innerHTML = r.data.reports.length ? r.data.reports.map(function(x){
    return '<article class="glass rounded-2xl p-3 space-y-1.5 min-w-0"><div class="v3-row"><p class="text-sm font-medium text-slate-100">'+esc(x.typeLabel)+'</p>'+a32Chip(x.status)+'</div>'+
      '<p class="text-[10px] text-slate-400">'+esc(v3Ts(x.createdAt))+'</p><p class="text-xs text-slate-200 whitespace-pre-wrap break-words">'+esc(x.description)+'</p>'+
      (x.reply ? '<p class="text-xs text-teal-200 break-words"><i class="fa-solid fa-reply mr-1"></i>'+esc(x.reply)+'</p>' : '')+'</article>';
  }).join('') : v3Card(v3Empty('You haven’t sent any reports.'));
}
/* ============ 3.2.0: phone notifications (standard Web Push / VAPID, no Firebase) ============ */
function a33Supported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function a33IsIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function a33Standalone(){ return !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true); }
function a33K(k){ return 'pcr_push_'+k+'_'+String((state.user && state.user.email) || '').toLowerCase(); }
function a33Bytes(s){ s = String(s).replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '='; const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function a33Idb(mode, fn){
  return new Promise(function(resolve){
    try {
      const rq = indexedDB.open('pcr-push', 1);
      rq.onupgradeneeded = function(){ rq.result.createObjectStore('cfg'); };
      rq.onerror = function(){ resolve(null); };
      rq.onsuccess = function(){ try { const tx = rq.result.transaction('cfg', mode), st = tx.objectStore('cfg'), r = fn(st); tx.oncomplete = function(){ resolve(r && r.result !== undefined ? r.result : true); }; tx.onerror = function(){ resolve(null); }; } catch (e) { resolve(null); } };
    } catch (e) { resolve(null); }
  });
}
async function a33Reg(){
  if (!('serviceWorker' in navigator)) return null;
  const t = new Promise(function(r){ setTimeout(function(){ r(null); }, 10000); });
  return Promise.race([navigator.serviceWorker.ready, t]);
}
async function a33Sub(){ const reg = await a33Reg(); return reg ? { reg: reg, sub: await reg.pushManager.getSubscription() } : { reg: null, sub: null }; }
function a33SameKey(sub, key){
  try { const k = sub && sub.options && sub.options.applicationServerKey; if (!k) return true; const a = new Uint8Array(k), b = a33Bytes(key); if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; } catch (e) { return true; }
}
/** Turn phone notifications on for this device (interactive = may ask the permission question). */
async function a33Enable(interactive){
  if (state.demo) { if (interactive) toast('Phone notifications are not available in the demo','error'); return false; }
  if (!a33Supported()) { if (interactive) { if (a33IsIOS() && !a33Standalone()) a33IosHelp(); else toast('This browser can’t show phone notifications','error'); } return false; }
  let perm = Notification.permission;
  if (perm === 'default') { if (!interactive) return false; try { perm = await Notification.requestPermission(); } catch (e) { perm = 'default'; } }
  if (perm !== 'granted') { if (interactive) toast(perm === 'denied' ? 'Notifications are blocked for this app — allow them in the phone / browser settings, then try again.' : 'Notifications were not turned on','error'); return false; }
  const cfg = await api('getPushConfig', {}).catch(function(){ return null; });
  if (!cfg || !cfg.success) { if (interactive) toast('Couldn’t reach the server — try again','error'); return false; }
  const x = await a33Sub(); if (!x.reg) { if (interactive) toast('The app isn’t fully installed yet — reload and try again','error'); return false; }
  let sub = x.sub;
  try {
    if (sub && !a33SameKey(sub, cfg.data.publicKey)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await x.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: a33Bytes(cfg.data.publicKey) });
  } catch (e) { if (interactive) toast('Couldn’t turn on notifications: '+((e && e.message) || e),'error'); return false; }
  const r = await api('pushSubscribe', { endpoint: sub.endpoint, userAgent: String(navigator.userAgent || '').slice(0, 200) }).catch(function(){ return null; });
  if (!r || !r.success) { if (interactive) toast((r && r.error) || 'Couldn’t register this phone — try again','error'); return false; }
  const scope = x.reg.scope;
  await a33Idb('readwrite', function(st){ return st.put({ api: API_URL, subId: r.data.subId, key: r.data.key, email: state.user.email, endpoint: sub.endpoint }, scope); });
  state._a33Device = true;
  return true;
}
async function a33DisableDevice(){
  const x = await a33Sub();
  if (x.sub) { const ep = x.sub.endpoint; try { await api('pushUnsubscribe', { endpoint: ep }); } catch (e) {} try { await x.sub.unsubscribe(); } catch (e) {} }
  if (x.reg) { const scope = x.reg.scope; await a33Idb('readwrite', function(st){ return st.delete(scope); }); }
  state._a33Device = false;
}
async function a33DeviceOn(){
  if (!a33Supported() || state.demo || Notification.permission !== 'granted') return false;
  const x = await a33Sub(); if (!x.sub || !x.reg) return false;
  const scope = x.reg.scope;
  const cfg = await a33Idb('readonly', function(st){ return st.get(scope); });
  return !!(cfg && cfg.email && state.user && String(cfg.email).toLowerCase() === String(state.user.email).toLowerCase() && cfg.endpoint === x.sub.endpoint);
}
function a33IosHelp(){
  openModal('<div class="space-y-3" id="a33-ios"><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-mobile-screen text-teal-400 mr-2"></i>iPhone: add the app to your Home Screen first</h3>'+
    '<p class="text-sm text-slate-300">On iPhone, notifications only work for apps on the Home Screen (iOS 16.4 or newer).</p>'+
    '<ol class="text-sm text-slate-200 list-decimal pl-5 space-y-1"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open the app from the new icon, sign in, and turn on notifications (More → Phone notifications).</li></ol>'+
    '<button type="button" id="a33-ios-ok" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">OK</button></div>');
  $('#a33-ios-ok').onclick = function(){ closeModal(); };
}
/** After login (Home): offer notifications once; re-register silently if already allowed. */
async function a33MaybePrompt(){
  if (state.demo || !state.user || state._a33Prompted) return;
  state._a33Prompted = true;
  await new Promise(function(r){ setTimeout(r, 2500); });
  const cfg = await api('getPushConfig', {}).catch(function(){ return null; });
  if (!cfg || !cfg.success) { state._a33Prompted = false; return; }
  if (!cfg.data.on) return; // turned off for this account
  const supported = a33Supported();
  if (supported && Notification.permission === 'granted') { if (!(await a33DeviceOn())) a33Enable(false); return; }
  if (supported && Notification.permission === 'denied') return;
  const ios = a33IsIOS() && !a33Standalone();
  if (!supported && !ios) return;
  try { const later = Number(localStorage.getItem(a33K('later')) || 0); if (later && Date.now() - later < 7 * 86400000) return; } catch (e) {}
  for (let i = 0; i < 6; i++) { const m = $('#modal'); if (!m || m.classList.contains('hidden')) break; await new Promise(function(r){ setTimeout(r, 4000); }); }
  const m = $('#modal'); if ((m && !m.classList.contains('hidden')) || !state.user) { state._a33Prompted = false; return; }
  openModal('<div class="space-y-3" id="a33-prompt"><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-bell text-teal-400 mr-2"></i>Get notifications on this phone?</h3>'+
    '<p class="text-sm text-slate-300">We’ll tell you when your meal, leave or boat booking is approved, changed or cancelled — and remind you 1 hour before meal orders close if you haven’t ordered.</p>'+
    (ios ? '<p class="text-xs text-amber-200"><i class="fa-solid fa-circle-info mr-1"></i>On iPhone, first add this app to your Home Screen (Share → Add to Home Screen) and open it from the icon.</p>' : '')+
    '<div class="flex gap-2"><button type="button" id="a33-yes" class="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold text-white">'+(ios ? 'Show me how' : 'Turn on')+'</button>'+
    '<button type="button" id="a33-later" class="flex-1 rounded-xl py-2.5 text-sm text-slate-300 border border-slate-600">Not now</button></div>'+
    '<p class="text-[10px] text-slate-500 text-center">Change it any time: More → Phone notifications.</p></div>');
  $('#a33-later').onclick = function(){ try { localStorage.setItem(a33K('later'), String(Date.now())); } catch (e) {} closeModal(); };
  $('#a33-yes').onclick = async function(){
    if (ios) { a33IosHelp(); return; }
    closeModal();
    const ok = await a33Enable(true);
    if (ok) toast('Notifications are on for this phone','success'); else { try { localStorage.setItem(a33K('later'), String(Date.now())); } catch (e) {} }
  };
}
async function a33RenderSettings(){
  const tab = state.tab;
  $('#main-content').innerHTML = v3Page(v3Back('more','More') + '<div id="ps-body" class="space-y-3">'+v3Card(v3Loading())+'</div>', 'push-root');
  const cfg = state.demo ? { success: true, data: { on: true, devices: 0 } } : await api('getPushConfig', {}).catch(function(){ return null; });
  const dev = await a33DeviceOn();
  const box = $('#ps-body'); if (!box || state.tab !== tab) return;
  const on = !!(cfg && cfg.success && cfg.data.on), supported = a33Supported(), perm = supported ? Notification.permission : 'unsupported';
  const ios = a33IsIOS() && !a33Standalone();
  let devTxt = dev ? '<span class="text-emerald-300">On</span>' : (state.demo ? 'Not available in the demo' : (!supported ? (ios ? 'iPhone: add the app to your Home Screen first' : 'This browser can’t show notifications') : (perm === 'denied' ? '<span class="text-rose-300">Blocked in the phone / browser settings</span>' : 'Off')));
  const u = state.user || {};
  const what = ['Your meal, leave and boat booking approved / declined / changed / cancelled', 'Replies to your problem reports and messages from admin', 'A reminder 1 hour before breakfast, lunch and dinner orders close — only if you haven’t ordered'];
  if (v3CanDept()) what.push('Department: new leave and late meal requests');
  if (v3IsAdmin()) what.push('Admin: leave waiting for final approval');
  if (v3CanChef()) what.push('Kitchen: late / special meal requests, summary saved at the cutoff');
  if (v3HasBoat()) what.push('Boat: new bookings, cancellations, emergency travel');
  if (v3IsSuper()) { what.length = 0; if (a32Owner()) what.push('New problem reports'); what.push('Messages to you', 'Replies to reports you sent'); }
  let html = v3Card('<div class="space-y-2"><div class="v3-row"><p class="text-sm text-slate-100">This phone</p><p class="text-sm" id="ps-dev">'+devTxt+'</p></div>'+
      (dev ? '<button type="button" id="ps-off" class="w-full rounded-xl py-2 text-sm border border-slate-600 text-slate-200">Turn off for this phone</button>' :
        (supported && perm !== 'denied' && !state.demo ? '<button type="button" id="ps-on" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white">Turn on for this phone</button>' : '')+
        (ios ? '<button type="button" id="ps-ios" class="w-full rounded-xl py-2 text-sm border border-teal-500/40 text-teal-200">How to add to the Home Screen</button>' : ''))+
      (dev ? '<button type="button" id="ps-test" class="w-full rounded-xl py-2 text-sm border border-teal-500/40 text-teal-200">Send me a test notification</button>' : '')+'</div>') +
    v3Card('<label class="flex items-center justify-between gap-3"><span class="text-sm text-slate-100">Send phone notifications to me<br/><span class="text-[11px] text-slate-400">All your phones. Off = nothing is sent.</span></span><input type="checkbox" id="ps-acc" class="h-5 w-5 accent-teal-500"'+(on ? ' checked' : '')+(state.demo ? ' disabled' : '')+'/></label>'+
      (cfg && cfg.success && cfg.data.devices ? '<p class="text-[11px] text-slate-400 mt-1">'+cfg.data.devices+' phone'+(cfg.data.devices === 1 ? '' : 's')+' registered</p>' : '')) +
    v3Card('<p class="text-xs font-semibold text-slate-200 mb-1">What you’ll get</p><ul class="text-xs text-slate-300 list-disc pl-5 space-y-0.5">'+what.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join('')+'</ul>'+
      '<p class="text-[11px] text-slate-500 mt-2">iPhone: works only when the app was added to the Home Screen (iOS 16.4+) and opened from its icon. Android: Chrome, allow notifications when asked.</p>') +
    (v3IsSuper() ? '<div id="ps-status"></div>' : '');
  box.innerHTML = html;
  const again = function(){ if (state.tab === tab) a33RenderSettings(); };
  const bOn = $('#ps-on'); if (bOn) bOn.onclick = async function(){ bOn.disabled = true; bOn.textContent = 'Turning on…'; const ok = await a33Enable(true); if (ok) toast('Notifications are on for this phone','success'); again(); };
  const bOff = $('#ps-off'); if (bOff) bOff.onclick = async function(){ bOff.disabled = true; await a33DisableDevice(); toast('Turned off for this phone','success'); again(); };
  const bIos = $('#ps-ios'); if (bIos) bIos.onclick = a33IosHelp;
  const bT = $('#ps-test'); if (bT) bT.onclick = async function(){ bT.disabled = true; const d = await v3Call('pushTest', {}, 'Test sent — it should appear in a few seconds'); bT.disabled = false; };
  const acc = $('#ps-acc'); if (acc) acc.onchange = async function(){ const d = await v3Call('setPushPref', { on: acc.checked }, acc.checked ? 'Phone notifications on' : 'Phone notifications off'); if (!d) acc.checked = !acc.checked; };
  if (v3IsSuper() && !state.demo) api('pushStatus', {}).then(function(r){ const el = $('#ps-status'); if (el && r && r.success) el.innerHTML = v3Card('<p class="text-[11px] text-slate-400">Push service: '+(r.data.keys ? 'keys ready' : 'no keys yet')+' · reminder timer '+(r.data.trigger ? 'on' : 'not installed yet')+(r.data.lastTick ? ' (last run '+esc(v3Ts(r.data.lastTick))+')' : '')+' · '+r.data.devices+' phones, '+r.data.users+' people</p>'); }).catch(function(){});
}
/* logout: this phone stops getting the previous person's notifications */
const _v32Logout = doLogout;
doLogout = function(){
  if (state.user && !state.demo && a33Supported()) { a33DisableDevice().catch(function(){}); }
  state._a33Prompted = false;
  return _v32Logout.apply(this, arguments);
};
/* tapping a notification while the app is open: go to that page */
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function(e){
  if (!e.data || e.data.type !== 'PCR_OPEN' || !state.user) return;
  let t = 'notifications'; try { t = (new URL(e.data.url).hash || '').replace('#', '') || 'notifications'; } catch (x) {}
  navigate(V3_TITLES[t] ? t : 'notifications');
});
/* demo mode: the same Admin31.gs rules run around every demo action (block · snapshot · log) */
const _v30DemoApiCore = demoApiCore;
demoApiCore = async function(action, p){
  p = Object.assign({}, p || {});
  const me = v3DemoMe();
  if (!me || action === 'login') return _v30DemoApiCore(action, p);
  const own = await v3DemoRun(function(srv){ return srv.routeAdmin31(action, Object.assign({}, p, { requesterEmail: me })); });
  if (own) return own;
  let c = null;
  const blocked = await v3DemoRun(function(srv){ c = srv.a31Pre(action, Object.assign({}, p, { requesterEmail: me, logArea: state._roleMode || '' })); return c.blocked || null; });
  if (blocked) return blocked;
  const res = await _v30DemoApiCore(action, p);
  if (c && c.log && res && res.success !== false) await v3DemoRun(function(srv){ srv.a31Post(c, JSON.parse(JSON.stringify(res))); return null; });
  return res;
};
/* ============ N. start ============ */
boot();
