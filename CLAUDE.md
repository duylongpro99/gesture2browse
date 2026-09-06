# Gesture Browser Agent — Working rules

What we build: `docs/01-prd.md`. How it is shaped: `docs/02-architecture.md`, `docs/03-tech-stack.md`. If this file disagrees with them, the docs win; fix this file.

## 0. Read small

Start every session with `docs/STATUS.md` (one page: phase, milestone, plan, next task, blockers). Then read only the doc for your task:

| Task | Read |
|---|---|
| Code change inside a milestone | `docs/plans/<milestone>.md`; the `.claude/rules/<component>.md` loads itself when you touch its paths |
| One SDD task (subagent) | Your brief in `docs/sdd/<milestone>/` + the rule file named in the plan. Nothing else |
| Resuming a milestone | `docs/sdd/<milestone>/progress.md`, then the plan's `## Status` |
| Writing a milestone plan | `docs/plans/README.md` (form + list of inputs) |
| Message shape | `docs/02-architecture.md §6`, `.claude/rules/protocol.md` |
| Gesture / threshold / FSM | `docs/02-architecture.md §5`, `docs/03-tech-stack.md §4`, `docs/01-prd.md §6` |
| Security · performance · dependency | arch §7 + prd §9 · arch §8 + prd §8 · tech-stack §1–2 |
| Breaking a rule · "why did we decide X?" | `docs/adr/README.md` · `docs/05-roadmap.md §8` |

Never read at start: `docs/journal/`, `docs/sdd/` (except your own ledger), `04-feasibility`, `05-roadmap`, past ADRs. One fact from a big doc → Explore subagent, keep the conclusion.

**Writes.** Top-level session only, at session end: rewrite (never append) your row in `docs/STATUS.md` and `## Status` in `docs/plans/<milestone>.md`; history goes to `docs/journal/YYYY-MM-DD-<milestone>.md`. Subagents write only their own `task-N-report.md`. One session per milestone, in its own worktree, after claiming its STATUS row. Roadmap §8 and the STATUS Project section are owner-only; the one exception is the `driving-a-milestone` driver running `scripts/milestone/log-decision --apply` on the owner's recorded approval, which logs a merged milestone's drafted §8 row and removes its STATUS row (§6).

## 1. Plan before code

Every change starts with a plan answering the five questions in `docs/plans/README.md`: **placement** (one owning component, or the `packages/protocol` message that joins two), **boundary check** (against the owner's `.claude/rules/<component>.md`), **interfaces** (protocol Zod schema changes first, then both sides), **principles** (`docs/02-architecture.md §1`), **tests** (fixture / FSM model / snapping / e2e; a threshold or gesture change needs a fixture replay). Cannot answer one → stop and surface it. No "quick version now, refactor later".

## 2. Boundaries

Per-component boundaries are the `.claude/rules/<component>.md` files; treat them as compile errors. Repo-wide: TypeScript strict, no `any` or `@ts-ignore` without an ADR; no new runtime dependency without a row in `docs/03-tech-stack.md`; packages export only via `package.json` `exports`, no deep imports.

Refuse outright (bugs, not trade-offs): secrets in the content script or `chrome.storage`; companion, side panel, or page producing a `confirm`; video or landmarks leaving offscreen in steady state; a second place deciding gesture timing; skipping Zod on a boundary "because the sender is ours".

## 3. Deviations

Breaking §1–2 needs proven necessity (a measured budget, a Chrome API limit, a security property; never "faster"), the smallest deviation, and an ADR **before** merge, following the process in `docs/adr/README.md`. The agent drafts, the human merges: finish everything that does not depend on it, leave the draft, stop. A permanent deviation also updates the architecture doc, this file, and the rule/lint.

## 4. Conventions

pnpm + Turborepo, WXT, tsup, Vitest, Playwright (fake webcam y4m), XState v5. Layout is `docs/02-architecture.md §10` plus `scripts/`; any other top-level directory is a §3 deviation. Names come from the architecture doc (`GestureFrame`, `Intent`, `Action`, `PageCommand`, `PageEvent`, `Proposal`, `A11yItem`); no synonyms. Copy the golden path when one exists. Commit body first line states placement: `[control] add Scrolling inertia`.

## 5. Done means

Plan (§1) followed, or an ADR explains the difference · `tsc`, lint, boundary check, unit tests pass; fixture replay if thresholds changed · tests cover the behaviour · no TODO hiding an architectural question · STATUS row and plan `## Status` rewritten, proposed decisions listed for §8 · a changed boundary changes its rule file in the same PR.

## 6. Superpowers

Skills are `.claude/skills/obra-<name>`, symlinks into a shared kit: never edit the kit; overrides live here and in `docs/plans/README.md §Superpowers`. Superpowers governs *how* a session works; this file and `.claude/rules/` govern *what is allowed*. On conflict this file wins; note it in the plan `## Status`.

`driving-a-milestone` (`.claude/skills/driving-a-milestone/`, a symlink into the shared kit `milestone-kit`; scripts in `scripts/milestone/` are kit copies, `scripts/bootstrap/check` reports drift) automates the §0 session loop: a driver session spawns one worker per phase in the milestone worktree through `cris-managed-session` and relays owner gates. Driver plus one worker at a time counts as the milestone's one session; the driver writes only the STATUS claim, session briefs, and, after the PR merges and the owner says "apply", the §8 row plus STATUS-row removal through `scripts/milestone/log-decision`. Precondition and post-finish readiness come from `scripts/milestone/next`, never from the driver reading the roadmap.

Superpowers writes only into `docs/`: spec → `docs/plans/<milestone>.spec.md`, plan → `.impl.md`, SDD workspace → `docs/sdd/<milestone>/`. A hook denies `.superpowers/` and `docs/superpowers/`. Run `scripts/sdd/<name>` from the repo root, never "this skill's `scripts/`". Do not pass `--project-dir` to the brainstorming visual companion. Per-skill overrides (bounded brainstorm cannot reopen placement or interfaces; reviewer adds a boundary gate; TDD in `gesture-core` = fixture replay; verification = §5 commands; finishing = §5 and never edits §8): `docs/plans/README.md §Superpowers`.
