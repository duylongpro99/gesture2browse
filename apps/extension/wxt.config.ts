import { defineConfig, type UserManifest } from 'wxt';

// 0A: buildable MV3 + React skeleton only. Entrypoints are stubs; perception
// (0B), classifier wiring (1B), content/cursor (1C), camera grant (1D.1) fill
// them later. Permissions are declared now so the manifest shape is fixed.
//
// `debugger` is optional on purpose: trusted-click mode requests it at runtime
// via chrome.permissions.request so the CDP infobar appears only on opt-in
// (03-tech-stack B1 / §1 "Input dispatch"; roadmap G5). WXT's generated
// ManifestOptionalPermission type excludes `debugger`, but Chrome accepts it as
// optional and `wxt build` emits it verbatim, so cast past the over-strict type.
const optionalPermissions = ['debugger'] as unknown as UserManifest['optional_permissions'];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Gesture Browser Agent',
    permissions: ['offscreen', 'sidePanel', 'storage', 'tabs', 'scripting'],
    optional_permissions: optionalPermissions,
    host_permissions: ['<all_urls>'],
    optional_host_permissions: ['https://*/*'],
  },
});
