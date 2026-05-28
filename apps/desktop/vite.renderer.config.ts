import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@take-control/shared': path.resolve(monorepoRoot, 'packages/shared/dist/index.js'),
    },
    modules: [
      path.resolve(monorepoRoot, 'node_modules'),
      path.resolve(__dirname, 'node_modules'),
      'node_modules',
    ],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', '@take-control/shared'],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'),
    },
  },
});
