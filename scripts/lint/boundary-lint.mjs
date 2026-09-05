#!/usr/bin/env node
// Trust-boundary lint (CLAUDE.md §2, .claude/rules/fixtures-and-tests.md).
// Grep-based, no dependencies. Fails (exit 1) on the forbidden patterns below,
// printing `file:line  message` for each. These are compile-error-grade rules:
// they must never be relaxed without an ADR.
//
//   1. Video containment   — VideoFrame/ImageBitmap only inside offscreen.
//   2. Secret isolation    — apiKey/API_KEY only in background.ts.
//   3. No page confirm()   — the page/side panel/companion never call confirm().
//   4. One gesture-timing  — clutch/cooldown/hysteresis/dwell constants only in
//      owner              gesture-core (single gesture-timing site).
//   5. Content ↛ agent     — a content script never imports an agent package.
//
// Scope: apps/ and packages/ source. Comments and generated output are ignored.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.output', '.wxt', '.turbo', 'test-results', '.git',
]);
const EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

const OFFSCREEN = 'apps/extension/entrypoints/offscreen/';
const BACKGROUND = 'apps/extension/entrypoints/background.ts';
const CONTENT = 'apps/extension/entrypoints/content/';
const GESTURE_CORE = 'packages/gesture-core/';

/** @type {{file:string, line:number, msg:string}[]} */
const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (EXT.has(name.slice(name.lastIndexOf('.')))) checkFile(full);
  }
}

// Blank out // line comments and /* */ block comments so identifiers mentioned
// only in prose (e.g. the offscreen header comment) never trip a rule. String
// literals are kept — a forbidden identifier in a string is still a real leak.
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function report(file, code, regex, msg) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    regex.lastIndex = 0;
    if (regex.test(lines[i])) {
      violations.push({ file, line: i + 1, msg });
    }
  }
}

function checkFile(full) {
  const rel = relative(ROOT, full).split(sep).join('/');
  const raw = readFileSync(full, 'utf8');
  const code = stripComments(raw);

  // 1. Video containment: pipeline video/frames never leave the offscreen doc.
  if (!rel.startsWith(OFFSCREEN)) {
    report(full, code, /\b(VideoFrame|ImageBitmap)\b/, `VideoFrame/ImageBitmap outside offscreen (video must not leave offscreen) [${rel}]`);
  }

  // 2. Secret isolation: the API key lives only in the background service worker.
  if (rel !== BACKGROUND) {
    report(full, code, /\b(apiKey|API_KEY|ANTHROPIC_API_KEY)\b/, `secret reference outside background.ts (no secrets in content script / chrome.storage) [${rel}]`);
  }

  // 3. No confirm(): no page, side panel, or companion produces a confirm dialog.
  report(full, code, /\bconfirm\s*\(/, `confirm() call (the page/side panel must never produce a confirm) [${rel}]`);

  // 4. Single gesture-timing owner: clutch/cooldown/hysteresis/dwell/debounce
  //    constants are defined only in gesture-core's machine.
  if (!rel.startsWith(GESTURE_CORE)) {
    report(full, code, /\b(?:const|let|var|enum)\s+[A-Za-z0-9_]*(?:CLUTCH|COOLDOWN|HYSTERESIS|DWELL|DEBOUNCE)[A-Za-z0-9_]*\s*[=:]/, `gesture-timing constant defined outside gesture-core (single gesture-timing owner) [${rel}]`);
  }

  // 5. Content script must never import an agent package.
  if (rel.startsWith(CONTENT)) {
    report(full, code, /\bfrom\s+['"][^'"]*agent[^'"]*['"]/, `content script imports an agent package (trust boundary) [${rel}]`);
    report(full, code, /\bimport\s*\(\s*['"][^'"]*agent[^'"]*['"]\s*\)/, `content script dynamically imports an agent package (trust boundary) [${rel}]`);
  }
}

for (const r of ROOTS) walk(join(ROOT, r));

if (violations.length > 0) {
  violations.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  console.error(`boundary-lint: ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${relative(ROOT, v.file).split(sep).join('/')}:${v.line}  ${v.msg}`);
  }
  process.exit(1);
}

console.log('boundary-lint: OK (no trust-boundary violations)');
