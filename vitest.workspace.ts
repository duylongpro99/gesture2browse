import { existsSync } from 'node:fs';

// packages/* always; apps/playground once Task 5 scaffolds it. Guarding the
// optional dir keeps root-level `vitest run <path>` (used by the milestone
// exit checks E2/I1-I3) working while the monorepo is still filling in.
const projects = ['packages/*'];
if (existsSync(new URL('./apps/playground', import.meta.url))) projects.push('apps/playground');

export default projects;
