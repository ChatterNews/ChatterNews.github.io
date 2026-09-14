import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  // Be explicit for preview/proxy hosts: Studio, Booth, and Showtime can ask
  // for this origin's media devices, while cross-origin frames cannot.
  'Permissions-Policy': 'microphone=(self), camera=(self)',
};

/**
 * OpenDAW's WASM engine dynamically loads its core and device modules. Vite
 * does not discover those nested files itself, so expose them in dev and copy
 * them into every production build under the URL the engine was given.
 */
function openDawWasmAssets(): Plugin {
  const wasmDir = fileURLToPath(new URL('../../node_modules/@opendaw/studio-core-wasm/dist/wasm', import.meta.url));
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.wasm') ? [path] : [];
  });
  const serve = (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; end: (body: Buffer) => void }, next: () => void) => {
    const name = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
    const file = resolve(wasmDir, name);
    if (!file.startsWith(`${wasmDir}/`) || !file.endsWith('.wasm') || !existsSync(file)) return next();
    res.setHeader('Content-Type', 'application/wasm');
    res.end(readFileSync(file));
  };
  return {
    name: 'opendaw-wasm-assets',
    configureServer(server) { server.middlewares.use('/wasm', serve); },
    configurePreviewServer(server) { server.middlewares.use('/wasm', serve); },
    generateBundle() {
      for (const file of walk(wasmDir)) {
        this.emitFile({ type: 'asset', fileName: `wasm/${relative(wasmDir, file)}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), openDawWasmAssets()],
  resolve: {
    alias: {
      '@chatter/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  // SharedArrayBuffer is how openDAW's WASM audio worklet runs. These headers
  // must also be sent by the Tier 0/Tier 1 production host (SPEC S0 HTTPS).
  server: { port: 5173, headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
