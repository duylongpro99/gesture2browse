// SPA route-change content re-injection (Task 7). The content script is
// manifest-declared for <all_urls> (apps/extension/entrypoints/content/index.ts)
// so a normal full-page navigation already re-runs it. The gap this closes is
// a navigation commit (SPA route change, or any navigation right after a
// service-worker restart) for a tab whose content port is NOT currently live
// in the port registry — nothing will (re-)connect that port on its own, so
// the SW force-injects the content script via chrome.scripting.executeScript.
//
// Pure/injectable: only `scripting` + a live-port predicate + the built
// content-script file list are required, so this drives under vitest with
// plain-object fakes. No chrome.*/browser import here — background.ts is the
// only place that touches the real chrome.webNavigation/chrome.scripting and
// wires them in (.claude/rules/background.md).

export interface NavigationDetails {
  tabId: number;
  frameId: number;
  url: string;
}

export interface ScriptingApi {
  executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown>;
}

export interface ReinjectDeps {
  scripting: ScriptingApi;
  /** Does this tab currently have a live, connected content port?
   *  (ports.ts's `hasContentPort`.) */
  hasContentPort(tabId: number): boolean;
  /** The built content-script bundle path(s), e.g. ['content-scripts/content.js']. */
  contentScriptFiles: string[];
}

export interface Reinjector {
  onNavigationCommitted(details: NavigationDetails): void;
  /** Proactive SW-startup recovery (Task 7 fix round 1 / E3): for each tab id
   *  that had a connected content port before a worker restart
   *  (`ports.ts`'s `restoreState().contentTabs`), re-inject unless that tab
   *  already has a live port again — do not wait for a navigation, since a
   *  tab that never navigates again would otherwise never recover. */
  reinjectMissing(tabIds: number[]): void;
}

function reinject(deps: ReinjectDeps, tabId: number): void {
  void deps.scripting.executeScript({
    target: { tabId },
    files: deps.contentScriptFiles,
  });
}

export function createReinjector(deps: ReinjectDeps): Reinjector {
  return {
    onNavigationCommitted(details: NavigationDetails): void {
      if (details.frameId !== 0) return; // main frame only; iframes are the page's own concern.
      if (deps.hasContentPort(details.tabId)) return; // already connected — no action needed.
      reinject(deps, details.tabId);
    },
    reinjectMissing(tabIds: number[]): void {
      for (const tabId of tabIds) {
        if (deps.hasContentPort(tabId)) continue; // reconnected on its own already — skip.
        reinject(deps, tabId);
      }
    },
  };
}
