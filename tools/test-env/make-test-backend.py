#!/usr/bin/env python3
"""Build the TEST Apps Script backend (3.0) into a separate folder (never the live apps-script/ folder).

  python3 tools/test-env/make-test-backend.py /workspace/pcr-test-backend [accountsFile]

The folder must already hold the TEST project's .clasp.json (never the live scriptId).
accountsFile (default /workspace/test-env-accounts.txt, not in git) holds the line TEST_PASSWORD=...

Changes vs apps-script/ (live code is otherwise identical):
- SHEET_ID comes from Script Property TEST_SHEET_ID (a NEW empty TEST sheet made by setupTestEnvironment());
  getSS() ignores any bound sheet and refuses the live sheet id; first request auto-runs setup if needed
- APP_VERSION gets "-test"
- mail: Brevo is disabled in code; every recipient that is not a groupit.paradisecoveresortfiji(+alias)@gmail.com
  test address is redirected to the TEST inbox; [TEST] subject prefix is always on
- SUPERADMIN_EMAIL / password → TEST superadmin; DEFAULT_ALERT_EMAILS → TEST admin; live roster sheet id removed;
  kitchen summary PDFs go to a separate Drive folder "PCR Kitchen Order Summaries — TEST"
- TestEnv.gs is added
"""
import os, re, sys, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'apps-script')
LIVE_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM'
LIVE_SCRIPT = '1iKcbyeTzeLZ67nT7mqqf0XJMfHNBySEDnRE_00sGorj-pmfg6heGT0QX'
ROSTER_ID = '1n5onxR-Ww-0oDdPWDDUvRWuzKd-UGF51tBERtZfAcZM'
TEST_SUPER = 'groupit.paradisecoveresortfiji+t-super@gmail.com'
TEST_ADMIN = 'groupit.paradisecoveresortfiji+t-admin@gmail.com'
out = os.path.abspath(sys.argv[1])
acc = sys.argv[2] if len(sys.argv) > 2 else '/workspace/test-env-accounts.txt'
if os.path.realpath(out) == os.path.realpath(SRC):
    sys.exit('Refusing to write into the live apps-script folder')
cj = os.path.join(out, '.clasp.json')
if not os.path.exists(cj) or LIVE_SCRIPT in open(cj).read():
    sys.exit('Target must already hold the TEST project .clasp.json (and never the live scriptId)')
m = re.search(r'^TEST_PASSWORD=(\S+)$', open(acc).read(), re.M)
if not m: sys.exit('TEST_PASSWORD= line missing in ' + acc)
PW = m.group(1)

def sub(s, old, new, count=1):
    if old not in s:
        sys.exit('pattern not found: ' + old[:70])
    return s.replace(old, new, count)
def resub(s, pat, new):
    s2, n = re.subn(pat, new, s, count=1)
    if not n: sys.exit('regex not found: ' + pat[:70])
    return s2

code = open(os.path.join(SRC, 'Code.gs')).read()
code = resub(code, r"var SHEET_ID = '" + LIVE_ID + r"';[^\n]*",
             "var SHEET_ID = (function () { try { return String(PropertiesService.getScriptProperties().getProperty('TEST_SHEET_ID') || ''); } catch (e) { return ''; } })(); // TEST backend")
code = resub(code, r"var APP_VERSION = '([^']+)';", r"var APP_VERSION = '\1-test';")
code = resub(code, r"var SUPERADMIN_EMAIL = '[^']+';", "var SUPERADMIN_EMAIL = '" + TEST_SUPER + "'; // TEST superadmin")
code = resub(code, r"var SUPERADMIN_PASSWORD = '[^']+';", "var SUPERADMIN_PASSWORD = '" + PW + "'; // TEST only")
code = resub(code, r"var DEFAULT_ALERT_EMAILS = \[[^\]]*\];", "var DEFAULT_ALERT_EMAILS = ['" + TEST_ADMIN + "']; // TEST")
code = resub(code, r"var LIVE_ROSTER_SHEET_ID = '[^']+';", "var LIVE_ROSTER_SHEET_ID = ''; // TEST: no live roster")
code = sub(code, """function getSS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    SHEET_ID = ss.getId();
    return ss;
  }
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);""", """function getSS() {
  // TEST backend: only ever the TEST sheet (Script Property TEST_SHEET_ID); never the live V2 sheet.
  if (!SHEET_ID) testAutoSetup();
  if (!SHEET_ID) throw new Error('TEST backend not set up yet: run setupTestEnvironment() in the editor.');
  if (SHEET_ID === '""" + LIVE_ID + """') throw new Error('Refusing to open the LIVE sheet from the TEST backend.');
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);""")
code = sub(code, "try { return PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY') || ''; } catch (e) { return ''; }",
           "return ''; // TEST backend: Brevo is never used")
code = sub(code, "var redirect = props ? String(props.getProperty('MAIL_REDIRECT_TO') || '').trim() : '';",
           "var redirect = (props ? String(props.getProperty('MAIL_REDIRECT_TO') || '').trim() : '') || 'groupit.paradisecoveresortfiji+t-mail@gmail.com'; // TEST: always redirect")
code = sub(code, "var prefix = props ? String(props.getProperty('MAIL_SUBJECT_PREFIX') || '').trim() : '';",
           "var prefix = (props ? String(props.getProperty('MAIL_SUBJECT_PREFIX') || '').trim() : '') || '[TEST]'; // TEST: always prefix")
code = sub(code, """  if (redirect && kind !== 'code') {
    body = '[Test backend — originally to: ' + list.join(', ') + ']\\n\\n' + body;
    list = [redirect];
  }""", """  // TEST backend: only test addresses (owner Gmail +aliases) ever receive mail; anything else → TEST inbox
  var TEST_OK = /^groupit\\.paradisecoveresortfiji(\\+[a-z0-9._-]+)?@gmail\\.com$/i;
  if (list.some(function (x) { return !TEST_OK.test(x); })) {
    body = '[Test backend — originally to: ' + list.join(', ') + ']\\n\\n' + body;
    var kept = list.filter(function (x) { return TEST_OK.test(x); });
    if (kept.indexOf(redirect) < 0) kept.push(redirect);
    list = kept;
  }""")
for bad in (LIVE_ID, ROSTER_ID, 'leanne@', 'agm@', 'cesare@', 'wood.nicolas', 'pranav619'):
    if bad in code.replace("'" + LIVE_ID + "') throw", ''):
        sys.exit('live value still present in Code.gs: ' + bad)
for n in os.listdir(out):
    if n.endswith('.gs'): os.remove(os.path.join(out, n))
open(os.path.join(out, 'Code.gs'), 'w').write(code)
files = [f for f in os.listdir(SRC) if f.endswith('.gs') and f != 'Code.gs'] + ['appsscript.json']
for f in files:
    s = open(os.path.join(SRC, f)).read()
    if f == 'Summaries.gs':
        s = sub(s, "var DSUM_FOLDER_NAME = 'PCR Kitchen Order Summaries';", "var DSUM_FOLDER_NAME = 'PCR Kitchen Order Summaries — TEST';")
    if LIVE_ID in s: sys.exit('live sheet id found in ' + f)
    open(os.path.join(out, f), 'w').write(s)
te = open(os.path.join(ROOT, 'tools', 'test-env', 'TestEnv.gs')).read()
open(os.path.join(out, 'TestEnv.gs'), 'w').write(sub(te, '__TEST_PASSWORD__', PW))
print('TEST backend written to', out, '(' + ', '.join(sorted(files + ['Code.gs', 'TestEnv.gs'])) + ')')
