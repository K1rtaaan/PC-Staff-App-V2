# PCR Staff App tests (3.0)

Browser tests use `playwright-core` + Google Chrome against a local static server of `public/`:

```bash
cd public && python3 -m http.server 8765 &      # app under test (demo mode is used: ?demo=1)
cd tools/tests && npm i playwright-core@1.47   # once (or set NODE_PATH to an existing install)
node backend-unit.js                            # Code.gs / Speed.gs / V3.gs rules (no network, no Sheet)
node v3flows.js                                 # 3.0 end-to-end flows (SHOTS=dir for screenshots)
node test3.js http://127.0.0.1:8765/ local      # 2.x regression (52 checks)
node v3smoke.js                                 # every screen per role at 390px
node queue.js http://127.0.0.1:8765/ local      # offline queue
node archive.js http://127.0.0.1:8765/          # archive old rows (password prompt)
node offreload.js http://127.0.0.1:8765/        # offline reload
node apicount.js http://127.0.0.1:8765/ local   # API calls on boot
node bootfail.js                                # boot retry
node swupdate3.js                               # needs a copy of public/ served on :8766 at /tmp/swtest
node r3shots.js http://127.0.0.1:8765/ <outDir> # 3.0 review screenshots + checks
BASE=http://127.0.0.1:8765/ node r301race.js    # 3.0.1: leave a page while it loads — no console errors, no repaint
BASE=http://127.0.0.1:8765/ node r301code.js    # 3.0.1: superadmin code box on top of Edit user (cancel / wrong / right code)
node a31-backend.js                              # 3.1.0: superadmin block, admin log, revert owner, one-time notice (VM)
BASE=http://127.0.0.1:8765/ node r310flows.js   # 3.1.0: same in the demo browser
node a33-push.js                                 # 3.2.0: Web Push (VAPID keys/JWT, subscribe, inbox, events, reminders, cleanup) (VM)
```

No test calls the live Apps Script backend or writes to the Sheet.

## TEST environment (branch `v3-test`)

```bash
python3 tools/test-env/make-test-backend.py /workspace/pcr-test-backend   # TEST Apps Script build (folder must hold the TEST .clasp.json)
python3 tools/test-env/make-test-site.py OUT_DIR TEST_SCRIPT_URL           # TEST frontend (banner, pcrtest- caches/keys)
tools/test-env/run-e2e.sh [shotDir]                                         # emulator (real TEST backend code, in-memory TEST copy) + 390px end-to-end pass
```

`gas-emulator.js` never reads the real live sheet: its "live" sheet is a fake stand-in that is frozen (any write fails the run).
