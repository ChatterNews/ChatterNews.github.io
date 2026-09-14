'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

function validateSegments(segments, allowRoot = false) {
  if (!Array.isArray(segments) || (!allowRoot && !segments.length) || segments.length > 12) throw new Error('Choose a file inside Chatter News.');
  for (const name of segments) {
    if (typeof name !== 'string' || !name || name.length > 180 || name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || RESERVED_NAME.test(name)) {
      throw new Error('That file or folder name cannot be saved on this drive.');
    }
  }
  if (segments.join('/').length > 900) throw new Error('The folder path is too long.');
  return [...segments];
}

function safeDownloadName(value) {
  let name = String(value || 'Orbit-export').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 160).replace(/[. ]+$/g, '');
  if (!name || name === '.' || name === '..') name = 'Orbit-export';
  if (RESERVED_NAME.test(name)) name = `Orbit-${name}`;
  return name;
}

class PortableFiles {
  constructor(root) {
    this.root = path.resolve(root);
    this.queue = Promise.resolve();
    this.writes = new Map();
  }

  async initialize() {
    await fs.mkdir(this.root, { recursive: true });
    const entry = await fs.lstat(this.root);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Chatter News must be a real folder, not a shortcut.');
    this.identity = { dev: entry.dev, ino: entry.ino };
  }

  async checkRoot() {
    const entry = await fs.lstat(this.root);
    if (entry.isSymbolicLink() || !entry.isDirectory() || entry.dev !== this.identity?.dev || entry.ino !== this.identity?.ino) throw new Error('The Chatter News folder changed or the drive was removed. Reopen Orbit with the original folder.');
  }

  async checkedPath(segments, { createParents = false, directory = false } = {}) {
    validateSegments(segments, directory);
    await this.checkRoot();
    let current = this.root;
    for (const [index, name] of segments.entries()) {
      current = path.join(current, name);
      const isDirectory = directory || index < segments.length - 1;
      let entry = await fs.lstat(current).catch((error) => { if (error.code === 'ENOENT') return undefined; throw error; });
      if (!entry && isDirectory && createParents) {
        await fs.mkdir(current).catch((error) => { if (error.code !== 'EEXIST') throw error; });
        entry = await fs.lstat(current);
      }
      if (entry?.isSymbolicLink()) throw new Error('Shortcuts and symbolic links cannot be used inside Chatter News.');
      if (isDirectory && (!entry || !entry.isDirectory())) throw new Error('The session folder is missing or unavailable.');
      if (!isDirectory && entry && !entry.isFile()) throw new Error('The destination is not a regular file.');
    }
    return current;
  }

  mutate(operation) {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => {});
    return pending;
  }

  createDirectory(segments) {
    validateSegments(segments, true);
    return this.mutate(async () => { await this.checkedPath(segments, { createParents: true, directory: true }); });
  }

  beginWrite(segments) {
    validateSegments(segments);
    return this.mutate(async () => {
      if (this.writes.size >= 8) throw new Error('Orbit is still finishing other saves. Wait a moment and retry.');
      const destination = await this.checkedPath(segments);
      const temporary = path.join(path.dirname(destination), `.orbit-${randomUUID()}.partial`);
      const handle = await fs.open(temporary, 'wx+', 0o600);
      const token = randomUUID();
      this.writes.set(token, { segments: [...segments], temporary, handle, size: 0 });
      return token;
    });
  }

  transaction(token) {
    if (typeof token !== 'string' || !this.writes.has(token)) throw new Error('This save is no longer open. Start a new save.');
    return this.writes.get(token);
  }

  appendWrite(token, bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_CHUNK_BYTES) throw new Error('Orbit could not transfer this save chunk. Retry the save.');
    const snapshot = Buffer.from(bytes);
    return this.mutate(async () => {
      const entry = this.transaction(token);
      if (entry.size + snapshot.byteLength > MAX_FILE_BYTES) throw new Error('This story exceeds the desktop pilot limit of 4 GiB. Export a smaller story and retry.');
      await this.checkedPath(entry.segments);
      await entry.handle.writeFile(snapshot);
      entry.size += snapshot.byteLength;
    });
  }

  commitWrite(token) {
    return this.mutate(async () => {
      const entry = this.transaction(token);
      let output;
      let createdDestination = false;
      let destination;
      try {
        await entry.handle.sync();
        destination = await this.checkedPath(entry.segments);
        // Node has no portable atomic rename-without-overwrite on FAT/exFAT.
        // Exclusive creation preserves previous student work even on collisions;
        // the receipt is written only after the caller verifies every file.
        output = await fs.open(destination, 'wx', 0o600);
        createdDestination = true;
        const chunk = Buffer.alloc(Math.min(MAX_CHUNK_BYTES, entry.size));
        for (let offset = 0; offset < entry.size;) {
          const { bytesRead } = await entry.handle.read(chunk, 0, Math.min(chunk.length, entry.size - offset), offset);
          if (!bytesRead) throw new Error('The staged story is incomplete. Retry the save.');
          await output.writeFile(chunk.subarray(0, bytesRead));
          offset += bytesRead;
        }
        await output.sync();
        await output.close();
        output = undefined;
      } catch (error) {
        await output?.close().catch(() => {});
        if (createdDestination) await fs.unlink(destination).catch(() => {});
        if (error.code === 'EEXIST') throw new Error('A file with that name already exists. Save a new copy; the earlier file was kept.');
        throw error;
      } finally {
        this.writes.delete(token);
        await entry.handle.close().catch(() => {});
        await fs.unlink(entry.temporary).catch(() => {});
      }
    });
  }

  abortWrite(token) {
    return this.mutate(async () => {
      const entry = this.writes.get(token);
      if (!entry) return;
      this.writes.delete(token);
      await entry.handle.close().catch(() => {});
      await fs.unlink(entry.temporary).catch(() => {});
    });
  }

  async abortAll() {
    await this.queue;
    for (const token of [...this.writes.keys()]) await this.abortWrite(token);
  }

  async statFile(segments) {
    await this.queue;
    const file = await this.checkedPath(segments);
    const info = await fs.stat(file);
    if (info.size > MAX_FILE_BYTES) throw new Error('This file exceeds the desktop pilot limit of 4 GiB.');
    return { size: info.size };
  }

  async readFile(segments, start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end - start > MAX_CHUNK_BYTES) throw new Error('Orbit could not verify this save chunk. Retry the save.');
    await this.queue;
    const file = await this.checkedPath(segments);
    const handle = await fs.open(file, 'r');
    try {
      const info = await handle.stat();
      if (info.size > MAX_FILE_BYTES || end > info.size) throw new Error('The saved file changed or is incomplete. Retry the save.');
      const bytes = Buffer.alloc(end - start);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, start + offset);
        if (!bytesRead) throw new Error('The saved file is incomplete. Retry the save.');
        offset += bytesRead;
      }
      return new Uint8Array(bytes);
    } finally { await handle.close(); }
  }
}

module.exports = { PortableFiles, validateSegments, safeDownloadName, MAX_FILE_BYTES, MAX_CHUNK_BYTES };
