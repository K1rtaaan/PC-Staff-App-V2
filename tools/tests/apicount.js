// Count backend (Apps Script) calls on app open for a logged-in user, backend mocked (no live calls).
const { chromium } = require('playwright-core');
const BASE = process.argv[2]; const TAG = process.argv[3] || 'x';
const users = {
  staff: { id:'u1', email:'fake.staff@example.invalid', firstName:'Test', lastName:'Staff', department:'Housekeeping', role:'staff', permissions:['staff'], active:true, verified:true },
  chef:  { id:'u2', email:'fake.chef@example.invalid', firstName:'Test', lastName:'Chef', department:'Kitchen', role:'chef', permissions:['chef'], active:true, verified:true },
  admin: { id:'u3', email:'fake.admin@example.invalid', firstName:'Test', lastName:'Admin', department:'IT', role:'super_admin', permissions:['super_admin','admin'], active:true, verified:true }
};
(async () => {
  const browser = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
  for (const role of Object.keys(users)) {
    for (const hash of ['#home', '']) {
      const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
      const page = await ctx.newPage();
      const calls = [];
      await page.route(/script\.google(usercontent)?\.com/, async route => {
        const u = new URL(route.request().url()); const a = u.searchParams.get('action') || '?';
        calls.push(a);
        const email = u.searchParams.get('requesterEmail') || u.searchParams.get('userEmail') || '';
        const usr = Object.values(users).find(x => x.email === email) || users[role];
        const sd = '2026-09-26';
        const cut = { open:true, serviceDate:sd, cutoffLabel:'mock' };
        const boot = { version:'mock', fijiNow:'2026-09-25 10:00', user: usr, userFound:true, features:{ feature_my_schedule:false, feature_live_roster:false, feature_leave_escalation:false }, settings:{},
          cutoffs:{ breakfast:cut, lunch:cut, dinner:cut }, myOrders:{ days:{ today:{date:'2026-09-25'}, tomorrow:{date:sd}, yesterday:{date:'2026-09-24'} }, cutoffs:{} },
          orders:{ serviceDates:{ breakfast:sd, lunch:sd, dinner:sd }, breakfast:[], lunch:[], dinner:[] }, boatRuns:[], dinnerMenus:{ items:[] }, reminders:[], suggestions:[],
          dailyOps: role==='staff'?null:{ emergencyPending:0 }, mealStats: role==='admin'?{}:null, kitchenLite: role==='staff'?null:{ breakfast:{latePending:[]}, dinner:{pendingCount:0} }, doThisNow:[], sheetsRead:[], ms:1 };
        const body = a === 'getVersion' ? { success:true, version:'mock' } : a === 'getBootstrap' ? { success:true, data: boot } : { success:true, data:{} };
        await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
      });
      await page.goto(new URL(BASE).origin + '/PC-Staff-App-V2/__seed404').catch(()=>{});
      await page.evaluate(u => { localStorage.clear(); localStorage.setItem('pcr_v2_session', JSON.stringify(u)); localStorage.setItem('pcr_v2_token', 'test-token'); localStorage.setItem('pcr_v2_coach_done','1'); }, users[role]);
      await page.goto(BASE + hash);
      await page.waitForTimeout(10000);
      const counts = {}; calls.forEach(c => counts[c] = (counts[c]||0)+1);
      console.log(TAG, role, hash || '(role landing)', 'API calls in first 10s:', calls.length, JSON.stringify(counts));
      await ctx.close();
    }
  }
  await browser.close();
})();
