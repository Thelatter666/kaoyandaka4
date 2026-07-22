import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /* 框架/图标/动效拆为独立 vendor chunk：
           跨页面共享、长缓存，业务 chunk 保持小巧 */
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'lucide-vendor': ['lucide-react'],
          'motion-vendor': ['framer-motion'],
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
