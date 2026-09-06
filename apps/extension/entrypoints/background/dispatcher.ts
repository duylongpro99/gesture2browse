import { PageCommandSchema, type Intent, type PageCommand } from '@gesture/protocol';

// Pure Intent -> PageCommand mapping (Task 5, 1A vertical slice). No `browser`
// captured here — the target port is injected so this is driveable in vitest
// with no chrome.*/browser globals (docs/sdd/1A-vertical-slice/task-5-brief.md).

// Anything that can receive a PageCommand: a real chrome.runtime.Port or a test
// double. Only the one method this module needs is required.
export interface CommandTarget {
  postMessage(command: PageCommand): void;
}

// Maps an emitted Intent to a PageCommand and posts it to the active content
// port. `Scroll` is the only 1A intent with a page-visible effect; `Arm`/`Pause`
// are FSM-state-only in this milestone (no PageCommand — arch §6, 1C adds more).
export function dispatchIntent(intent: Intent, target: CommandTarget | null): void {
  if (intent.type !== 'Scroll') return;
  const command = PageCommandSchema.parse({ type: 'scroll', dy: intent.dy });
  target?.postMessage(command);
}
