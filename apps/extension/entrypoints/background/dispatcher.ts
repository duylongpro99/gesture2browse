import { type Intent, type PageCommand, PageCommandSchema } from '@gesture/protocol';
import type { Actions } from './actions';
import type { Bbox, Cdp } from './cdp';

// Intent → effect mapping (1A: Scroll; 1C: the action gestures). Pure: the
// content port, CDP module, nav actions, live hover and profile are injected, so
// this drives under vitest with no chrome.*/browser globals. Policy lives here
// (the page is hostile); no gesture timing (that is gesture-core, CLAUDE.md §2).

export interface CommandTarget {
  postMessage(command: PageCommand): void;
}

export type Profile = 'standard' | 'accessibility';

export interface DispatchCtx {
  /** Active content port (fallback dispatch + pointer/hover plane). */
  target: CommandTarget | null;
  /** Active tab id, for CDP/nav; null when unknown. */
  tabId: number | null;
  cdp: Pick<Cdp, 'preferCdp' | 'trustedClick' | 'trustedDrag' | 'attach' | 'detach'>;
  actions: Pick<Actions, 'back' | 'forward'>;
  /** Last hover reported by the content script for the active tab. */
  hover: () => { id: number | null; bbox?: Bbox };
  profile: () => Profile;
  /** Mutable: the bbox a CDP drag started from (set on DragStart). */
  drag?: Bbox;
}

/**
 * Execute one emitted Intent. Click/DragStart/DragEnd take the trusted CDP path
 * when `debugger` is granted+attached, else the synthetic `fallbackClick` on the
 * content side. Swipe drives back/forward in the Standard profile (off in
 * Accessibility). Arm/Pause drive the per-session CDP attach/detach. Scroll is
 * the frozen 1A command, unchanged — inertia decay was already applied upstream
 * in the FSM (single timing owner).
 */
export async function dispatchIntent(intent: Intent, ctx: DispatchCtx): Promise<void> {
  const { target, tabId } = ctx;
  switch (intent.type) {
    case 'Scroll':
      target?.postMessage(PageCommandSchema.parse({ type: 'scroll', dy: intent.dy }));
      return;

    case 'Arm':
      if (tabId !== null) await ctx.cdp.attach(tabId);
      return;
    case 'Pause':
      if (tabId !== null) await ctx.cdp.detach(tabId);
      return;

    case 'Click': {
      const hover = ctx.hover();
      if (tabId !== null && ctx.cdp.preferCdp(tabId) && hover.id === intent.id && hover.bbox) {
        await ctx.cdp.trustedClick(tabId, hover.bbox);
      } else {
        target?.postMessage({ type: 'fallbackClick', id: intent.id });
      }
      return;
    }

    case 'DragStart': {
      const hover = ctx.hover();
      // CDP-only: a trusted drag needs trusted press/move/release. Without the
      // debugger permission, drag is unavailable (content synthetic events can't
      // drive a real drag) — record nothing so DragEnd is a no-op.
      ctx.drag = tabId !== null && ctx.cdp.preferCdp(tabId) ? hover.bbox : undefined;
      return;
    }
    case 'DragEnd': {
      if (tabId !== null && ctx.drag && ctx.cdp.preferCdp(tabId)) {
        await ctx.cdp.trustedDrag(tabId, ctx.drag, ctx.hover().bbox ?? ctx.drag);
      }
      ctx.drag = undefined;
      return;
    }

    case 'Swipe':
      if (tabId === null || ctx.profile() === 'accessibility') return; // swipe off in Accessibility
      await (intent.dir === 'left' ? ctx.actions.back(tabId) : ctx.actions.forward(tabId));
      return;

    case 'HoldGesture':
      // Hold triggers 2A's Agent.* observe/confirm path — no direct dispatch in 1C.
      return;
  }
}
