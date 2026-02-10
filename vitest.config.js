import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/e2e/**',
        'tests/',
        '**/*.config.js',
        '**/*.config.ts',
        '**/dist/**',
        '.next/**',
      ],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}', 'tests/**/*.{test,spec}.{js,jsx,ts,tsx}', 'app/**/*.{test,spec}.{js,jsx,ts,tsx}', 'lib/**/*.{test,spec}.{js,jsx,ts,tsx}', 'server/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', '.config', '.local', '.next', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
});
