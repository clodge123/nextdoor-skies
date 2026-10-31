# AGENTS.md — Nextdoor Skies

Guidance for coding agents working in this repository (Codex, Claude Code,
OpenClaw, aider, or any agent that reads repo instructions).

## Project

Neighborhood weather app: MapLibre map with live town temperature badges,
neighborhood feed, weather alerts, and map snapshots. React 19 + TypeScript
+ Vite, serverless API routes over Postgres, weather from Open-Meteo.
Live: https://nextdoor-skies-run2.vercel.app

## Commands

- `npm run dev` — dev server (Node 22.x)
- `npm run typecheck` · `npm test` (vitest) · `npm run build`
- `npm run check:all` — law scans (determinism, corner-radius, import hygiene)
- `npx playwright test` — browser suite (phone/tablet/desktop viewports)
- `npm run smoke:prod` — probe the deployed app matches local behavior

## Laws (enforced by gates — violating these fails CI)

- **No silent fallbacks.** Missing data renders nothing (or an explicit
  empty state) — never a placeholder, zero, or lookalike.
- **Determinism:** no `Math.random()` / `Date.now()` in render code.
- **Geometry:** touch targets ≥ 44px; square corners (`border-radius: 0`);
  badge boxes never cover town labels.
- **Theme tokens:** CSS uses theme variables, never raw hex colors.
- **Deploy once per wave.** All testing happens locally; the deploy proves
  parity with the local build.

## Working here

- Read `docs/DEFINITION-OF-DONE.md` before claiming work is complete.
- Run the gates yourself; never report "done" on an agent's say-so.
- Fix the law, not the symptom: a bug means a law was violated, and the
  test encoding that law gets updated in the same commit.

## Multi-agent waves

This project ships features in parallel "waves" of coding agents. The full
method — brief, lanes in isolated git worktrees, gate stack, gated merges,
one deploy, metrics ledger, closeout sweep — is documented in
[`skills/fleet-wave-orchestration/SKILL.md`](skills/fleet-wave-orchestration/SKILL.md).
It is runtime-agnostic: works with Claude Code, Codex, OpenClaw, tmux panes,
on any hardware (local models, API models, or a mix).
