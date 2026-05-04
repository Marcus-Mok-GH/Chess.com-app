import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
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
  define: {
    'process.env.VITE_SERVER_URL': JSON.stringify(process.env.VITE_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'),
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL || ''),
    'process.env.NEXT_PUBLIC_SOCKET_URL': JSON.stringify(process.env.NEXT_PUBLIC_SOCKET_URL || process.env.VITE_SOCKET_URL || '')
  }
});
