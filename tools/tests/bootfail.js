const { chromium } = require('playwright-core');
const U = { id:'u1', email:'fake.staff@example.invalid', firstName:'Test', lastName:'Staff', department:'Housekeeping', role:'staff', permissions:['staff'], active:true, verified:true };
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
  const ctx = await b.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.clock.install({ time: new Date('2026-09-24T22:00:00Z') });
  const calls = []; let n = 0; const T0 = Date.now();
  await page.route(/script\.google(usercontent)?\.com/, async route => {
    const a = new URL(route.request().url()).searchParams.get('action'); calls.push([a, Date.now()-T0]);
    if (a === 'getBootstrap' && n++ === 0) return route.abort('connectionreset');
    const sd = '2026-09-26', cut = { open:true, serviceDate:sd };
    const boot = { version:'mock', user:U, userFound:true, features:{}, settings:{}, cutoffs:{ breakfast:cut, lunch:cut, dinner:cut },
      myOrders:{ days:{ today:{date:'2026-09-25'}, tomorrow:{date:sd}, yesterday:{date:'2026-09-24'} }, cutoffs:{} },
      orders:{ serviceDates:{ breakfast:sd, lunch:sd, dinner:sd }, breakfast:[], lunch:[], dinner:[] }, boatRuns:[], dinnerMenus:{ items:[] }, reminders:[{ id:'r1', title:'Mock reminder from retry', body:'x', active:true }], suggestions:[], doThisNow:[] };
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(a === 'getBootstrap' ? { success:true, data:boot } : { success:true, data:{} }) });
  });
  await page.goto('http://127.0.0.1:8765/__seed404').catch(()=>{});
  await page.evaluate(u => { localStorage.clear(); localStorage.setItem('pcr_v2_session', JSON.stringify(u)); localStorage.setItem('pcr_v2_token', 'test-token'); localStorage.setItem('pcr_v2_coach_done','1'); }, U);
  await page.goto('http://127.0.0.1:8765/#home');
  await page.waitForTimeout(3000);
  console.log('calls in first 3s:', JSON.stringify(calls.map(c => c[0])));
  console.log('status:', await page.locator('#data-status').innerText());
  await page.clock.runFor(31000); await page.waitForTimeout(1500);
  console.log('calls after retry:', JSON.stringify(calls.map(c => c[0])));
  console.log('status:', await page.locator('#data-status').innerText());
  console.log('home shows retry data:', await page.locator('text=Mock reminder from retry').count() > 0);
  console.log('errors', errs);
  await b.close();
})();
