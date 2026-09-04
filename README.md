# Gesture Browser Agent

A Chrome extension that lets people operate the web with hand gestures from an ordinary webcam, paired with an LLM-powered browser agent (any OpenAI-compatible provider) that turns coarse gestures into precise actions and uses gestures as its human-in-the-loop approval signal.

## Documents

| Doc | Contents |
|---|---|
| [docs/01-prd.md](docs/01-prd.md) | Product requirements: problem, personas, gesture vocabulary, functional and non-functional requirements, safety model, metrics, roadmap, risks |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture: components, data flows, gesture state machine, interfaces, trust boundaries, performance and testing plans, repo layout |
| [docs/03-tech-stack.md](docs/03-tech-stack.md) | Technology choices by layer with alternatives and rationale, dependencies, tuning defaults, Phase-0 spike checklist |
| [docs/04-feasibility.md](docs/04-feasibility.md) | Feasibility review: ranked concerns, required doc edits, revised Phase-0 gates |
| [docs/05-roadmap.md](docs/05-roadmap.md) | Roadmap: estimation model, milestones, decision log (§8), risks |
| [docs/STATUS.md](docs/STATUS.md) | One-page current state. Read first every session |
| `docs/plans/`, `docs/adr/`, `docs/journal/` | Milestone plans, deviation records, append-only history |

## Status

Current state, next task, and blockers are in [docs/STATUS.md](docs/STATUS.md) (rewritten each session). Roadmap and decision log: [docs/05-roadmap.md](docs/05-roadmap.md).
