// CDP trusted-input path (G5, arch §3.3). The service worker attaches
// `chrome.debugger` per gesture-session (on Arm while armed, detach on Pause /
// external onDetach) and dispatches TRUSTED `Input.dispatchMouseEvent`s — the
// input a hostile page cannot forge and a content script's synthetic events
// cannot replace (.claude/rules/background.md: CDP is the primary path, synthetic
// the fallback). All chrome.* is injected so this drives under vitest fakes.

export type Bbox = [number, number, number, number];

export interface DebuggerApi {
  attach(target: { tabId: number }, requiredVersion: string): Promise<void>;
  detach(target: { tabId: number }): Promise<void>;
  sendCommand(target: { tabId: number }, method: string, params?: object): Promise<unknown>;
  onDetach: { addListener(cb: (source: { tabId?: number }, reason: string) => void): void };
}

export interface PermissionsApi {
  contains(perm: { permissions: string[] }): Promise<boolean>;
  request(perm: { permissions: string[] }): Promise<boolean>;
}

export interface Cdp {
  /** Attach to the tab for a gesture-session (requests the optional `debugger`
   *  permission on first need; a denial leaves CDP unavailable → fallback). */
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  isAttached(tabId: number): boolean;
  /** True when `debugger` is granted AND this tab is attached — else use the
   *  synthetic fallback. */
  preferCdp(tabId: number): boolean;
  trustedClick(tabId: number, bbox: Bbox): Promise<void>;
  trustedDrag(tabId: number, from: Bbox, to: Bbox): Promise<void>;
}

const CDP_VERSION = '1.3';
const DEBUGGER_PERM = { permissions: ['debugger'] };

function center([x, y, w, h]: Bbox): [number, number] {
  return [x + w / 2, y + h / 2];
}

export interface CdpDeps {
  debugger: DebuggerApi | null;
  permissions: PermissionsApi | null;
}

export function createCdp(deps: CdpDeps): Cdp {
  const dbg = deps.debugger;
  const attached = new Set<number>();
  // null = not yet asked; true/false = the resolved optional-permission grant.
  let granted: boolean | null = null;

  dbg?.onDetach.addListener((source) => {
    if (typeof source.tabId === 'number') attached.delete(source.tabId);
  });

  const ensurePermission = async (): Promise<boolean> => {
    if (granted !== null) return granted;
    if (!deps.permissions) {
      granted = false;
      return false;
    }
    granted =
      (await deps.permissions.contains(DEBUGGER_PERM)) ||
      (await deps.permissions.request(DEBUGGER_PERM));
    return granted;
  };

  const dispatchMouse = async (
    tabId: number,
    type: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
    x: number,
    y: number,
  ): Promise<void> => {
    await dbg?.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
    });
  };

  // Scroll the target region into view and return its fresh centre. CDP Input
  // uses viewport coords (G5 caveat), so a target that scrolled must be brought
  // back before the mouse dispatch; the evaluate is that scroll-into-view.
  const centreInView = async (tabId: number, bbox: Bbox): Promise<[number, number]> => {
    const [cx, cy] = center(bbox);
    if (!dbg) return [cx, cy];
    const expression = `(() => { const el = document.elementFromPoint(${cx}, ${cy}); el?.scrollIntoView({ block: 'center', inline: 'center' }); const r = el?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : [${cx}, ${cy}]; })()`;
    const res = (await dbg.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
    })) as { result?: { value?: [number, number] } } | undefined;
    return res?.result?.value ?? [cx, cy];
  };

  return {
    async attach(tabId) {
      if (!dbg || attached.has(tabId)) return;
      if (!(await ensurePermission())) return;
      await dbg.attach({ tabId }, CDP_VERSION);
      attached.add(tabId);
    },
    async detach(tabId) {
      if (!dbg || !attached.has(tabId)) return;
      attached.delete(tabId);
      await dbg.detach({ tabId });
    },
    isAttached(tabId) {
      return attached.has(tabId);
    },
    preferCdp(tabId) {
      return granted === true && attached.has(tabId);
    },
    async trustedClick(tabId, bbox) {
      const [cx, cy] = await centreInView(tabId, bbox);
      await dispatchMouse(tabId, 'mousePressed', cx, cy);
      await dispatchMouse(tabId, 'mouseReleased', cx, cy);
    },
    async trustedDrag(tabId, from, to) {
      const [fx, fy] = await centreInView(tabId, from);
      const [tx, ty] = center(to);
      await dispatchMouse(tabId, 'mousePressed', fx, fy);
      await dispatchMouse(tabId, 'mouseMoved', tx, ty);
      await dispatchMouse(tabId, 'mouseReleased', tx, ty);
    },
  };
}
