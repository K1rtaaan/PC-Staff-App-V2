#!/usr/bin/env python3
"""Build the TEST frontend from public/ (never touches public/ or docs/).

  python3 tools/test-env/make-test-site.py OUT_DIR SCRIPT_URL

- SCRIPT_URL → the TEST backend
- service-worker cache 'pcr-staff-' → 'pcrtest-staff-' (Cache Storage is shared per origin with live on
  k1rtaaan.github.io; live's SW only deletes 'pcr-staff-*', the test SW only deletes 'pcrtest-staff-*')
- localStorage/sessionStorage keys 'pcr_' → 'pcrtest_' (same origin as live, so keys must differ)
- Web Lock 'pcr-queue-flush' → 'pcrtest-queue-flush'
- orange "TEST SITE" banner, "TEST" title and manifest name
"""
import os, re, sys, shutil, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUB = os.path.join(ROOT, 'public')
out, script_url = os.path.abspath(sys.argv[1]), sys.argv[2]
LIVE_URL = 'https://script.google.com/macros/s/AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8/exec'
if script_url == LIVE_URL: sys.exit('Refusing: that is the LIVE backend')
if os.path.realpath(out) in (os.path.realpath(PUB), os.path.realpath(os.path.join(ROOT, 'docs'))): sys.exit('Refusing to overwrite public/ or docs/')
if os.path.exists(out):
    for n in os.listdir(out):
        if n == '.git': continue
        p = os.path.join(out, n)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
else: os.makedirs(out)
for n in os.listdir(PUB):
    s = os.path.join(PUB, n)
    shutil.copytree(s, os.path.join(out, n)) if os.path.isdir(s) else shutil.copy(s, os.path.join(out, n))

def edit(rel, fn):
    p = os.path.join(out, rel); s = open(p, encoding='utf-8').read(); t = fn(s)
    open(p, 'w', encoding='utf-8').write(t)

BANNER = ('<div id="test-site-banner" role="note" style="position:fixed;top:0;left:0;right:0;z-index:2147483000;'
          'background:#f97316;color:#111;font:700 11px/18px system-ui,Arial,sans-serif;text-align:center;letter-spacing:.06em;'
          'pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.35)">TEST SITE · not the live app · test data only</div>'
          '<style>body{padding-top:18px!important}</style>')
def index(s):
    assert LIVE_URL in s
    s = s.replace(LIVE_URL, script_url)
    s = s.replace("'pcr_", "'pcrtest_").replace("'pcr-queue-flush'", "'pcrtest-queue-flush'")
    s = s.replace('https://k1rtaaan.github.io/PC-Staff-App-V2/assets/', 'https://k1rtaaan.github.io/PC-Staff-App-V2-Test/assets/')
    s = re.sub(r'<title>([^<]*)</title>', r'<title>TEST · \1</title>', s, count=1)
    s = re.sub(r'(<body[^>]*>)', r'\1' + BANNER, s, count=1)
    assert LIVE_URL not in s and "'pcr_" not in s
    return s
edit('index.html', index)
edit('assets/v3.js', lambda s: s.replace("'pcr_", "'pcrtest_"))
def sw(s):
    s = s.replace("'pcr-staff-v'", "'pcrtest-staff-v'").replace("indexOf('pcr-staff-')", "indexOf('pcrtest-staff-')")
    assert "'pcr-staff-" not in s
    return s
edit('sw.js', sw)
def man(s):
    m = json.loads(s); m['name'] = 'PCR Staff App — TEST'; m['short_name'] = 'PCR TEST'
    return json.dumps(m, indent=2)
edit('manifest.json', man)
open(os.path.join(out, '.nojekyll'), 'w').close()
open(os.path.join(out, 'README.md'), 'w').write('# PCR Staff App V2 — TEST SITE\n\nTest copy of the PCR Staff App 3.0 build (branch `v3-test` of K1rtaaan/PC-Staff-App-V2).\nIt talks to a separate TEST Apps Script backend and a TEST copy of the sheet. Not the live app.\n')
print('TEST site written to', out, '→', script_url)
