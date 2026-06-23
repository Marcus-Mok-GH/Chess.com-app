import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'chess': ['chess.js', 'react-chessboard'],
          'socket': ['socket.io-client', 'ws']
        }
      }
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
    watch: {
      usePolling: false,
      interval: 1000,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.vscode/**',
        '**/.idea/**',
        '**/dist/**',
        '**/.spec-flow/**',
        '**/.claude/**',
        '**/.cache/**',
        '**/.venv/**',
        '**/.pythonlibs/**',
        '**/.opencode/**',
        '**/.kiro/**',
        '**/.crush/**',
        '**/.cursor/**',
        '**/.local/**',
        '**/.upm/**',
        '**/public/stockfish.*',
      ]
    }
  },
});
