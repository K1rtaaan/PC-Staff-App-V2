const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
 const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
 await p.goto('http://127.0.0.1:8765/?demo=1'); await p.waitForTimeout(3000);
 const o = await p.evaluate(() => [...document.querySelectorAll('#reg-department option')].map(x => x.value));
 console.log(o.join(', ')); console.log(o.includes('Front Office') && o.includes('Stores') && o.includes('Medical') && !o.includes('Band') ? 'PASS sign-up departments' : 'FAIL'); console.log('errors', errs); await b.close(); })();
