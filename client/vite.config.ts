import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /* 框架/图标/动效拆为独立 vendor chunk（函数形式按 node_modules 路径完整归类）：
           确保 react/jsx-runtime、scheduler 落入 react-vendor，
           motion 相关包仅介绍页按需加载，不被全站首屏预加载 */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'lucide-vendor';
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion-vendor';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]react-virtual[\\/]/.test(id)) return 'virtual-vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
