# Gesture Browser Agent — Working rules

Source of truth for *what* we build: `docs/01-prd.md`. For *how it is shaped*: `docs/02-architecture.md` and `docs/03-tech-stack.md`. If this file and those docs disagree, the docs win and this file is wrong; fix this file.

## 0. What to read, and when (keep sessions small)

Docs are split into **state** (small, rewritten) and **history** (append-only, never read at start). Do not read all of `docs/` to begin a task.

**Always, at session start:** `docs/STATUS.md` (one page). It names the phase, milestone, current plan, next task, and blockers.

**Then, by task type — read the section named, not the whole file:**

| Task | Read |
|---|---|
| Any code change inside a milestone | `docs/plans/<milestone>.md`; the matching `.claude/rules/<component>.md` loads automatically when you touch its paths |
| Implementing one SDD task (subagent) | Your task brief in `docs/sdd/<milestone>/`, the rule file named in the plan's Global Constraints. Nothing else. |
| Resuming a milestone mid-way | `docs/sdd/<milestone>/progress.md` (ledger), then the plan's `## Status` |
| Writing a milestone plan | Roadmap milestone row (`docs/05-roadmap.md §3–6`), its plan inputs in `§8`, `docs/02-architecture.md §3` for the component, `§6` for interfaces |
| New or changed message shape | `docs/02-architecture.md §6`, `.claude/rules/protocol.md` |
| Gesture, threshold, FSM behaviour | `docs/02-architecture.md §5`, `docs/03-tech-stack.md §4` (tuning defaults), `docs/01-prd.md §6` (vocabulary) |
| Security / privacy question | `docs/02-architecture.md §7`, `docs/01-prd.md §9` |
| Performance budget | `docs/02-architecture.md §8`, `docs/01-prd.md §8` |
| Adding a dependency | `docs/03-tech-stack.md §1–2` |
| Breaking a rule | `docs/adr/README.md` (index), then only the ADR that matters; §3 below |
| "Why did we decide X?" | `docs/05-roadmap.md §8` decision log; `docs/04-feasibility.md` only if the log points there |

**Never read at session start:** `docs/journal/`, `docs/sdd/` (except your own ledger when resuming), `docs/04-feasibility.md` in full, `docs/05-roadmap.md` in full, past ADRs. If a doc is large and you need one fact, delegate the read to an Explore subagent and keep the conclusion.

**At session end (top-level session only):** update your row in `docs/STATUS.md` and the `## Status` section of your `docs/plans/<milestone>.md`. Rewrite, do not append. Proposed decisions go into the plan's Status; the owner logs them in `docs/05-roadmap.md §8`. Anything else worth keeping goes to `docs/journal/YYYY-MM-DD-<milestone>.md`.

**Concurrency rules (subagents, parallel sessions):**
- Subagents and background agents never write `STATUS.md`, plan files, roadmap, or journal. They return results; the top-level session writes. The only file an SDD implementer writes outside code is its own `task-N-report.md` in `docs/sdd/<milestone>/`.
- Parallel sessions on the same repo each run in their own git worktree, one milestone per session. Never two sessions on one milestone; check the "Active workstreams" table and claim your row first.
- In `STATUS.md`, a session edits only its own workstream row. The Project section and roadmap §8 are owner/integration-session only.
- Journal files are named per milestone so appends never collide.

## 1. Architecture-first planning (mandatory before any code)

Every task, however small, starts with a plan that is checked against the architecture **before** implementation. A plan is not done until it answers, in writing (plan mode, PR description, or a short note in the task):

1. **Placement.** Which component owns the change: offscreen (perception), service worker (control), content script (page), side panel (UI), companion (agent), or a `packages/*` library? One owner. If the answer is "two components", the plan must name the message in `packages/protocol` that connects them.
2. **Boundary check.** List the imports and runtime APIs the change needs and confirm each is allowed for that component (see §2). Anything not allowed is either a redesign or a formal deviation (§3), never a quiet exception.
3. **Interfaces touched.** Does it add or change a `GestureFrame`, `PageCommand`, `PageEvent`, `CompanionMsg`, `CompanionEvt`, `Intent`, or `Action` shape? If yes, the Zod schema in `packages/protocol` changes first, then both sides.
4. **Principle check.** Re-read the five principles in `docs/02-architecture.md §1` (two loops two speeds; video stays in one process; page is hostile; agent proposes human disposes; replaceable parts) and state which ones the change touches and how it respects them.
5. **Tests.** Which fixture, FSM model test, snapping test, or e2e asserts the behaviour. A threshold or gesture change without a fixture replay is incomplete.

When a plan cannot satisfy one of these, stop and surface it. Do not "start with a quick version and refactor later"; that is how anti-patterns enter.

## 2. Hard boundaries (enforced by lint/CI; treat as compile errors)

Per-component boundaries live in `.claude/rules/<component>.md` and load automatically when you touch matching paths. When planning a change, read the rule file for its owner explicitly:

`gesture-core` · `page-index` · `protocol` · `offscreen` · `background` · `content` · `sidepanel` · `companion` · `fixtures-and-tests`

Those files are the single source for "may depend on / must never". Do not copy the table back here.

Cross-cutting rules:
- All cross-boundary messages (Port, native messaging, storage) are validated with the Zod schema from `packages/protocol` at the receiving side. No ad-hoc `postMessage({...})` shapes.
- Gesture timing, hysteresis, cooldowns, confidence gating live in the XState machine in `gesture-core`. Never in the recognizer, never in the content script, never as `setTimeout` chains.
- Only an event originating in the perception pipeline (or the keyboard shortcut) can confirm a guarded action. No code path from the companion, side panel button, or page can produce a `confirm`.
- Content-script `dispatchEvent` is the *fallback* input path only; CDP is primary. Do not add features that work only via synthetic events.
- Camera frames, landmarks, and screenshots are not persisted unless the user records custom gestures or opts into diagnostics.
- Packages expose a public API via `exports` in `package.json`; deep imports into another package's `src/` are forbidden.
- TypeScript strict; no `any`, no `@ts-ignore` without a linked deviation record (§3).
- No new runtime dependency without a row in `docs/03-tech-stack.md` explaining why the chosen alternative is insufficient.

## 3. Deviations: only when necessary, always explicit

Breaking a rule in §1 or §2 is sometimes the right trade-off. It is never the default. The process:

1. **Prove necessity first.** Show that the architecture-conforming approach was attempted or reasoned through and fails on a concrete requirement (a measured performance budget from `docs/02-architecture.md §8`, a Chrome API constraint, a security property). "Faster to write" or "simpler for this ticket" is not necessity.
2. **Prefer the smallest deviation.** A local, contained exception behind the existing interface beats a change to the interface, which beats a change to component ownership.
3. **Record it before merging.** Add `docs/adr/NNNN-<slug>.md` with: context, the rule being broken, the alternative that was rejected and why, the blast radius, and an exit condition (when and how it gets removed or promoted into the architecture). Reference the ADR id in the code comment at the deviation site and in the PR.
4. **Update the guardrail, not just the code.** If the deviation is permanent, update `docs/02-architecture.md`, this file, and the lint/dependency rules so the new shape is enforced. A rule that is broken in one place and enforced elsewhere is the worst state.
5. **The human decides.** An agent may propose a deviation with the ADR drafted; it does not merge one on its own judgement. If working autonomously, finish everything that does not depend on the deviation, leave the ADR draft, and stop at that point.

Deviation smells to refuse outright (these are not trade-offs, they are bugs): secrets in the content script or `chrome.storage`; the companion or side panel triggering an action without an FSM `confirm`; video or landmarks leaving the offscreen document in steady state; a second place that decides gesture timing; bypassing Zod validation on a boundary "because the sender is ours".

## 4. Conventions

- pnpm workspaces + Turborepo; WXT for the extension; tsup for packages; Vitest for unit, Playwright for e2e (fake webcam y4m); XState v5 for the FSM.
- Repo layout follows `docs/02-architecture.md §10`, plus `scripts/` (repo tooling: `scripts/sdd/`, `scripts/hooks/`). New code goes into an existing directory there; any other new top-level directory is a §3 deviation. `.superpowers/` and `docs/superpowers/` are forbidden (§6) and blocked by a hook.
- Name things after the architecture doc: `GestureFrame`, `Intent`, `Action`, `PageCommand`, `PageEvent`, `Proposal`, `A11yItem`. Do not introduce synonyms.
- Copy the golden path when one exists (first vertical slice: gesture → FSM → action → test). Prefer imitating existing conforming code over inventing a new pattern.
- Commit messages and PR descriptions state placement (§1.1) in the first line body, e.g. `[control] add Scrolling inertia`.

## 5. Definition of done for any change

- Plan in §1 form exists and was followed, or an ADR explains the difference.
- `tsc`, lint, dependency-boundary check, and unit tests pass locally.
- Fixtures or tests cover the behaviour; threshold changes replay the recorded gesture fixtures.
- No new TODO that hides an architectural question; such questions become an ADR draft or a task.
- Your `docs/STATUS.md` workstream row and `docs/plans/<milestone>.md ## Status` rewritten to reflect the new state (STATUS under 60 lines). Proposed decisions listed in the plan for the owner to log in roadmap §8. Nothing appended to STATUS; history goes to `docs/journal/`.
- If a boundary changed, the matching `.claude/rules/<component>.md` changed in the same PR.

## 6. Working with the superpowers skills

Superpowers governs *how a session works* (brainstorm → spec → plan → subagent execution with TDD → review → finish). This file and `.claude/rules/` govern *what is allowed*. On conflict this file wins; note the conflict in the plan's `## Status`.

**Paths. Superpowers writes into `docs/`, nowhere else.** A hook (`scripts/hooks/guard-superpowers-paths.sh`, wired in `.claude/settings.json`) denies any tool call touching `.superpowers/` or `docs/superpowers/`, and denies running the plugin's own sdd scripts.

| Superpowers default | Here |
|---|---|
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | `docs/plans/<milestone>.spec.md` |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | `docs/plans/<milestone>.impl.md` |
| `.superpowers/sdd/<plan>/` via the skill's `scripts/sdd-workspace` | `docs/sdd/<milestone>/` via **`scripts/sdd/sdd-workspace`** (same for `task-brief`, `review-package`: same arguments, same output) |

Wherever a superpowers skill says "run this skill's `scripts/<name>`", run `scripts/sdd/<name>` from the repo root instead.

**Process fit:**
- `brainstorming` / `writing-plans`: "explore project state" means the §0 table, not all of `docs/`. The spec answers the five §1 questions. The plan header "Global Constraints" names the owning `.claude/rules/<component>.md`.
- Two plan tiers: `docs/plans/<milestone>.md` (architecture, §1, `## Status`) links to `.spec.md` and `.impl.md`. Run the §1 checklist on the `.impl.md` before `executing-plans` or `subagent-driven-development`; a boundary error in the plan multiplies into every task.
- Task reviewer adds a third gate to spec compliance and code quality: boundary check against the rule file. A violation is a blocker unless an ADR is linked.
- `test-driven-development` in `gesture-core`: the failing test for a threshold or filter change is a fixture replay.
- `using-git-worktrees` is the mechanism for the parallel-session rule in §0.
- `finishing-a-development-branch` also runs §5: exit criteria from the roadmap row, STATUS row, plan `## Status`, proposed §8 decisions. It never edits §8.
