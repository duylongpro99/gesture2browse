# 1A-vertical-slice — SDD progress ledger

Tracked history for the execute phase of milestone 1A. Plan: `docs/plans/1A-vertical-slice.impl.md`. One execute session per task; write scope derived from that task's **Files:** block. Regenerate a task brief with `scripts/sdd/task-brief docs/plans/1A-vertical-slice.impl.md <N>` (from repo root). Mark a task done only when its step tests pass and it is committed as `[<component>] task <N>: <title>`.

| Task | Title | Owner rule | State | Commit |
|---|---|---|---|---|
| 1 | protocol — freeze Intent; add PageCommand, PageEvent, TransitionLogEntry, port names | `.claude/rules/protocol.md` | done | 17a4b87 |
| 2 | gesture-core — hierarchical FSM, transition log, replay surface, scroll in CSS px | `.claude/rules/gesture-core.md` | done | 48481dc |
| 3 | content — execute scroll PageCommand; announce ready | `.claude/rules/content.md` | not started | — |
| 4 | offscreen — derive & publish GestureFrame; test-only injection hook | `.claude/rules/offscreen.md` | not started | — |
| 5 | background — consume GestureFrame, run FSM, dispatch scroll | `.claude/rules/background.md` | not started | — |
| 6 | extension — Playwright e2e: fake camera scrolls a test page | `.claude/rules/fixtures-and-tests.md` | not started | — |

## Exit checks (frozen — see `docs/plans/1A-vertical-slice.md ## Exit checks`)

Run `scripts/milestone/exit-check 1A --fast` after each session.

| # | Criterion | State |
|---|---|---|
| E1 | Fixture replay produces the expected `Intent` sequence | not yet (Task 2) |
| E2 | Playwright with a fake camera scrolls a test page | not yet (Task 6) |
| E3 | boundary lint passes on all three components | not yet (Tasks 3–5) |
| I1 | GestureFrame | PASS (inherited freeze guard, 0A) |
| I2 | Intent | PASS (freeze guard; schema already final) |
| I3 | PageCommand | not yet (Task 1) |
| I4 | PageEvent | not yet (Task 1) |
| I5 | FSM state tree + transition log | not yet (Task 2) |

## Log

- 2026-09-06 (session 0, plan): planning complete. Brainstorm (architectural) → four owner questions answered 2026-09-06, all as recommended (spec §4): scroll = content-script `scrollBy` via `PageCommand{scroll}`; direct offscreen→CS port deferred to 1C (offscreen has no `chrome.tabs`); FSM freezes `Paused`+`Armed.{Idle,Scrolling}` with arch §5 names as the additive target; transition-log shape `{ts,from,to,event,intent?}` confirmed; e2e uses a test-only scripted-`GestureFrame` hook at the offscreen→SW boundary. Spec, impl plan, plan, frozen Exit-checks table, and the four new contract tests committed (I3/I4/I5 fail today; I1/I2 are freeze guards, green). SDD workspace created. Execute phase starts at Task 1. Exit-table freeze (`exit-check --freeze`) is owner-gated via the driver before execute.
