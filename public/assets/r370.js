/* 3.7.0 (Pranav): duplicate accounts (People & roles), chef "Share tonight's count", phone cache helpers. Loaded after r360.js. */
async function r37OpenDups(){
  openModal('<div class="space-y-3 min-w-0" id="r37-dups"><h3 class="font-semibold text-slate-100"><i class="fa-solid fa-clone mr-1"></i>Duplicate accounts</h3><div id="r37-dl">'+v3Loading()+'</div></div>');
  const d = await v3Call('findDuplicateAccounts', {});
  const host = $('#r37-dl'); if (!host) return;
  const g = (d && d.groups) || [];
  if (!g.length) { host.innerHTML = v3Empty('No likely duplicates.'); return; }
  host.innerHTML = '<p class="text-[11px] text-slate-400">Keep one account: its orders, boat bookings and leave stay; the other one’s move over and it is switched off. Logged in the Activity log.</p>'+
    g.map(function(x, gi){ return '<article class="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 space-y-2 min-w-0"><p class="text-[10px] uppercase tracking-wide '+(x.kind==='same_email'?'text-rose-300':'text-amber-300')+'">'+(x.kind==='same_email'?'Same email':'Same name + department · check first')+'</p>'+
      x.users.map(function(u, ui){ return '<label class="flex items-start gap-2 text-xs text-slate-200 min-w-0"><input type="radio" name="r37k'+gi+'" value="'+esc(u.id)+'"'+(ui===0?' checked':'')+'><span class="min-w-0 break-words"><b>'+esc(u.name||'—')+'</b> · '+esc(u.email)+' · '+esc(u.department)+(u.active?'':' · <span class="text-rose-300">inactive</span>')+'<br><span class="text-slate-500">created '+esc(String(u.createdAt).slice(0,10))+' · '+esc(u.role||'')+'</span></span></label>'; }).join('')+
      '<button type="button" class="r37-merge w-full rounded-lg py-2 text-xs border border-teal-500/40 text-teal-200" data-g="'+gi+'">Keep the ticked one, merge the other'+(x.users.length>2?'s':'')+' into it</button></article>'; }).join('');
  host.querySelectorAll('.r37-merge').forEach(function(b){ b.onclick = async function(){
    const x = g[+b.dataset.g], keep = (host.querySelector('input[name=r37k'+b.dataset.g+']:checked')||{}).value; if (!keep) return;
    if (!confirm('Merge '+(x.users.length-1)+' account(s) into the ticked one? The others are switched off.')) return;
    b.disabled = true;
    for (const u of x.users) { if (u.id !== keep) await v3Call('mergeAccounts', { keepId: keep, dropId: u.id }, 'Merged'); }
    r37OpenDups();
  }; });
}
/* ---------- chef: Share tonight's count (PNG) ---------- */
async function r37ShareCount(){
  const d = await v3Call('getDinnerPrepList', { serviceDate: fijiDateString() });
  const p = d && (d.prep || d); if (!p || !p.tally) { toast('No count yet','error'); return; }
  const items = Object.keys(p.tally).sort(function(a,b){ return p.tally[b]-p.tally[a]; });
  const notes = (p.specialNotes||[]).filter(function(n){ return n.flag === 'allergy' || n.flag === 'diet'; }).slice(0, 12);
  const W = 1080, lh = 64, H = 260 + items.length*lh + (notes.length ? 90 + notes.length*48 : 0) + 80;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#0f172a'; x.fillRect(0,0,W,H); x.fillStyle = '#5eead4'; x.font = 'bold 54px sans-serif'; x.fillText('Dinner count · '+r36FmtDate(p.serviceDate), 60, 100);
  x.fillStyle = '#e2e8f0'; x.font = '40px sans-serif'; x.fillText('Total '+p.totalOrders+' · approved '+(p.approved||0)+' · late '+(p.late||0), 60, 170);
  let y = 250; x.font = '42px sans-serif';
  items.forEach(function(k){ x.fillStyle = '#f8fafc'; const t = k.length > 38 ? k.slice(0,37)+'…' : k; x.fillText(t, 60, y); x.fillStyle = '#5eead4'; x.textAlign = 'right'; x.fillText(String(p.tally[k]), W-60, y); x.textAlign = 'left'; y += lh; });
  if (notes.length) { y += 30; x.fillStyle = '#fca5a5'; x.font = 'bold 40px sans-serif'; x.fillText('Allergies & diets', 60, y); y += 56; x.font = '34px sans-serif'; x.fillStyle = '#fecaca';
    notes.forEach(function(n){ const t = (n.name+' — '+n.note); x.fillText(t.length > 52 ? t.slice(0,51)+'…' : t, 60, y); y += 48; }); }
  x.fillStyle = '#64748b'; x.font = '28px sans-serif'; x.fillText('PCR Staff App · '+new Date().toLocaleString('en-GB'), 60, H-40);
  const blob = await new Promise(function(r){ c.toBlob(r, 'image/png'); });
  const name = 'dinner-count-'+p.serviceDate+'.png', file = new File([blob], name, { type:'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], title:'Dinner count '+p.serviceDate }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Saved '+name); return 'downloaded';
}
