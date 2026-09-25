const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.argv[2];            // e.g. http://127.0.0.1:8765/  or live URL
const TAG = process.argv[3] || 'local';
const OUT = '/tmp/pcr-tests/out/' + TAG;
fs.mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
function check(name, cond, extra) { results.push({ name, ok: !!cond, extra: extra || '' }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); }

async function newPage(browser, clockIso) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  if (clockIso) await page.clock.install({ time: new Date(clockIso) });
  page.on('console', m => { if (m.type() === 'error') errors.push(TAG + ' [console] ' + m.text()); });
  page.on('pageerror', e => errors.push(TAG + ' [pageerror] ' + e.message));
  return { ctx, page };
}
async function login(page, email, pw) {
  await page.evaluate(() => { try { doLogout(); } catch (e) {} });
  await page.waitForSelector('#login-email', { state: 'visible' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pw);
  await page.click('#login-form button[type=submit]');
  await page.waitForFunction(() => state.user && state.user.email, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
}
async function closeModals(page) { await page.evaluate(() => { try { const m = document.getElementById('modal'); if (m && !m.classList.contains('hidden')) closeModal(); } catch (e) {} }); }
async function noSideScroll(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  check(label + ': no sideways scroll', r.sw <= r.cw + 1 && r.bw <= r.cw + 1, JSON.stringify(r));
}
async function patchPdfCapture(page) {
  await page.evaluate(async () => {
    await ensureHtml2Pdf();
    if (window.__pdfPatched) return;
    const orig = window.html2pdf;
    window.__pdfHtml = [];
    window.html2pdf = function () {
      const w = orig.apply(this, arguments);
      const from = w.from.bind(w);
      w.from = function (el) { window.__pdfHtml.push(el.outerHTML || String(el)); return from.apply(null, arguments); };
      const set = w.set.bind(w);
      w.set = function () { const r = set.apply(null, arguments); r.from = w.from; return r; };
      return w;
    };
    window.__pdfPatched = true;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  // ---------- Phase A: 10:00 Fiji (all meals open) — Ana places orders with notes
  const A = await newPage(browser, '2026-09-24T22:00:00Z');   // = Fri 25 Sep 10:00 FJT
  let page = A.page;
  await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pcr_v2_coach_done','1'); });
  await page.reload({ waitUntil: 'load' });
  await login(page, 'ana.tui@paradisecoveresortfiji.com', 'staff123');
  const ver = await page.evaluate(() => APP_VERSION);
  check('APP_VERSION is 3.0.0', ver === '3.0.0', ver);

  await page.evaluate(() => navigate('breakfast'));
  await page.waitForSelector('#bf-note');
  await noSideScroll(page, 'Breakfast form');
  await page.screenshot({ path: OUT + '/1-breakfast-form.png', fullPage: true });
  await page.fill('#bf-note', 'Nut allergy - no peanut butter please');
  await closeModals(page); await page.click('#btn-breakfast');
  await page.waitForTimeout(700);

  await page.evaluate(() => navigate('lunch'));
  await page.waitForSelector('#lu-note');
  await page.fill('#lu-note', 'Extra rice please');
  await closeModals(page); await page.click('#btn-lunch');
  await page.waitForTimeout(700);

  await page.evaluate(() => navigate('dinner'));
  await page.waitForSelector('#dinner-notes');
  await page.fill('#dinner-notes', 'Dairy free');
  await closeModals(page); await page.click('#btn-dinner');
  await page.waitForTimeout(800);
  // change the order → latest note must win
  await page.waitForSelector('#dinner-notes');
  const prefill = await page.inputValue('#dinner-notes');
  check('Dinner form pre-fills current note on change', prefill === 'Dairy free', prefill);
  await page.fill('#dinner-notes', 'Halal only, no pork');
  await closeModals(page); await page.click('#btn-dinner');
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/2-dinner-form.png', fullPage: true });
  await noSideScroll(page, 'Dinner form');
  const stored = await page.evaluate(() => { const db = JSON.parse(localStorage.getItem(DEMO_KEY)); const e='ana.tui@paradisecoveresortfiji.com'; const sd = dinnerCutoffInfo().serviceDate;
    const f = l => (l||[]).filter(o=>o.userEmail===e && o.serviceDate===sd && o.status!=='cancelled').map(o=>o.specialNote);
    return { b: f(db.breakfastOrders), l: f(db.lunchOrders), d: f(db.dinnerOrders), sd }; });
  check('Ana breakfast note stored', stored.b.join() === 'Nut allergy - no peanut butter please', JSON.stringify(stored.b));
  check('Ana lunch note stored', stored.l.join() === 'Extra rice please', JSON.stringify(stored.l));
  check('Ana dinner note = latest (changed)', stored.d.join() === 'Halal only, no pork', JSON.stringify(stored.d));
  // inject cancelled + rejected rows with notes (must NOT show)
  await page.evaluate(() => { const db = JSON.parse(localStorage.getItem(DEMO_KEY)); const sd = dinnerCutoffInfo().serviceDate;
    db.dinnerOrders.push({ id:'din_cx', serviceDate:sd, userEmail:'ghost1@pcr.com', userName:'Ghost Cancelled', department:'Spa', mealChoice:'Chicken Pizza', notes:'CANCELLED_NOTE shellfish', specialNote:'CANCELLED_NOTE shellfish', status:'cancelled', late:false, createdAt:sd+' 09:00' });
    db.dinnerOrders.push({ id:'din_rj', serviceDate:sd, userEmail:'ghost2@pcr.com', userName:'Ghost Rejected', department:'Spa', mealChoice:'Chicken Pizza', notes:'REJECTED_NOTE egg', specialNote:'REJECTED_NOTE egg', status:'rejected', late:true, createdAt:sd+' 21:00' });
    localStorage.setItem(DEMO_KEY, JSON.stringify(db)); });
  const demoDb = await page.evaluate(() => localStorage.getItem(DEMO_KEY));
  await A.ctx.close();

  // ---------- Phase B: real time — kitchen + superadmin views
  for (const who of [['kitchen@paradisecoveresortfiji.com', 'staff123', 'kitchen'], ['it@paradisecoveresortfiji.com', '21slands', 'superadmin']]) {
    const B = await newPage(browser, '2026-09-25T00:00:00Z');
    page = B.page;
    await page.goto(BASE + '?demo=1', { waitUntil: 'load' });
    await page.evaluate((d) => { localStorage.clear(); localStorage.setItem('pcr_v2_demo_db', d); localStorage.setItem('pcr_v2_coach_done','1'); }, demoDb);
    await page.reload({ waitUntil: 'load' });
    await login(page, who[0], who[1]);
    const L = who[2];
    await page.evaluate(() => navigate('kitchen'));
    await page.waitForSelector('#kit-notes-card', { timeout: 20000 });
    await page.waitForTimeout(500);
    const card = await page.$eval('#kit-notes-card', el => ({ text: el.innerText, allergy: el.querySelectorAll('[data-note-flag=allergy]').length, diet: el.querySelectorAll('[data-note-flag=diet]').length }));
    check(L + ': summary shows Ana breakfast allergy note', /Nut allergy - no peanut butter please/.test(card.text));
    check(L + ': summary shows Ana dinner latest note only', /Halal only, no pork/.test(card.text) && !/Dairy free/.test(card.text));
    check(L + ': summary shows Ana lunch request', /Extra rice please/.test(card.text));
    check(L + ': summary shows seeded allergy (Jone peanut)', /Peanut allergy/.test(card.text));
    check(L + ': summary shows seeded special request', /Extra gravy/.test(card.text));
    check(L + ': approved-late (Laisa, vegetarian) included', /Laisa Bale[\s\S]*late approved/.test(card.text) || /Vegetarian/.test(card.text));
    check(L + ': cancelled/rejected notes excluded', !/CANCELLED_NOTE|REJECTED_NOTE/.test(card.text));
    check(L + ': allergy flags (red) present', card.allergy >= 3, 'allergy=' + card.allergy + ' diet=' + card.diet);
    check(L + ': diet flags (amber) present', card.diet >= 2, 'diet=' + card.diet);
    const inline = await page.evaluate(() => document.querySelectorAll('[data-kit-meal] .note-chip').length);
    check(L + ': inline note chips on orders', inline >= 5, 'inline=' + inline);
    await noSideScroll(page, L + ' kitchen screen');
    await page.screenshot({ path: OUT + '/3-' + L + '-kitchen.png', fullPage: true });
    await (await page.$('#kit-notes-card')).screenshot({ path: OUT + '/3b-' + L + '-notes-card.png' });
    const dblk = await page.$('[data-kit-meal=dinner]'); if (dblk) await dblk.screenshot({ path: OUT + '/3c-' + L + '-dinner-block.png' });

    // Late approve Epi (note) → stays visible as late approved
    if (L === 'kitchen') {
      await closeModals(page);
      const has = await page.evaluate(() => { const b = document.querySelector('.late-approve'); if (b) b.click(); return !!b; });
      if (has) { await page.waitForTimeout(1200); await page.waitForSelector('#kit-notes-card');
        const t2 = await page.$eval('#kit-notes-card', el => el.innerText);
        check('kitchen: approved late order note shown (Epi)', /Epi Nacewa[\s\S]*keep a plate warm/.test(t2) && /late approved/.test(t2)); }
    }

    // PDFs: capture html handed to html2pdf, and save real downloads
    await patchPdfCapture(page);
    const getPdfHtml = () => page.evaluate(() => (window.__pdfHtml || []).slice(-1)[0] || '');
    // prep list download PDF
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (await closeModals(page), page).click('#btn-prep-dl')]);
    await dl.saveAs(OUT + '/prep-' + L + '.pdf');
    let h = await getPdfHtml();
    const top = h.indexOf('Allergies &amp; special requests'), brk = h.indexOf('Breakdown (sorted by food)');
    check(L + ': prep PDF has notes section at top', top > 0 && top < brk, 'top=' + top + ' breakdown=' + brk);
    check(L + ': prep PDF includes allergy flag + name + dish', /⚠ ALLERGY/.test(h) && /Jone Ratu/.test(h) && /Halal only, no pork/.test(h));
    check(L + ': prep PDF inline notes in rows', (h.match(/class="print-note"/g) || []).length >= 4);
    check(L + ': prep PDF excludes cancelled/rejected', !/CANCELLED_NOTE|REJECTED_NOTE/.test(h));
    fs.writeFileSync(OUT + '/prep-' + L + '.html', h);
    // "View all as PDF" via Generate modal
    await (await closeModals(page), page).click('#btn-prep-gen'); await page.waitForSelector('#m-view-pdf');
    const popP = page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
    await page.click('#m-view-pdf'); const pop = await popP; await page.waitForTimeout(500);
    h = await getPdfHtml();
    check(L + ': "View all as PDF" has notes section', /Allergies &amp; special requests/.test(h) && /Peanut allergy/.test(h), pop ? 'popup opened' : 'no popup');
    if (pop) await pop.close();
    // Dinner order list PDF (block View PDF / Download)
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (await closeModals(page), page).click('.kit-pdf-dl[data-meal=dinner]')]);
    await dl.saveAs(OUT + '/dinner-order-' + L + '.pdf');
    h = await getPdfHtml();
    check(L + ': dinner order PDF has notes section + note column', /Allergies &amp; special requests/.test(h) && /Special note \/ allergy/.test(h) && /Halal only, no pork/.test(h));
    fs.writeFileSync(OUT + '/dinner-order-' + L + '.html', h);
    // Breakfast / lunch PDFs
    for (const meal of ['breakfast', 'lunch']) {
      [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (await closeModals(page), page).click('.kit-pdf-dl[data-meal=' + meal + ']')]);
      await dl.saveAs(OUT + '/' + meal + '-' + L + '.pdf');
      h = await getPdfHtml();
      const want = meal === 'breakfast' ? /Nut allergy - no peanut butter please/ : /Extra rice please/;
      check(L + ': ' + meal + ' PDF has notes section + Ana note', /Allergies &amp; special requests/.test(h) && want.test(h));
    }
    // Print view (dinner prep print)
    const pp = page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await (await closeModals(page), page).click('#btn-prep-print');
    const pw = await pp;
    if (pw) { await pw.waitForLoadState('domcontentloaded').catch(()=>{}); const ph = await pw.content(); check(L + ': print view has notes section', /Allergies &amp; special requests/.test(ph) && /Halal only, no pork/.test(ph)); await pw.close().catch(()=>{}); }
    else check(L + ': print view opened', false);
    // Admin → Kitchen tab
    await page.evaluate(() => { state.adminKitchenTab = 'kitchen'; navigate('admin'); });
    await page.waitForSelector('#admin-body #kit-notes-card', { timeout: 20000 }).catch(() => {});
    const adm = await page.$('#admin-body #kit-notes-card');
    check(L + ': Admin → Kitchen tab shows notes card', !!adm);
    await noSideScroll(page, L + ' admin kitchen tab');
    await page.screenshot({ path: OUT + '/4-' + L + '-admin-kitchen.png', fullPage: true });
    await B.ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ results, errors }, null, 2));
  console.log('\nCONSOLE/PAGE ERRORS (' + errors.length + '):\n' + errors.join('\n'));
  console.log('\nSUMMARY: ' + results.filter(r => r.ok).length + '/' + results.length + ' passed');
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
