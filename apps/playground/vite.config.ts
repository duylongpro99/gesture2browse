import { createReadStream, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

// The MediaPipe model ships once at the repo root (shared with the extension);
// the wasm runtime comes from the installed package. Neither is loaded from a
// CDN (tech-stack §2, §6): this middleware serves both under /models/ for the
// dev and preview servers so the bench harness stays offline and CSP-clean.
const modelPath = resolve(repoRoot, 'hand_landmarker.task');
const require = createRequire(import.meta.url);
// The package `exports` map exposes wasm files by subpath but not package.json,
// so resolve a known wasm file and take its directory.
const wasmDir = dirname(require.resolve('@mediapipe/tasks-vision/vision_wasm_internal.js'));

function send(res: ServerResponse, path: string, type: string): void {
  res.setHeader('Content-Type', type);
  createReadStream(path).pipe(res);
}

function localModels(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '').split('?')[0] ?? '';
    if (url === '/models/hand_landmarker.task' && existsSync(modelPath)) {
      send(res, modelPath, 'application/octet-stream');
      return;
    }
    if (url.startsWith('/models/wasm/')) {
      const name = url.slice('/models/wasm/'.length).replace(/[^a-zA-Z0-9._-]/g, '');
      const file = resolve(wasmDir, name);
      if (file.startsWith(wasmDir) && existsSync(file)) {
        send(res, file, name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        return;
      }
    }
    next();
  };
  return {
    name: 'local-models',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [localModels()],
  server: { port: 4173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        recorder: resolve(here, 'recorder.html'),
      },
    },
  },
});
