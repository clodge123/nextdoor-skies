# Heartbeat checklist — Wave 3 monitor (hourly)

Repo: `~/projects/nextdoor-skies-run2`. Ledger: `docs/WAVE-3-STATE.md`.

Each heartbeat run, in order:

1. **Lane ledger** — read `docs/WAVE-3-STATE.md`. Compare against
   `sessions_list` (subagents) for lanes marked RUNNING. Any lane finished
   (completion event arrived) → merge + gate it per the ledger's next-step
   notes. Any lane silent >1h with no commits → steer it (commit-first law).
2. **Process hygiene (mandatory)** —
   ```bash
   ps -eo pid,etime,args | grep service-child-group-anchor | grep -v grep \
     | awk '{split($2,a,":"); if (length(a)==3) print $1}' | xargs -r kill -9
   ps -eo pid,comm | awk '$2=="chrome-headless"{print $1}' | xargs -r kill -9
   uptime
   ```
   Load average must be trending toward idle (< ~8). Stale anchors older than
   ~1h with no live lane belong to finished work — kill them.
3. **Gates** — if any lane merged since last check: vitest, tsc -b, build,
   gated Playwright (`scripts/e2e-gate.sh`, one browser run at a time), then
   record in the ledger.
4. **Deploy law** — NO deploys during the wave. One deploy at wave end only.
5. **Report** — deliver a one-line status ONLY when something needs the
   owner's attention (lane blocked needing a decision, gate failure after
   2 fixes, production regression). Otherwise NO_REPLY. Late night
   (23:00–08:00): stay silent unless load > 20 or production is broken.
