import type { SessionDirectory, StoryFileHandle } from './finish-session.js';

/** The desktop preload exposes only operations inside the package's save folder. */
export interface DesktopDriveBridge {
  getInfo(): Promise<{ saveFolderLabel: string; version: string }>;
  createDirectory(segments: string[]): Promise<void>;
  beginWrite(segments: string[]): Promise<string>;
  appendWrite(token: string, bytes: Uint8Array): Promise<void>;
  commitWrite(token: string): Promise<void>;
  abortWrite(token: string): Promise<void>;
  statFile(segments: string[]): Promise<{ size: number }>;
  readFile(segments: string[], start: number, end: number): Promise<Uint8Array>;
}

const CHUNK_BYTES = 1024 * 1024;

export function getDesktopDrive(): DesktopDriveBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { orbitDesktop?: DesktopDriveBridge }).orbitDesktop;
}

export function desktopStoryFileName(slug: string): string {
  const name = slug.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').slice(0, 80) || 'story';
  return `Story-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.chatter`;
}

function desktopFile(bridge: DesktopDriveBridge, segments: string[]): StoryFileHandle {
  return {
    async createWritable() {
      const token = await bridge.beginWrite(segments);
      let finished = false;
      return {
        async write(blob) {
          if (finished) throw new Error('This save has already closed. Start a new save.');
          for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
            await bridge.appendWrite(token, new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
          }
        },
        async close() {
          if (finished) throw new Error('This save has already closed.');
          await bridge.commitWrite(token);
          finished = true;
        },
        async abort() {
          if (finished) return;
          await bridge.abortWrite(token);
          finished = true;
        },
      };
    },
    async getFile() {
      const { size } = await bridge.statFile(segments);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('The saved file size could not be checked.');
      return {
        size,
        slice(start, end) {
          const first = Math.max(0, Math.min(size, start < 0 ? size + start : start));
          const last = Math.max(first, Math.min(size, end < 0 ? size + end : end));
          return {
            async arrayBuffer() {
              const bytes = new Uint8Array(last - first);
              for (let offset = first; offset < last; offset += CHUNK_BYTES) {
                const stop = Math.min(last, offset + CHUNK_BYTES);
                const chunk = await bridge.readFile(segments, offset, stop);
                if (chunk.byteLength !== stop - offset) throw new Error('The saved file is incomplete. Keep Orbit open and retry.');
                bytes.set(chunk, offset - first);
              }
              return bytes.buffer;
            },
          };
        },
      };
    },
  };
}

export function desktopDirectory(bridge: DesktopDriveBridge, segments: string[] = []): SessionDirectory {
  return {
    name: segments.at(-1) ?? 'Chatter News',
    async getDirectoryHandle(name) {
      const next = [...segments, name];
      await bridge.createDirectory(next);
      return desktopDirectory(bridge, next);
    },
    async getFileHandle(name) {
      return desktopFile(bridge, [...segments, name]);
    },
  };
}
