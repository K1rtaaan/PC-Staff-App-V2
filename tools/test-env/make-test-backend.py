#!/usr/bin/env python3
"""Build the TEST Apps Script backend into a separate folder (never the live apps-script/ folder).

  python3 tools/test-env/make-test-backend.py /workspace/pcr-test-backend

Changes vs apps-script/: SHEET_ID comes from Script Property TEST_SHEET_ID (never the live sheet),
getSS() ignores any bound/active sheet and refuses the live id, APP_VERSION gets "-test",
mail redirect + [TEST] prefix default ON even before setup, and TestEnv.gs is added.
"""
import json, os, re, sys, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'apps-script')
LIVE_ID = '1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM'
LIVE_SCRIPT = '1iKcbyeTzeLZ67nT7mqqf0XJMfHNBySEDnRE_00sGorj-pmfg6heGT0QX'
out = os.path.abspath(sys.argv[1])
if os.path.realpath(out) == os.path.realpath(SRC):
    sys.exit('Refusing to write into the live apps-script folder')
cj = os.path.join(out, '.clasp.json')
if not os.path.exists(cj) or LIVE_SCRIPT in open(cj).read():
    sys.exit('Target must already hold the TEST project .clasp.json (and never the live scriptId)')

def sub(s, old, new, count=1):
    if old not in s:
        sys.exit('pattern not found: ' + old[:60])
    return s.replace(old, new, count)

code = open(os.path.join(SRC, 'Code.gs')).read()
code = re.sub(r"var SHEET_ID = '" + LIVE_ID + r"';[^\n]*",
              "var SHEET_ID = (function () { try { return String(PropertiesService.getScriptProperties().getProperty('TEST_SHEET_ID') || ''); } catch (e) { return ''; } })(); // TEST backend", code, count=1)
code = re.sub(r"var APP_VERSION = '([^']+)';", r"var APP_VERSION = '\1-test';", code, count=1)
code = sub(code, """function getSS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    SHEET_ID = ss.getId();
    return ss;
  }
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);""", """function getSS() {
  // TEST backend: only ever the TEST copy (Script Property TEST_SHEET_ID); never the live V2 sheet.
  if (!SHEET_ID) throw new Error('TEST backend not set up yet: run setupTestEnvironment() in the editor.');
  if (SHEET_ID === '""" + LIVE_ID + """') throw new Error('Refusing to open the LIVE sheet from the TEST backend.');
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);""")
code = sub(code, "var redirect = props ? String(props.getProperty('MAIL_REDIRECT_TO') || '').trim() : '';",
          "var redirect = (props ? String(props.getProperty('MAIL_REDIRECT_TO') || '').trim() : '') || 'it@paradisecoveresortfiji.com'; // TEST: always redirect")
code = sub(code, "var prefix = props ? String(props.getProperty('MAIL_SUBJECT_PREFIX') || '').trim() : '';",
          "var prefix = (props ? String(props.getProperty('MAIL_SUBJECT_PREFIX') || '').trim() : '') || '[TEST]'; // TEST: always prefix")
if LIVE_ID in code.replace("'" + LIVE_ID + "') throw", ''):
    sys.exit('live sheet id still present in Code.gs')
open(os.path.join(out, 'Code.gs'), 'w').write(code)
for f in ['Speed.gs', 'V3.gs', 'Stations.gs', 'Snapshots.gs', 'appsscript.json']:
    shutil.copy(os.path.join(SRC, f), os.path.join(out, f))
shutil.copy(os.path.join(ROOT, 'tools', 'test-env', 'TestEnv.gs'), os.path.join(out, 'TestEnv.gs'))
for f in ['Speed.gs', 'V3.gs', 'Stations.gs', 'Snapshots.gs']:
    if LIVE_ID in open(os.path.join(out, f)).read():
        sys.exit('live sheet id found in ' + f)
print('TEST backend written to', out)
