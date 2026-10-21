# Browser Traffic Law (run 2, effective 2026-10-21)

**Why:** this host is 7.3 GiB RAM / 6 cores, shared with ollama (~850 MB) and
TTS (~450 MB) daemons. On 2026-10-21, wave-1 lanes each ran Playwright suites
in parallel with `fullyParallel:true` and default workers = CPU count →
dozens of chromiums at once; after kills, **489 leaked `chrome-headless`
zombies** piled up and OOM-killed the box (owner had to reboot). One chromium
context ≈ 150–400 MB; 12 workers × 3 viewports running simultaneously is
instant death on this machine.

## The law

1. **Code work stays fully parallel.** vitest, tsc, builds, git, docs —
   lanes run these concurrently, no gate. This keeps all 7 fleet slots busy.
2. **Browser runs are fleet-serialized.** Every Playwright / smoke run goes
   through `scripts/e2e-gate.sh`:
   ```bash
   scripts/e2e-gate.sh npx playwright test
   scripts/e2e-gate.sh npm run smoke:prod
   ```
   Default `E2E_SLOTS=1` — at most ONE browser run fleet-wide. A queued lane
   blocks (max `E2E_GATE_TIMEOUT=1800`s) and exits **75** if the gate is busy
   too long; it must NOT run browsers ungated to dodge the gate.
3. **One worker per run.** `playwright.config.ts` defaults `workers:1`
   (override with `E2E_WORKERS=n`). Viewport projects run sequentially inside
   a run — the suite takes ~2 min instead of ~40 s; that is the accepted cost
   of not OOM-killing the host.
4. **No nested browsers.** A lane must not spawn a browser loop while an
   outer script also holds a browser (e.g. a spec launching its own chromium
   inside a Playwright run). One browser process tree per run.
5. **Kill hygiene.** Lanes killed mid-Playwright leak chrome children. After
   any killed/timeout browser run:
   ```bash
   ps -eo pid,comm | awk '$2=="chrome-headless"{print $1}' | xargs -r kill -9
   ```
   Zombies are reaped by killing their dead exec wrappers, not by reboot.
6. **Closeout sweep (mandatory, owner law 2026-10-21).** Every run/wave/lane
   ends with a process sweep — never leave stale processes idle:
   ```bash
   # chrome zombies (see rule 5) + leaked exec anchors. Anchors older than
   # ~1h with no live work belong to finished lanes; kill them:
   ps -eo pid,etime,args | grep service-child-group-anchor | grep -v grep \
     | awk '{split($2,a,":"); if (length(a)==3) print $1}' | xargs -r kill -9
   ps -eo pid,comm | awk '$2=="chrome-headless"{print $1}' | xargs -r kill -9
   uptime   # load average must be trending toward idle, not pinned high
   ```
   Rationale: leaked OpenClaw exec anchors (~5% CPU each) pinned the Jetson
   at load 42 with zero running work. Cleanup is part of the lane definition,
   not an optional extra.
7. **Memory tripwire.** If `free` shows < 500 MB available, ALL lanes pause
   browser starts (gate refuses new runs) until it recovers.

## Fleet slot model (updated)

- 7 slots stay busy for code work — unchanged.
- Slot refill law unchanged: next queued lane starts the moment one ends.
- Browser lanes queue on the gate; the orchestrator staggers lane launches so
  browser-heavy lanes (Gate runs, smoke, verify) don't all hit the gate at
  the same minute. Non-browser lanes (docs, metrics, code review, migrations)
  fill the wall-clock gaps while a browser run holds the gate.

## Wave-2 lane brief header (copy into every lane prompt)

> Browser runs: ALWAYS `scripts/e2e-gate.sh <cmd>`. Never run Playwright
> directly, never launch chromium outside a gated run, never leave a killed
> run's chrome processes behind. Exit 75 from the gate = queue and retry, do
> not bypass.
