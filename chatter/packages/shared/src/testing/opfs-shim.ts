/**
 * A minimal in-memory OPFS, enough to run the Store contract against the real
 * browser store under Node. It implements only what OpfsBlobs actually calls.
 */
class MemFile {
  constructor(public bytes: Uint8Array) {}
  get size() { return this.bytes.byteLength; }
  slice(start?: number, end?: number) { return new Blob([this.bytes.slice(start, end)]); }
  async arrayBuffer() {
    return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength);
  }
}

class MemFileHandle {
  constructor(private dir: MemDirectory, private name: string) {}
  async getFile() {
    return new MemFile(this.dir.files.get(this.name)!);
  }
  async createWritable() {
    const dir = this.dir, name = this.name;
    return {
      async write(data: Uint8Array) { dir.files.set(name, new Uint8Array(data)); },
      async close() { /* nothing buffered */ },
    };
  }
}

class MemDirectory {
  files = new Map<string, Uint8Array>();
  private dirs = new Map<string, MemDirectory>();

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
      dir = new MemDirectory();
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
      this.files.set(name, new Uint8Array());
    }
    return new MemFileHandle(this, name);
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name)) throw new DOMException('Not found', 'NotFoundError');
  }

  async *keys() { yield* this.files.keys(); }
}

/** Install the shim, plus the localStorage the device id needs. */
export function installOpfsShim(): void {
  const root = new MemDirectory();
  const store = new Map<string, string>();

  // Augment the existing navigator rather than replacing it: Node ships its
  // own, and swapping the whole object out breaks the test runner's internals.
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      value: {}, configurable: true, writable: true,
    });
  }
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { getDirectory: async () => root },
    configurable: true, writable: true,
  });

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    configurable: true, writable: true,
  });

  if (typeof DOMException === 'undefined') {
    (globalThis as any).DOMException = class extends Error {};
  }
}
