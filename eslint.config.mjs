import config from '@ctrl/eslint-config-biome';

export default [
  {
    ignores: ['eslint.config.mjs', 'vitest.config.ts', 'dist', 'coverage'],
  },
  ...config,
];
