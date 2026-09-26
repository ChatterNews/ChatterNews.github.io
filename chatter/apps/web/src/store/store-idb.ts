/**
 * The browser Store: IndexedDB for records, OPFS for bytes.
 * SPEC S1 and S9 Tier 0 - the browser is the source of truth for a student's
 * own work, and nothing here waits on a server being awake.
 *
 * It implements the same interface as MemoryStore, so room code cannot tell
 * which one is running - which is what lets Tier 1 sync slot underneath.
 */
import type {
  Store, Collection, StoryCollection, AssetCollection, EventLog, BlobStore,
} from '@chatter/shared';
import type { Base, Story, Asset, LogEvent, GroupRevision } from '@chatter/shared';
import { validateGroupRevision, validateStoryGroupFields } from '@chatter/shared';
import { newId, slugify, sha256, countWords, readTimeSec, verifyAdviserPin, validateSoundProject, validateSoundItem, validateSoundCollection, validateSoundRevision } from '@chatter/shared';
import { writeOpfsFile } from './opfs-write.js';

/**
 * Bump this whenever STORES gains an entry. Without a version bump the
 * upgrade never runs, and a browser that already opened an older Chatter is
 * left without the new object store - which fails only at the moment
 * something writes to it.
 */
// The alternative already opened version 11 on this origin. Never downgrade
// or clear that database when restoring the original app.
const DB_VERSION = 13;
const EMPTY_DOC = { type: 'doc', content: [] };

export const STORES = [
  'groupRevisions',
  'soundProjects', 'soundItems', 'soundRevisions', 'soundCollections', 'soundOperations',
  'stories', 'assets', 'users', 'takes', 'transcripts', 'credits',
  'releases', 'roleAssigns', 'badges', 'episodes', 'jobs', 'appearances',
  'blasts', 'motionPackages', 'showtimeProjects', 'podcastShows', 'podcastProjects', 'samplerPresets', 'studioProjects', 'crewTasks', 'reviews', 'deliverables', 'events', 'meta',
] as const;

function open(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class IdbCollection<T extends Base> implements Collection<T> {
  constructor(
    protected db: () => IDBDatabase,
    protected name: string,
    protected onWrite: (action: string, target: string, payload?: unknown) => Promise<void>,
  ) {}

  protected tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db().transaction(this.name, mode).objectStore(this.name);
  }

  async get(id: string): Promise<T | undefined> {
    return promisify<T | undefined>(this.tx('readonly').get(id) as IDBRequest<T | undefined>);
  }

  async list(): Promise<T[]> {
    return promisify<T[]>(this.tx('readonly').getAll() as IDBRequest<T[]>);
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const current = await this.get(id);
    if (!current) throw new Error(`${this.name} ${id} not found`);
    const next = { ...current, ...patch, id, updatedAt: Date.now() };
    await promisify(this.tx('readwrite').put(next));
    await this.onWrite(`${this.name}.update`, id, patch);
    return next;
  }

  async remove(id: string): Promise<void> {
    await promisify(this.tx('readwrite').delete(id));
    await this.onWrite(`${this.name}.remove`, id);
  }

  protected async insert(row: T): Promise<T> {
    await promisify(this.tx('readwrite').add(row));
    await this.onWrite(`${this.name}.create`, row.id, row);
    return row;
  }
}

class IdbSimple<T extends Base> extends IdbCollection<T> {
  async create(input: Omit<T, keyof Base> & Partial<Base>): Promise<T> {
    const now = Date.now();
    return this.insert({ id: newId(), createdAt: now, updatedAt: now, ...input } as T);
  }
}

class IdbGroupRevisions extends IdbCollection<GroupRevision> {
  async create(input: Omit<GroupRevision, keyof Base> & Partial<Base>): Promise<GroupRevision> {
    const now = Date.now();
    const row = { id: newId(), createdAt: now, updatedAt: now, ...input };
    validateGroupRevision(row);
    return structuredClone(await this.insert(structuredClone(row)));
  }
  override async update(_id: string, _patch: Partial<GroupRevision>): Promise<GroupRevision> {
    throw new Error('Saved group revisions are immutable. Save a new revision.');
  }
}

class IdbSoundCollection<T extends Base> extends IdbSimple<T> {
  constructor(db: () => IDBDatabase, name: string, onWrite: (action: string, target: string, payload?: unknown) => Promise<void>, private validate: (row: T) => void, private immutable = false) { super(db, name, onWrite); }
  override async create(input: Omit<T, keyof Base> & Partial<Base>) { const row = { id: newId(), createdAt: Date.now(), updatedAt: Date.now(), ...input } as T; this.validate(row); return super.create(row); }
  override async update(id: string, patch: Partial<T>): Promise<T> {
    if (this.immutable) throw new Error('Saved sound revisions are immutable. Save a new version.');
    const current = await this.get(id); if (!current) throw new Error('Sound record not found.'); this.validate({ ...current, ...patch, id }); return super.update(id, patch);
  }
}

class IdbSoundProjects extends IdbSimple<import('@chatter/shared').SoundProject> {
  override async create(input: Omit<import('@chatter/shared').SoundProject, keyof Base> & Partial<Base>) { const row = { id: newId(), createdAt: Date.now(), updatedAt: Date.now(), ...input }; validateSoundProject(row); return super.create(row); }
  override async update(_id: string, _patch: Partial<import('@chatter/shared').SoundProject>): Promise<import('@chatter/shared').SoundProject> { throw new Error('Use revision-checked sound saving.'); }
  async save(project: import('@chatter/shared').SoundProject, expectedRevision: number): Promise<import('@chatter/shared').SoundProject> {
    validateSoundProject(project);
    return new Promise((resolve, reject) => {
      const tx = this.db().transaction(this.name, 'readwrite');
      const records = tx.objectStore(this.name);
      const request = records.get(project.id);
      let saved: import('@chatter/shared').SoundProject;
      let failure: Error | undefined;
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) {
          failure = new Error('This sound changed in another tab. Reopen it before saving.'); tx.abort(); return;
        }
        saved = { ...project, revision: expectedRevision + 1, updatedAt: Date.now() };
        records.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(failure ?? tx.error);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Sound save interrupted.'));
    });
  }
}

class IdbStories extends IdbCollection<Story> implements StoryCollection {
  async create(input: { title: string } & Partial<Story>): Promise<Story> {
    validateStoryGroupFields(input);
    const now = Date.now();
    const body = input.body ?? EMPTY_DOC;
    return this.insert({
      id: newId(), createdAt: now, updatedAt: now,
      slug: await this.uniqueSlug(input.slug ?? slugify(input.title)),
      title: input.title,
      channels: input.channels ?? [],
      status: input.status ?? 'PITCH',
      body,
      readTimeSec: readTimeSec(countWords(body)),
      bylineIds: input.bylineIds ?? [],
      ...(input.creationRecipeId !== undefined ? { creationRecipeId: input.creationRecipeId } : {}),
      ...(input.workflowStepId !== undefined ? { workflowStepId: input.workflowStepId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.brief !== undefined ? { brief: input.brief } : {}),
      ...(input.selectedTakeId !== undefined ? { selectedTakeId: input.selectedTakeId } : {}),
      ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
      ...(input.orderIndex !== undefined ? { orderIndex: input.orderIndex } : {}),
      ...(input.portableId !== undefined ? { portableId: input.portableId } : {}),
      ...(input.followUpOfId !== undefined ? { followUpOfId: input.followUpOfId } : {}),
      ...(input.group !== undefined ? { group: structuredClone(input.group) } : {}),
      ...(input.attachedAssetIds !== undefined ? { attachedAssetIds: [...input.attachedAssetIds] } : {}),
    } as Story);
  }

  /** readTimeSec is derived on every write - never typed in by hand. */
  override async update(id: string, patch: Partial<Story>): Promise<Story> {
    validateStoryGroupFields(patch);
    const derived = patch.body
      ? { ...patch, readTimeSec: readTimeSec(countWords(patch.body)) }
      : patch;
    return super.update(id, derived);
  }

  async bySlug(slug: string): Promise<Story | undefined> {
    return (await this.list()).find((s) => s.slug === slug);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let n = 2;
    while (await this.bySlug(slug)) slug = `${base}-${n++}`;
    return slug;
  }
}

class IdbAssets extends IdbCollection<Asset> implements AssetCollection {
  async bySha256(hash: string): Promise<Asset | undefined> {
    return (await this.list()).find((a) => a.sha256 === hash);
  }

  /** Only gate.ingest calls this. See gate-invariant.test.ts. */
  async unsafeCreate(input: Omit<Asset, keyof Base>): Promise<Asset> {
    const now = Date.now();
    return this.insert({ id: newId(), createdAt: now, updatedAt: now, ...input });
  }
}

/**
 * Newsroom settings, as one row in the `meta` object store.
 *
 * `meta` is already in STORES, so this deliberately needs no DB_VERSION bump -
 * the trap that costs an afternoon is adding a store and forgetting one.
 */
class IdbSettings {
  constructor(private db: () => IDBDatabase) {}

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db().transaction('meta', mode).objectStore('meta');
  }

  async get(): Promise<Record<string, unknown>> {
    const row = await promisify<{ key: string; value?: Record<string, unknown> } | undefined>(
      this.tx('readonly').get('newsroom') as IDBRequest<{ key: string; value?: Record<string, unknown> } | undefined>,
    );
    return row?.value ?? {};
  }

  async save(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const next = { ...(await this.get()), ...patch };
    await promisify(this.tx('readwrite').put({ key: 'newsroom', value: next }));
    return next;
  }
}

class IdbEventLog implements EventLog {
  private lamport = 0;
  constructor(private db: () => IDBDatabase, private deviceId: string) {}

  /** Recover the counter from the log so it never goes backwards on reload. */
  async resume(): Promise<void> {
    const events = await this.all();
    this.lamport = events.reduce((max, e) => Math.max(max, e.lamport), 0);
  }

  async append(input: { action: string; target: string; actor?: string; payload?: unknown }): Promise<LogEvent> {
    this.lamport += 1;
    const event: LogEvent = {
      id: newId(),
      deviceId: this.deviceId,
      lamport: this.lamport,
      wallClock: Date.now(),
      action: input.action,
      target: input.target,
      ...(input.actor !== undefined ? { actor: input.actor } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    };
    const store = this.db().transaction('events', 'readwrite').objectStore('events');
    await promisify(store.add(event));
    return event;
  }

  async all(): Promise<LogEvent[]> {
    const store = this.db().transaction('events', 'readonly').objectStore('events');
    const rows = await promisify<LogEvent[]>(store.getAll() as IDBRequest<LogEvent[]>);
    return rows.sort((a, b) => a.lamport - b.lamport || (a.deviceId < b.deviceId ? -1 : 1));
  }

  async since(lamport: number): Promise<LogEvent[]> {
    return (await this.all()).filter((e) => e.lamport > lamport);
  }
}

/**
 * OPFS blob store. The hash IS the filename, so the same bytes are the same
 * file and sync is only ever "do you have this hash?".
 */
class OpfsBlobs implements BlobStore {
  private dir?: FileSystemDirectoryHandle;

  constructor(private directoryName = 'blobs') {}

  private async root(): Promise<FileSystemDirectoryHandle> {
    if (!this.dir) {
      const root = await navigator.storage.getDirectory();
      this.dir = await root.getDirectoryHandle(this.directoryName, { create: true });
    }
    return this.dir;
  }

  /** OPFS filenames cannot carry the "sha256:" prefix. */
  private fileName(hash: string): string {
    return hash.replace('sha256:', '');
  }

  async put(bytes: Uint8Array): Promise<string> {
    const hash = await sha256(bytes);
    const dir = await this.root();
    await writeOpfsFile(dir, this.fileName(hash), bytes);
    return hash;
  }

  async get(hash: string): Promise<Uint8Array | undefined> {
    try {
      const dir = await this.root();
      const handle = await dir.getFileHandle(this.fileName(hash));
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch {
      return undefined;   // a missing hash is absent, not an error
    }
  }

  async has(hash: string): Promise<boolean> {
    try {
      const dir = await this.root();
      await dir.getFileHandle(this.fileName(hash));
      return true;
    } catch {
      return false;
    }
  }

  async remove(hash: string): Promise<void> {
    try {
      const dir = await this.root();
      await dir.removeEntry(this.fileName(hash));
    } catch { /* already gone */ }
  }

  async list(): Promise<string[]> {
    const dir = await this.root() as FileSystemDirectoryHandle & {
      keys(): AsyncIterableIterator<string>;
    };
    const hashes: string[] = [];
    for await (const name of dir.keys()) hashes.push(`sha256:${name}`);
    return hashes;
  }
}

/** Stable per-device id. Part of every merge tiebreak, so it must persist. */
function deviceId(): string {
  const key = 'chatter.deviceId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = newId();
    localStorage.setItem(key, id);
  }
  return id;
}

export class IdbStore implements Store {
  readonly deviceId = deviceId();
  private database?: IDBDatabase;
  events: IdbEventLog;
  blobs: OpfsBlobs;
  stories: StoryCollection;
  groupRevisions: IdbGroupRevisions;
  assets: AssetCollection;
  users: any; takes: any; transcripts: any; credits: any; deliverables: any;
  releases: any; roleAssigns: any; badges: any; episodes: any; jobs: any;
  appearances: any; blasts: any; motionPackages: any; showtimeProjects: any; podcastShows: any; podcastProjects: any; samplerPresets: any; studioProjects: any; crewTasks: any; reviews: any;
  settings: IdbSettings;
  soundProjects; soundItems; soundRevisions; soundCollections; soundOperations;

  constructor(private dbName = 'chatter') {
    this.blobs = new OpfsBlobs(dbName === 'chatter' ? 'blobs' : `${dbName}-blobs`);
    const db = () => {
      if (!this.database) throw new Error('store: call open() first');
      return this.database;
    };
    this.events = new IdbEventLog(db, this.deviceId);
    this.settings = new IdbSettings(db);
    const log = async (action: string, target: string, payload?: unknown) => {
      await this.events.append({ action, target, payload });
    };
    this.stories = new IdbStories(db, 'stories', log);
    this.groupRevisions = new IdbGroupRevisions(db, 'groupRevisions', log);
    this.assets = new IdbAssets(db, 'assets', log);
    this.users = new IdbSimple(db, 'users', log);
    this.takes = new IdbSimple(db, 'takes', log);
    this.transcripts = new IdbSimple(db, 'transcripts', log);
    this.credits = new IdbSimple(db, 'credits', log);
    this.releases = new IdbSimple(db, 'releases', log);
    this.roleAssigns = new IdbSimple(db, 'roleAssigns', log);
    this.badges = new IdbSimple(db, 'badges', log);
    this.episodes = new IdbSimple(db, 'episodes', log);
    this.deliverables = new IdbSimple(db, 'deliverables', log);
    this.jobs = new IdbSimple(db, 'jobs', log);
    this.appearances = new IdbSimple(db, 'appearances', log);
    this.blasts = new IdbSimple(db, 'blasts', log);
    this.motionPackages = new IdbSimple(db, 'motionPackages', log);
    this.showtimeProjects = new IdbSimple(db, 'showtimeProjects', log);
    this.podcastShows = new IdbSimple(db, 'podcastShows', log);
    this.podcastProjects = new IdbSimple(db, 'podcastProjects', log);
    this.samplerPresets = new IdbSimple(db, 'samplerPresets', log);
    this.studioProjects = new IdbSimple(db, 'studioProjects', log);
    this.crewTasks = new IdbSimple(db, 'crewTasks', log);
    this.reviews = new IdbSimple(db, 'reviews', log);
    this.soundProjects = new IdbSoundProjects(db, 'soundProjects', log);
    this.soundItems = new IdbSoundCollection(db, 'soundItems', log, validateSoundItem);
    this.soundRevisions = new IdbSoundCollection(db, 'soundRevisions', log, validateSoundRevision, true);
    this.soundCollections = new IdbSoundCollection(db, 'soundCollections', log, validateSoundCollection);
    this.soundOperations = new IdbSimple<import('@chatter/shared').SoundOperation>(db, 'soundOperations', log);
  }

  async open(): Promise<void> {
    this.database = await open(this.dbName);
    await this.events.resume();
  }

  /**
   * Release the database handle. An open connection blocks a later delete or
   * version change, so anything that finishes with a store closes it.
   */
  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  /** Permanently empty this local newsroom while keeping the database usable. */
  async eraseAll(): Promise<void> {
    const database = this.database;
    if (!database) throw new Error('store: call open() first');
    const hashes = await this.blobs.list();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([...STORES], 'readwrite');
      for (const name of STORES) transaction.objectStore(name).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('The newsroom reset was interrupted.'));
    });
    await Promise.all(hashes.map((hash) => this.blobs.remove(hash)));
    this.events = new IdbEventLog(() => {
      if (!this.database) throw new Error('store: call open() first');
      return this.database;
    }, this.deviceId);
  }
}

/** The destructive reset boundary: no caller can skip the device's adviser PIN. */
export async function eraseNewsroomWithPin(store: IdbStore, pin: string): Promise<void> {
  if (!await verifyAdviserPin(store, pin)) throw new Error('The adviser PIN did not match. Nothing was erased.');
  await store.eraseAll();
}
