'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PortableFiles, validateSegments, safeDownloadName, MAX_CHUNK_BYTES } = require('./files.cjs');

async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-desktop-files-'));
  const files = new PortableFiles(path.join(temporary, 'Chatter News'));
  await files.initialize();
  t.after(async () => { await files.abortAll(); await fs.rm(temporary, { recursive: true, force: true }); });
  return { files, temporary };
}

test('chunked session files round-trip, including a read spanning two writes', async (t) => {
  const { files } = await fixture(t);
  await files.createDirectory(['Session 1']);
  const first = new Uint8Array(1024 * 1024).fill(37);
  const second = new Uint8Array(1024 * 1024 + 7).fill(201);
  const token = await files.beginWrite(['Session 1', 'story.chatter']);
  await files.appendWrite(token, first);
  await files.appendWrite(token, second);
  await files.commitWrite(token);
  assert.deepEqual(await files.statFile(['Session 1', 'story.chatter']), { size: first.length + second.length });
  assert.deepEqual(await files.readFile(['Session 1', 'story.chatter'], first.length - 2, first.length + 2), new Uint8Array([37, 37, 201, 201]));
  assert.deepEqual(await fs.readdir(path.join(files.root, 'Session 1')), ['story.chatter']);
});

test('a save cannot overwrite an existing student file', async (t) => {
  const { files } = await fixture(t);
  await fs.writeFile(path.join(files.root, 'story.chatter'), 'earlier work');
  const token = await files.beginWrite(['story.chatter']);
  await files.appendWrite(token, new Uint8Array([1, 2]));
  await assert.rejects(files.commitWrite(token), /already exists/);
  assert.equal(await fs.readFile(path.join(files.root, 'story.chatter'), 'utf8'), 'earlier work');
  assert.deepEqual(await fs.readdir(files.root), ['story.chatter']);
});

test('aborting removes staged bytes without creating a story or receipt', async (t) => {
  const { files } = await fixture(t);
  const token = await files.beginWrite(['story.chatter']);
  await files.appendWrite(token, new Uint8Array([1, 2]));
  await files.abortWrite(token);
  await files.abortWrite(token);
  assert.deepEqual(await fs.readdir(files.root), []);
  await assert.rejects(files.commitWrite(token), /no longer open/);
});

test('a failed staged-file flush cannot leave a completed file or leaked transaction', async (t) => {
  const { files } = await fixture(t);
  const token = await files.beginWrite(['story.chatter']);
  await files.appendWrite(token, new Uint8Array([1, 2]));
  await files.writes.get(token).handle.close();
  await assert.rejects(files.commitWrite(token));
  assert.equal(files.writes.size, 0);
  assert.deepEqual(await fs.readdir(files.root), []);
});

test('names reject traversal, absolute paths, Windows aliases and alternate streams', () => {
  for (const value of ['..', '.', '/tmp', 'a/b', 'a\\b', 'C:', 'name:stream', 'CON', 'NUL.txt', 'com1.txt', 'LPT²', 'bad.', 'bad ', 'bad\0name']) {
    assert.throws(() => validateSegments([value]), /cannot be saved/);
  }
  assert.throws(() => validateSegments([]));
  assert.throws(() => validateSegments('not-an-array'));
  assert.deepEqual(validateSegments(['Session 1', 'Niños.chatter']), ['Session 1', 'Niños.chatter']);
});

test('directory and file symlinks cannot expose files outside Chatter News', async (t) => {
  const { files, temporary } = await fixture(t);
  const outside = path.join(temporary, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'private.chatter'), 'not part of Orbit');
  await fs.symlink(outside, path.join(files.root, 'shortcut'), 'dir');
  await fs.symlink(path.join(outside, 'private.chatter'), path.join(files.root, 'linked.chatter'));
  await assert.rejects(files.createDirectory(['shortcut', 'new']), /symbolic links/);
  await assert.rejects(files.beginWrite(['shortcut', 'new.chatter']), /symbolic links/);
  await assert.rejects(files.statFile(['linked.chatter']), /symbolic links/);
  await assert.rejects(files.readFile(['linked.chatter'], 0, 1), /symbolic links/);
  assert.deepEqual(await fs.readdir(outside), ['private.chatter']);
});

test('a substituted Chatter News root is rejected', async (t) => {
  const { files, temporary } = await fixture(t);
  await fs.rename(files.root, path.join(temporary, 'original'));
  await fs.mkdir(files.root);
  await assert.rejects(files.createDirectory(['Session']), /folder changed/);
  assert.deepEqual(await fs.readdir(files.root), []);
});

test('chunk limits and invalid ranges fail before allocating huge transfers', async (t) => {
  const { files } = await fixture(t);
  const token = await files.beginWrite(['empty.chatter']);
  assert.throws(() => files.appendWrite(token, new Uint8Array(MAX_CHUNK_BYTES + 1)), /chunk/);
  assert.throws(() => files.appendWrite(token, [1, 2]), /chunk/);
  await files.commitWrite(token);
  assert.deepEqual(await files.statFile(['empty.chatter']), { size: 0 });
  assert.deepEqual(await files.readFile(['empty.chatter'], 0, 0), new Uint8Array());
  await assert.rejects(files.readFile(['empty.chatter'], -1, 0), /chunk/);
  await assert.rejects(files.readFile(['empty.chatter'], 0, MAX_CHUNK_BYTES + 1), /chunk/);
  await assert.rejects(files.readFile(['empty.chatter'], 0, 1), /changed or is incomplete/);
});

test('mutating the sent buffer cannot alter the queued file bytes', async (t) => {
  const { files } = await fixture(t);
  const token = await files.beginWrite(['story.chatter']);
  const bytes = new Uint8Array([1, 2, 3]);
  const pending = files.appendWrite(token, bytes);
  bytes.fill(99);
  await pending;
  await files.commitWrite(token);
  assert.deepEqual(await files.readFile(['story.chatter'], 0, 3), new Uint8Array([1, 2, 3]));
});

test('export filenames stay one safe Windows filename', () => {
  assert.equal(safeDownloadName('../News: clip?.webm'), '..-News- clip-.webm');
  assert.equal(safeDownloadName('CON.txt'), 'Orbit-CON.txt');
  assert.equal(safeDownloadName('...'), 'Orbit-export');
  assert.doesNotThrow(() => validateSegments([safeDownloadName('My story.mov')]));
});
