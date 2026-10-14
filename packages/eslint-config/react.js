import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import base from './base.js';

/**
 * Flat config preset for React (Vite / TanStack Start) applications.
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // TanStack Router route files intentionally export a non-component `Route`
    // object alongside their component, which trips this HMR-only heuristic.
    files: ['**/routes/**/*.{ts,tsx}', '**/router.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
];
