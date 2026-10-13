/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    /**
     * Old tablets are exactly what gets repurposed as a television in this
     * house, and an iPad mini 2 tops out at iOS 12.5 / Safari 12.1. Vite's
     * default target is Safari 14, so the bundle used `??` and `?.` — syntax
     * Safari 12 cannot parse. It downloaded the script and then failed silently
     * with a SyntaxError: a blank page and no visible error.
     *
     * Safari 12 supports ES modules and native HLS, so it only needs the syntax
     * lowered; nothing about the player's design excludes it.
     */
    target: ['es2017', 'safari12'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
