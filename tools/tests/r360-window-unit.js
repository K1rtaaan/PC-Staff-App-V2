// 3.6.0: late meal request window (cutoff 23:55 day before → 16:00 dinner day; menu pick until 13:00)
const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../apps-script/Behalf36.gs', 'utf8');
let NOW; const c = { r3At: (d, hm) => Date.parse(d + 'T' + hm + ':00Z'), fijiDateString: (dt) => dt.toISOString().slice(0, 10), addFijiDays: (dt, n) => new Date(dt.getTime() + n * 864e5),
  mealTimes: () => ({ dinner_cutoff: '23:55', late_close_dinner: '08:00' }), getFijiNow: () => NOW };
c.mealWindow = (m, sd, t) => ({ cutoffAt: c.r3At(new Date(Date.parse(sd + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10), t.dinner_cutoff) });
vm.createContext(c); vm.runInContext(src, c);
let f = 0; const at = (s) => { NOW = new Date(s + 'Z'); return c.r36LateWindow(); };
const t = (n, w, open, sd, pick) => { const ok = w.open === open && (!open || (w.serviceDate === sd && w.pick === pick)); if (!ok) f++; console.log((ok ? 'PASS ' : 'FAIL ') + n, JSON.stringify(w)); };
t('22:00 day before → closed (use Order on behalf)', at('2026-10-13T22:00:00'), false);
t('23:56 → tomorrow, pick', at('2026-10-13T23:56:00'), true, '2026-10-14', true);
t('09:00 → today, pick', at('2026-10-14T09:00:00'), true, '2026-10-14', true);
t('13:30 → today, leftovers', at('2026-10-14T13:30:00'), true, '2026-10-14', false);
t('16:01 → closed', at('2026-10-14T16:01:00'), false);
console.log(f ? f + ' failed' : 'all passed'); process.exit(f ? 1 : 0);
