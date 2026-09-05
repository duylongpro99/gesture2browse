# Camera-grant page — `apps/extension/entrypoints/grant-camera/**`

Full-tab page whose only job is to move the `chrome-extension://` origin's camera
permission to a **persistent** grant that the offscreen document inherits (0C /
gate G2; arch §3.4). It renders status text, never video.

- **May depend on:** `navigator.mediaDevices` / `navigator.permissions`,
  `chrome.storage` (`session`/`local`), `chrome.runtime`, `chrome.tabs`, `protocol`.
- **Must never:**
  - retain or export video / `VideoFrame` / `ImageBitmap`, or render raw video —
    stop every `getUserMedia` track immediately after the grant (raw video lives
    only in the offscreen document, arch §1 / §6);
  - make network calls, or store secrets (grant state is not a secret; the "never"
    is secrets in `storage.local/sync`);
  - contain gesture-timing logic or any gesture-timing constant (single owner is
    `gesture-core`, CLAUDE.md §2);
  - produce a `confirm()` (CLAUDE.md §2; boundary-lint rule 3).
- The permission observation crosses to the service worker only as the protocol
  `CameraGrantStatus` in `chrome.storage.session`; the reader validates it with the
  Zod schema before acting. Persistence detection is a pure, unit-testable helper
  (`permission.ts`) with no browser globals.
- Consumed via `package.json` `exports`; no deep imports.
