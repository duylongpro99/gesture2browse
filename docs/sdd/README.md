# SDD workspaces

One directory per milestone, created by `scripts/sdd/sdd-workspace docs/plans/<milestone>.impl.md`.
Holds the superpowers subagent-driven-development artifacts: `progress.md` (ledger, tracked), `task-N-brief.md`, `task-N-report.md`, `review-*.diff` (scratch, gitignored).
Nobody reads this at session start. A session resuming a milestone reads only its own `progress.md`.
