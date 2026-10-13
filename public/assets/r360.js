/* 3.6.0 (Pranav): Order on behalf (D) + Late meal request (E) — dinner only. Loaded after v3.js. */
function r36Back(){ return state._mbBack ? v3Back(state._mbBack, state._mbBack === 'kitchenadmin' ? 'Kitchen Admin' : (state._mbBack === 'deptadmin' ? 'Department' : 'Home')) : v3Back('home','Home'); }
function r36FmtDate(sd){ try { return new Date(sd+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}); } catch(e){ return sd; } }
function r36PersonFields(w){
  const ppl = (w.people||[]).map(function(p){ return '<option value="'+esc(p.email)+'">'+esc(p.name)+(w.anyDept?' · '+esc(p.department):'')+'</option>'; }).join('');
  const depts = w.anyDept ? (w.departments||[]).map(function(d){ return '<option'+(d===w.myDept?' selected':'')+'>'+esc(d)+'</option>'; }).join('') : '<option>'+esc(w.myDept)+'</option>';
  return '<label class="block text-xs text-slate-300">Who is it for?<select id="r36-who" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm"><option value="">— Someone not on the app (type name) —</option>'+ppl+'</select></label>'+
    '<div id="r36-free" class="space-y-2"><label class="block text-xs text-slate-300">Name<input id="r36-name" maxlength="60" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm" placeholder="Full name"></label>'+
    '<label class="block text-xs text-slate-300">Department<select id="r36-dept" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm">'+depts+'<option value="__contractor">Contractor</option></select></label></div>';
}
function r36BindPerson(){ const s = $('#r36-who'); const f = function(){ $('#r36-free').classList.toggle('hidden', !!s.value); }; s.onchange = f; f(); }
function r36PersonPayload(){
  const em = $('#r36-who').value; if (em) return { targetEmail: em };
  const d = $('#r36-dept').value;
  return d === '__contractor' ? { guestName: $('#r36-name').value.trim(), guestType: 'contractor' } : { guestName: $('#r36-name').value.trim(), department: d };
}
async function r36DishOptions(sd){
  const m = await api('getDinnerMenus', { serviceDate: sd, includePreviousDay:false }).catch(function(){ return null; });
  const items = ((m && (m.data||m).items) || []).map(function(i){ return String(i.itemName||i.name||''); }).filter(Boolean);
  return items.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
}
async function r36RenderBehalf(){
  $('#main-content').innerHTML = v3Page(r36Back()+'<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="r36-behalf">'+v3Title('fa-star','Order on behalf')+'<div id="r36-body">'+v3Loading()+'</div></section>', 'behalf-root');
  const w = await v3Call('getLateWindow', {});
  if (state.tab !== 'mealbehalf' || !w) return;
  if (!w.behalfOpen) { $('#r36-body').innerHTML = '<p class="text-sm text-amber-200">Tomorrow\'s dinner closed at 11:55pm. Use <button type="button" class="underline" onclick="navigate(\'latemeal\')">Late meal request</button>.</p>'; return; }
  const dishes = await r36DishOptions(w.behalfServiceDate);
  if (state.tab !== 'mealbehalf') return;
  $('#r36-body').innerHTML = '<p class="text-[11px] text-slate-400">Dinner for <b>'+esc(r36FmtDate(w.behalfServiceDate))+'</b> · closes 11:55pm tonight · approved straight away and marked "ordered by '+esc(fullDisplayName(state.user))+'" on the chef\'s lists.</p>'+
    r36PersonFields(w)+'<label class="block text-xs text-slate-300">Dish<select id="r36-dish" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm">'+dishes+'</select></label>'+
    '<label class="block text-xs text-slate-300">Note for the chef (optional)<input id="r36-note" maxlength="120" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm"></label>'+
    '<button type="button" id="r36-go" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white"><i class="fa-solid fa-check mr-1"></i>Place order</button>';
  r36BindPerson();
  $('#r36-go').onclick = async function(){ const b = this; b.disabled = true;
    const d = await v3Call('placeOrderOnBehalf', Object.assign(r36PersonPayload(), { mealChoice: $('#r36-dish').value, specialNote: $('#r36-note').value }), 'Dinner ordered');
    b.disabled = false; if (d) r36RenderBehalf(); };
}
async function r36RenderLate(){
  $('#main-content').innerHTML = v3Page(r36Back()+'<section class="glass rounded-2xl p-4 space-y-3 min-w-0" id="r36-late">'+v3Title('fa-clock','Late meal request')+'<div id="r36-body">'+v3Loading()+'</div></section>'+
    '<section class="glass rounded-2xl p-4 space-y-2 min-w-0">'+v3Title('fa-list','Late requests I sent')+'<div id="r36-list">'+v3Loading()+'</div></section>', 'late-root');
  const w = await v3Call('getLateWindow', {});
  if (state.tab !== 'latemeal' || !w) return;
  const lst = v3Call('getMealRequests', { days: 2 });
  if (!w.open) $('#r36-body').innerHTML = '<p class="text-sm text-slate-300">Late requests open after the 11:55pm cutoff and close at 4pm on the dinner day. Before the cutoff use <button type="button" class="underline" onclick="navigate(\'mealbehalf\')">Order on behalf</button>.</p>';
  else {
    const dishes = w.pick ? await r36DishOptions(w.serviceDate) : '';
    $('#r36-body').innerHTML = '<p class="text-[11px] text-slate-400">Dinner for <b>'+esc(r36FmtDate(w.serviceDate))+'</b> · needs the chef or an admin to approve · open until 4pm.</p>'+r36PersonFields(w)+
      (w.pick ? '<label class="block text-xs text-slate-300">Dish (menu choice until 1pm)<select id="r36-dish" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm">'+dishes+'</select></label>'
              : '<p class="text-xs text-amber-200 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">After 1pm: <b>'+esc(w.leftover)+'</b></p>')+
      '<label class="block text-xs text-slate-300">Reason<input id="r36-reason" maxlength="300" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-sm" placeholder="e.g. arrived on the late boat"></label>'+
      '<button type="button" id="r36-go" class="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold text-white"><i class="fa-solid fa-paper-plane mr-1"></i>Send to chef</button>';
    r36BindPerson();
    $('#r36-go').onclick = async function(){ const b = this; b.disabled = true;
      const d = await v3Call('requestLateOnBehalf', Object.assign(r36PersonPayload(), { mealChoice: w.pick ? $('#r36-dish').value : '', reason: $('#r36-reason').value }), 'Sent to the chef');
      b.disabled = false; if (d) r36RenderLate(); };
  }
  const d = await lst; if (state.tab !== 'latemeal') return;
  const me = String(state.user.email).toLowerCase();
  const rows = ((d && d.requests) || []).filter(function(x){ return String(x.requestedBy).toLowerCase() === me && x.kind === 'late'; });
  $('#r36-list').innerHTML = rows.length ? '<div class="space-y-2">'+rows.map(function(x){ return v3RequestCard(x, false); }).join('')+'</div>' : v3Empty('None yet.');
}
v3RenderSpecialPage = r36RenderBehalf;
