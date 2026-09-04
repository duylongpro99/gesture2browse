# Journal

Append-only history. Nobody reads this at session start.

File name: `YYYY-MM-DD-<milestone>.md` (e.g. `2026-09-10-0A.md`). One file per session per milestone, so parallel sessions never touch the same file. Owner notes without a milestone use `YYYY-MM-DD-owner.md`.

Use it for: what was tried and abandoned, measurements, live-test notes with diagnostics exports.
Do not use it for: current state (→ `docs/STATUS.md`, `docs/plans/<milestone>.md ## Status`), decisions (→ `docs/05-roadmap.md §8`, owner only), rule exceptions (→ `docs/adr/`).
