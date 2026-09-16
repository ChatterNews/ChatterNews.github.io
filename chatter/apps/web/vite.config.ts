import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  // Be explicit for preview/proxy hosts: Booth and Showtime can ask
  // for this origin's media devices, while cross-origin frames cannot.
  'Permissions-Policy': 'microphone=(self), camera=(self)',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@chatter/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  // Local media processing and the browser reader require cross-origin isolation.
  server: { port: 5173, headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
