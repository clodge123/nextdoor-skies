---
name: fleet-wave-orchestration
description: Run a multi-agent coding wave end to end — brief, parallel lanes in isolated git worktrees, verification gates, gated merges, one deploy per wave, metrics ledger, closeout sweep. Portable across agent runtimes (Claude Code, Codex, OpenClaw, tmux panes) on any machine. Use when shipping a wave of features through parallel coding agents.
---

# Multi-agent wave orchestration

Use when shipping a wave of features through parallel coding agents. Works
with any agent runtime that can run shell commands and edit files in a git
repo — this document is runtime-agnostic. The unit of work is a **wave**:
brief → design freeze → parallel lanes → gates → merge → one deploy → ledger.
Every number you report comes from a ledger row or a command output — never
from an agent's self-report.

## 1. Brief the wave before launching anything

Write `docs/WAVE-N-BRIEF.md` containing:

- the goal in **one sentence**
- locked design decisions (things that must not change mid-wave)
- the lane list, one line of scope per lane
- the **laws** that must not regress (visual laws, data laws, accessibility laws)
- the acceptance demo — exactly what you'll show at the end

**Freeze shared seams first.** Any module two lanes will touch (state context,
theme API, seed contract, shared types) gets a stub merged to main on day zero,
so every lane imports the *real* file instead of inventing parallel versions.
Diverging copies of seam files are merge accidents waiting to happen.

Brainstorm with the human owner **before** the brief locks. Launching lanes
against a moving design wastes whole lanes.

## 2. Launch lanes in isolated worktrees

One lane per feature, **one git worktree per lane**, branch named
`rN/lane-id`. Lanes never share a working tree — the filesystem, not
communication, prevents collisions.

```bash
git worktree add ../wt-lane-a -b r1/lane-a main
```

Spawn one agent per worktree, with its working directory set to the worktree
path. Use whatever your runtime provides:

- **Claude Code:** subagents (`Task` tool) or separate `claude` sessions
  launched with `cwd` in the worktree.
- **Codex:** one `codex exec` per worktree, each in its own pane/session.
- **OpenClaw:** `sessions_spawn` with `cwd` pointing at the worktree.
- **Any other runtime:** tmux panes, screen windows, background shells —
  anything that gives each lane an isolated process with the right `cwd`.

Give each lane brief: scope + the files it owns; the laws it must honor; its
gate list; and the **survival-commit cadence** — commit at least every 15
minutes, so a killed lane leaves its work in commits, not in memory. Have
each lane write its metrics file at the **first** survival commit, not at
lane end, so a kill leaves an audit trail.

When your brief embeds assumptions about the codebase (paths, commands,
module APIs), run a short **read-only recon pass** as the lane's first step:
read the named files, probe the paths, report mismatches, commit nothing.
Amend the brief with corrections, then launch the build. A lane built on a
wrong assumption wastes the whole lane; recon costs minutes.

Keep lane count bounded by your hardware. Rule of thumb: ~1 lane per 2 CPU
cores and ~1 GB free RAM, minus headroom for the gate runner. Browser-gated
work serializes on the gate runner; that's correct, not a stall.

Run a **periodic watchdog** while lanes work (cron, scheduler, loop,
automation — whatever your runtime has): check every active lane's last
commit against the survival law (silent past the law = stalled — rescue-commit
its uncommitted work and spawn a finisher), reap leaked browser processes,
kill services finished lanes left listening, and fire the launch trigger —
when the lane(s) named in the plan merge, spawn the queued lanes off the new
tip. Report to the human only on completion, failure, milestone, or gate
verdict.

## 3. Gate everything, in this order

**Gate 0 (every lane, fast):** typecheck, production build, unit tests, plus
project scans that encode your laws. Two that earn their keep:

- a **determinism scan** — flag `Math.random()` / `Date.now()` in render code,
  so the app is reproducible byte-for-byte
- a **theme-token scan** — flag raw hex colors in CSS, so theming is one
  variable deep

**Gate 1 (visual):** a headless-browser spec for the lane's own surface,
screenshots archived into the repo. No archived screenshots = the lane is
not done.

**Gate 2 (integration, after merge):** the full suite through a gate script
that owns browser lifecycle — all viewports (phone/tablet/desktop), real APIs
where the spec says real. Never launch browsers outside the gate runner; one
leaked browser process can OOM a small box.

**Gate 3 (production, after deploy):** probe live URLs — app 200, API
endpoints 200, and the specific behavior the wave changed. Confirm the
deployed bundle hash matches the local build. If they differ, you deployed
the wrong tree.

**Standing laws that make agents unable to lie:**

- **No silent fallbacks.** Show real data, or say you have none. Never render
  a lookalike.
- **Loud errors** with exact messages.
- **Deploy once per wave.** All testing happens locally; the deploy exists to
  prove parity.

## 4. Merge with cross-lane inspection

Merge lanes **one at a time**, running the unit gate on the merged tree after
each merge. Then diff the merge (`git diff base..main`) against the lane list
and check each lane's laws survived — merges silently drop CSS and imports.

If your environment blocks normal git transport (proxy, CI permissions),
push via the platform's blobs/trees/commits/ref API, and keep a JSON-lint
gate so corrupted trees can't ship.

Reconcile late-arriving agent completion events against git state (wave tip,
`git log tip..lane` count) before acting. A report that matches the merged
tip is confirmation, not a new task. Never re-spawn work that's already
merged.

## 5. Deploy once, as the wave's final gate

Build locally, verify gates locally, deploy **one time**, then verify
production. Do not deploy per-change. Dozens of deploys per wave is a sign
the gates are weak. If the deploy identity is blocked (CI author permissions,
expired tokens), stage a git-less bundle of the prebuilt output and deploy
that — the artifact is what ships, not the git ceremony.

## 6. Ledger and closeout

Append the wave to `docs/metrics/WAVE-N-METRICS.md`:

- per-lane **active** minutes (wall-clock active only; queue waits excluded)
- gate results, defects caught by gates, owner interventions
- deploy timestamp
- rollup: totals, catches-before-merge vs found-at-review, **parallelism
  factor** = active-minutes-sum ÷ wall-clock span

When lane metrics lack active-minute fields, derive each lane's window from
its branch commits (`git log --format=%ci | sed -n '1p;$p'`) and say so in
the row. Self-reported minutes from lane agents are not ledger data.

Write `docs/WAVE-N-RETRO.md` for what broke and what changes next wave.

**Closeout sweep is mandatory before ending work:** reap leaked browser
processes and stale agent-runner processes. Confirm with `uptime` / `free -m`
that load and memory came down. Leaked processes idle-burn the box that runs
your next wave.

## 7. Bug-fix rounds after a demo

The owner demos, lists bugs, expects fixes fast. The rules:

- **Reproduce against production in a real browser**, not the dev machine —
  the dev machine lies.
- **Fix the law, not the symptom.** A dark-mode contrast bug is a
  theme-token law violation, not a one-color patch.
- Re-run the affected gates and deploy.
- **Update the tests that encoded the old law in the same commit.** Leaving
  them asserting the old law is worse than a red suite.

## Completion checklist

- [ ] Brief locked; shared seams merged to main
- [ ] All lanes merged; merged-tree gates green (unit + gated browser)
- [ ] Cross-lane law inspection of the merge diff
- [ ] Deployed once; production probed; bundle hash matches local
- [ ] Metrics ledger + retro written
- [ ] Host swept: 0 browser strays, 0 stale runner processes, load down
- [ ] Status reported with real counts, not estimates

## Portability notes

This skill deliberately contains no vendor-specific plumbing:

- **Hardware:** any machine that runs a dev server and headless browsers.
  Two machines (one for inference, one for orchestration) is one proven
  shape, not a requirement — a single workstation with a subscription API
  runs the same waves; so does a cloud VM.
- **Model:** any coding agent. The gates, not the model, are what make the
  output trustworthy. Frontier models via API, local models via Ollama/vLLM,
  or a mix — the method is identical.
- **Runtime:** Claude Code, Codex, OpenClaw, aider, tmux-driven shells —
  anything that gives each lane an isolated `cwd` and a shell.
- **Cost model:** the ledger (Section 6) works the same whether tokens cost
  $0 (local) or $5/M (API). Record what you actually spent.
