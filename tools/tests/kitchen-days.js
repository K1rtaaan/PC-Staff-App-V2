// 2.10.1: Kitchen "Order summaries by date" — demo mode browser test (no live backend calls).
// Usage: (cd public && python3 -m http.server 8771 &) ; node tools/tests/kitchen-days.js http://127.0.0.1:8771/ [shotDir]
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules/playwright-core')); }
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8771/';
const SHOTS = process.argv[3] || '';
let pass = 0, fail = 0;
const check = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };
function fijiDate(off) { return new Date(Date.now() + 12 * 3600e3 + off * 86400e3).toISOString().slice(0, 10); }
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  let live = 0;
  await page.route(/script\.google(usercontent)?\.com/, r => { live++; r.abort(); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '?demo=1');
  await page.waitForTimeout(1500);
  const chef = { id: 'usr_kit', email: 'kitchen@paradisecoveresortfiji.com', firstName: 'Cesare', lastName: 'Chef', department: 'Kitchen', role: 'chef', permissions: ['chef'], active: true, verified: true };
  await page.evaluate(([u, days]) => {
    localStorage.setItem('pcr_v2_session', JSON.stringify(u)); localStorage.setItem('pcr_v2_coach_done', '1'); localStorage.setItem('pcr_guides_off', '1');
    const db = JSON.parse(localStorage.getItem('pcr_v2_demo_db') || '{}');
    db.dinnerOrders = (db.dinnerOrders || []).filter(o => !/^din_t_/.test(o.id));
    const dishes = ['Chicken Pizza', 'Beef Curry / Rice / Chutney', 'Sausages / Potato Salad / Gravy'];
    days.forEach(([d, n]) => { for (let i = 0; i < n; i++) db.dinnerOrders.push({ id: 'din_t_' + d + '_' + i, serviceDate: d, userEmail: 'p' + i + '@x.invalid', userName: 'Person ' + i + ' ' + d.slice(8), department: 'Spa', mealChoice: dishes[i % 3], notes: '', specialNote: i === 0 ? 'Allergic to prawns' : '', status: 'approved', late: false, createdAt: d + ' 09:00 FJT' }); });
    localStorage.setItem('pcr_v2_demo_db', JSON.stringify(db));
  }, [chef, [[fijiDate(-2), 4], [fijiDate(-1), 6], [fijiDate(0), 9]]]);
  await page.goto(BASE + '?demo=1');
  await page.waitForTimeout(3000);
  await page.evaluate(() => navigate('kitchen'));
  await page.waitForSelector('#kit-days-card', { state: 'attached', timeout: 20000 });
  await page.waitForSelector('#kit-day-total', { state: 'attached', timeout: 20000 });
  const chips = await page.$$eval('.kit-day-chip', els => els.map(e => ({ d: e.dataset.date, t: e.textContent, on: e.getAttribute('aria-pressed') })));
  check('5 date chips: last 3 days, today, tomorrow', chips.length === 5 && chips[0].d === fijiDate(-3) && chips[4].d === fijiDate(1), JSON.stringify(chips.map(c => c.d)));
  check('today selected by default and labelled Tonight', chips[3].on === 'true' && /Tonight/.test(chips[3].t));
  check('tomorrow labelled', /Tomorrow/.test(chips[4].t));
  check("today's total = 9 (built from order rows)", (await page.textContent('#kit-day-total')).trim() === '9');
  check('allergy note counted', /1 ALLERGY/.test(await page.textContent('#kit-day-panel')));
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/demo-kitchen-today.png', fullPage: false }); }
  await page.click('.kit-day-chip[data-date="' + fijiDate(-1) + '"]');
  await page.waitForFunction(d => document.querySelector('[data-kit-day="' + d + '"]'), fijiDate(-1));
  check('yesterday chip shows 6', (await page.textContent('#kit-day-total')).trim() === '6');
  check('chip pressed state moved', await page.getAttribute('.kit-day-chip[data-date="' + fijiDate(-1) + '"]', 'aria-pressed') === 'true');
  // Print opens a window with the prep list
  const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.click('#kit-day-print')]);
  await pop.waitForLoadState();
  const popTxt = await pop.textContent('body');
  check('Print window shows the Dinner Prep List for that date', popTxt.includes('Dinner Prep List — ' + fijiDate(-1)) && /Total dinner orders: 6/.test(popTxt) && /Allergies/.test(popTxt));
  await pop.close();
  // PDF download (html2pdf from CDN)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 45000 }), page.click('#kit-day-pdf')]);
  const fn = dl.suggestedFilename();
  const p = await dl.path();
  check('Download PDF gives dinner-prep-<date>.pdf', fn === 'dinner-prep-' + fijiDate(-1) + '.pdf' && fs.statSync(p).size > 5000, fn + ' ' + fs.statSync(p).size);
  if (SHOTS) await dl.saveAs(SHOTS + '/demo-' + fn);
  // breakfast/lunch headcount PDF button exists
  check('breakfast + lunch headcounts shown', (await page.$$('[data-kit-day-count]')).length === 2);
  await page.click('.kit-day-chip[data-date="' + fijiDate(-3) + '"]');
  await page.waitForFunction(d => document.querySelector('[data-kit-day="' + d + '"]'), fijiDate(-3));
  check('empty day shows 0 + message', (await page.textContent('#kit-day-total')).trim() === '0' && /No dinner orders/.test(await page.textContent('#kit-day-panel')));
  // rest of the kitchen page unchanged
  check('3.5.0: ONE prep list card — Generate / Print / PDF live in it, the duplicate 2.x buttons are gone', !!(await page.$('#kit-day-gen')) && !!(await page.$('#kit-day-print')) && !!(await page.$('#kit-day-pdf')) && !(await page.$('#btn-prep-gen')) && (await page.$$('#kit-dinner-card')).length === 1);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/demo-kitchen-empty-day.png' });
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no live backend calls in demo', live === 0);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
