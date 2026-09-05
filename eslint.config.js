import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.output/**', '**/node_modules/**', '**/.turbo/**'],
  },
  ...tseslint.configs.recommended,
);
