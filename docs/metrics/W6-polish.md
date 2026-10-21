# W6 POLISH — metrics (run 2, wave 2)

Lane: r2w2/W6-polish. Owner field-test: "nav bar renders but has no CSS, tiny at top".

| metric | value |
| --- | --- |
| started | 2026-10-21 11:12 CDT |
| baseline sync | ff-merge to main tip 5f420f4 (zoom-9 rule c3b4e7d included) |
| vitest baseline | 56/56 green (10 files) |
| tsc -b | exit 0 |
| npm run build | exit 0 |
| law scans | radius OK (23 files), no-cwc OK (43 files); determinism scan = pre-existing comment-literal false positives on main (exit 0) |
| TOWN_BADGE_MIN_ZOOM | 9 verified on main; TownBadges honors via `zoom < minZoom -> null`; constant untouched |
| CSS surface | src/index.css: .app-shell/.app-header/.app-brand/.app-nav-link(.is-active)/.app-header-actions/.map-controls(44px)/.town-badge(40px, square, accent border); --header-h token; phone <=480px stack media query |
| Header.tsx | className edits only (NavLink .is-active via isActive); no new components |
| touch targets | nav links + zoom buttons >=44px; theme toggle 44px; badges >=40px |
| spec | tests/polish.spec.ts (gated via scripts/e2e-gate.sh), 3 viewports, screenshots docs/screenshots/W6/polish-{phone,tablet,desktop}.png |
| gated spec result | 9/9 green (3 tests x phone/tablet/desktop), console-clean, ~2.1 min run |
| zoom-9 regression guard | one zoom-in click (3->6) asserts NO badges render; badges only at zoom>=9 |
| awaiting-feed state | null temps -> "awaiting feed" chip: >=11px font, #f5f5f2 on #101014, square, >=40px tall (asserted) |
| law scans final | radius OK (23 files), no-cwc OK (43 files), determinism: no new literals (pre-existing comment false-positives on main) |
| final gates | vitest 56/56, tsc -b exit 0, npm run build exit 0, gated polish.spec 9/9 |
| commits | 9aeed89 (CSS+Header+metrics), 6b24b2c (spec+screenshots) |
| deviations | none functional; node_modules + .e2e symlinked from main repo (worktree has no own install); chrome-headless zombies after runs are Z-state defunct reaped by supervisor
