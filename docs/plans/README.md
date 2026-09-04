# Milestone plans

Three files per milestone, all named after the roadmap id (`0A-scaffold`, `1A-vertical-slice`, …):

| File | Written by | Contents |
|---|---|---|
| `<milestone>.md` | session, in `CLAUDE.md §1` form | Architecture plan: placement, boundary check, interfaces, principles, tests. Plus `## Status` (see below) and links to the two files under it. |
| `<milestone>.spec.md` | superpowers `brainstorming` | Validated design. Must answer the five §1 questions. |
| `<milestone>.impl.md` | superpowers `writing-plans` | Bite-sized tasks with code. Header "Global Constraints" names the owning `.claude/rules/<component>.md`. Run the §1 checklist on it before executing. |

Its SDD workspace is `docs/sdd/<milestone>/` (see `docs/sdd/README.md`).

Written once per milestone, after its plan inputs in `docs/05-roadmap.md §8` are present. Sessions inside a milestone read the plan, not the roadmap. Re-opening a placement or interface decision means re-planning the milestone and logging why in roadmap §8.

## `## Status` in `<milestone>.md`

Owned by the session on this milestone; rewritten, not appended.
- Done / In progress / Next
- Proposed decisions for roadmap §8 (owner logs them; the agent does not edit §8)
- Blockers

`docs/STATUS.md` holds only the one-sentence summary row that points here.
