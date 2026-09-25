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
```

No test calls the live Apps Script backend or writes to the Sheet.
