// 0A stub. Cursor overlay (1C) and input dispatch (1D.1) fill this in. Must never
// import an agent package (trust-boundary lint, .claude/rules/fixtures-and-tests.md).
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {},
});
