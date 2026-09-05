import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type UserManifest } from 'wxt';

// 0A: buildable MV3 + React skeleton. 0B/G1 fills the offscreen frame pump:
// getUserMedia -> MediaStreamTrackProcessor -> Worker -> MediaPipe HandLandmarker
// on an OffscreenCanvas. Permissions were declared in 0A so the manifest shape
// is fixed; 0B only adds the MediaPipe assets and their web_accessible_resources.
//
// `debugger` is optional on purpose: trusted-click mode requests it at runtime
// via chrome.permissions.request so the CDP infobar appears only on opt-in
// (03-tech-stack B1 / §1 "Input dispatch"; roadmap G5). WXT's generated
// ManifestOptionalPermission type excludes `debugger`, but Chrome accepts it as
// optional and `wxt build` emits it verbatim, so cast past the over-strict type.
const optionalPermissions = ['debugger'] as unknown as UserManifest['optional_permissions'];

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// MediaPipe assets are served locally (tech-stack §2/§6: no CDN, CSP + offline).
// They are copied into the build at build time, not committed: the 7.5 MB
// hand_landmarker.task lives once at the repo root, and the WASM ships inside the
// pinned @mediapipe/tasks-vision package. `build:publicAssets` copies both into
// the output under /models and /wasm; only public/models/.gitkeep is committed.
const repoRoot = resolve(here, '../..');
const modelSrc = resolve(repoRoot, 'hand_landmarker.task');
const wasmDir = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Gesture Browser Agent',
    permissions: ['offscreen', 'sidePanel', 'storage', 'tabs', 'scripting'],
    optional_permissions: optionalPermissions,
    host_permissions: ['<all_urls>'],
    optional_host_permissions: ['https://*/*'],
    web_accessible_resources: [
      { resources: ['models/*', 'wasm/*'], matches: ['<all_urls>'] },
    ],
    // MediaPipe instantiates its WASM runtime from fetched bytes, which MV3
    // permits only with 'wasm-unsafe-eval' in the extension-pages CSP.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  hooks: {
    'build:publicAssets'(_wxt, files) {
      files.push({ absoluteSrc: modelSrc, relativeDest: 'models/hand_landmarker.task' });
      for (const name of readdirSync(wasmDir)) {
        files.push({ absoluteSrc: join(wasmDir, name), relativeDest: `wasm/${name}` });
      }
    },
  },
});
