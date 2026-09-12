import { describe, expect, it, vi } from 'vitest';
import {
  type Bbox,
  type DebuggerApi,
  type PermissionsApi,
  createCdp,
} from '../entrypoints/background/cdp';

function fakeDebugger() {
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  let onDetachCb: ((s: { tabId?: number }, r: string) => void) | undefined;
  const dbg: DebuggerApi = {
    attach: vi.fn(async () => {}),
    detach: vi.fn(async () => {}),
    sendCommand: vi.fn(async (_t, method, params) => {
      calls.push({ method, params: params as Record<string, unknown> });
      if (method === 'Runtime.evaluate') return { result: { value: [50, 20] } };
      return {};
    }),
    onDetach: {
      addListener: (cb) => {
        onDetachCb = cb;
      },
    },
  };
  return { dbg, calls, fireDetach: (tabId: number) => onDetachCb?.({ tabId }, 'canceled_by_user') };
}

function grantedPermissions(): PermissionsApi {
  return { contains: vi.fn(async () => false), request: vi.fn(async () => true) };
}

describe('createCdp', () => {
  it('requests the optional debugger permission and attaches on first Arm', async () => {
    const { dbg } = fakeDebugger();
    const permissions = grantedPermissions();
    const cdp = createCdp({ debugger: dbg, permissions });
    await cdp.attach(7);
    expect(permissions.request).toHaveBeenCalledWith({ permissions: ['debugger'] });
    expect(dbg.attach).toHaveBeenCalledWith({ tabId: 7 }, '1.3');
    expect(cdp.isAttached(7)).toBe(true);
    expect(cdp.preferCdp(7)).toBe(true);
  });

  it('stays on the fallback when the permission is denied', async () => {
    const { dbg } = fakeDebugger();
    const permissions: PermissionsApi = {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => false),
    };
    const cdp = createCdp({ debugger: dbg, permissions });
    await cdp.attach(7);
    expect(dbg.attach).not.toHaveBeenCalled();
    expect(cdp.preferCdp(7)).toBe(false);
  });

  it('external onDetach clears attach state', async () => {
    const { dbg, fireDetach } = fakeDebugger();
    const cdp = createCdp({ debugger: dbg, permissions: grantedPermissions() });
    await cdp.attach(7);
    expect(cdp.isAttached(7)).toBe(true);
    fireDetach(7);
    expect(cdp.isAttached(7)).toBe(false);
    expect(cdp.preferCdp(7)).toBe(false);
  });

  it('trustedClick dispatches press+release at the scrolled-in-view box centre', async () => {
    const { dbg, calls } = fakeDebugger();
    const cdp = createCdp({ debugger: dbg, permissions: grantedPermissions() });
    await cdp.attach(7);
    const bbox: Bbox = [0, 0, 100, 40];
    await cdp.trustedClick(7, bbox);
    const evaluate = calls.find((c) => c.method === 'Runtime.evaluate');
    expect(evaluate).toBeTruthy(); // the scroll-into-view step
    const mouse = calls.filter((c) => c.method === 'Input.dispatchMouseEvent');
    expect(mouse.map((c) => c.params?.type)).toEqual(['mousePressed', 'mouseReleased']);
    // fake evaluate returns centre [50, 20]
    expect(mouse.every((c) => c.params?.x === 50 && c.params?.y === 20)).toBe(true);
  });
});
