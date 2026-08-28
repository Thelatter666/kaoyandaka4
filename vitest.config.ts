import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 与 client/vite.config.ts 的 alias 保持一致：测试中运行时值导入 @shared（如 constants）
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    passWithNoTests: true,
  },
});
