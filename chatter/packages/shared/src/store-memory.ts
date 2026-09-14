/**
 * In-memory Store. The reference implementation of the interface: it is what
 * the tests run against, and what proves nothing in a room depends on
 * IndexedDB, OPFS or a server being present.
 */
import type { Store, Collection, StoryCollection, AssetCollection, EventLog, BlobStore } from './store.js';
import type { Base, Story, Asset, LogEvent } from './types.js';
import { newId, slugify, sha256 } from './ids.js';
import { countWords, readTimeSec } from './readtime.js';

const EMPTY_DOC = { type: 'doc', content: [] };

class MemoryCollection<T extends Base> implements Collection<T> {
  protected rows = new Map<string, T>();
  constructor(protected onWrite: (action: string, target: string, payload?: unknown) => Promise<void>,
              protected name: string) {}

  async get(id: string): Promise<T | undefined> { return this.rows.get(id); }
  async list(): Promise<T[]> { return [...this.rows.values()]; }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const current = this.rows.get(id);
    if (!current) throw new Error(`${this.name} ${id} not found`);
    const next = { ...current, ...patch, id, updatedAt: Date.now() };
    this.rows.set(id, next);
    await this.onWrite(`${this.name}.update`, id, patch);
    return next;
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
    await this.onWrite(`${this.name}.remove`, id);
  }

  protected async insert(row: T, action = `${this.name}.create`): Promise<T> {
    this.rows.set(row.id, row);
    await this.onWrite(action, row.id, row);
    return row;
  }
}

/** Generic collection with a plain create, for the simple record types. */
class SimpleCollection<T extends Base> extends MemoryCollection<T> {
  async create(input: Omit<T, keyof Base> & Partial<Base>): Promise<T> {
    const now = Date.now();
    return this.insert({ id: newId(), createdAt: now, updatedAt: now, ...input } as T);
  }
}

class MemoryStories extends MemoryCollection<Story> implements StoryCollection {
  async create(input: { title: string } & Partial<Story>): Promise<Story> {
    const now = Date.now();
    const body = input.body ?? EMPTY_DOC;
    const story: Story = {
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
    };
    return this.insert(story);
  }

  /** readTimeSec is derived on every write - never typed in by hand. */
  override async update(id: string, patch: Partial<Story>): Promise<Story> {
    const derived = patch.body
      ? { ...patch, readTimeSec: readTimeSec(countWords(patch.body)) }
      : patch;
    return super.update(id, derived);
  }

  async bySlug(slug: string): Promise<Story | undefined> {
    return [...this.rows.values()].find((s) => s.slug === slug);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let n = 2;
    while (await this.bySlug(slug)) slug = `${base}-${n++}`;
    return slug;
  }
}

class MemoryAssets extends MemoryCollection<Asset> implements AssetCollection {
  async bySha256(hash: string): Promise<Asset | undefined> {
    return [...this.rows.values()].find((a) => a.sha256 === hash);
  }

  /**
   * The ONLY way an Asset row comes into being, and `gate.ingest` is the only
   * caller. SPEC S4 and the greppable invariant in gate-invariant.test.ts.
   */
  async unsafeCreate(input: Omit<Asset, keyof Base>): Promise<Asset> {
    const now = Date.now();
    return this.insert({ id: newId(), createdAt: now, updatedAt: now, ...input });
  }
}

class MemoryEventLog implements EventLog {
  private rows: LogEvent[] = [];
  private lamport = 0;
  constructor(private deviceId: string) {}

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
    this.rows.push(event);
    return event;
  }

  async all(): Promise<LogEvent[]> { return [...this.rows]; }
  async since(lamport: number): Promise<LogEvent[]> {
    return this.rows.filter((e) => e.lamport > lamport);
  }
}

class MemoryBlobs implements BlobStore {
  private bytes = new Map<string, Uint8Array>();
  async put(data: Uint8Array): Promise<string> {
    const hash = await sha256(data);
    this.bytes.set(hash, data);
    return hash;
  }
  async get(hash: string): Promise<Uint8Array | undefined> { return this.bytes.get(hash); }
  async has(hash: string): Promise<boolean> { return this.bytes.has(hash); }
  async remove(hash: string): Promise<void> { this.bytes.delete(hash); }
  async list(): Promise<string[]> { return [...this.bytes.keys()]; }
}

export class MemoryStore implements Store {
  readonly deviceId: string;
  events: EventLog;
  blobs = new MemoryBlobs();
  stories: StoryCollection;
  assets: AssetCollection;
  users: any; takes: any; transcripts: any; credits: any; deliverables: any;
  releases: any; roleAssigns: any; badges: any; episodes: any; jobs: any; appearances: any; blasts: any; motionPackages: any; showtimeProjects: any; podcastShows: any; podcastProjects: any; samplerPresets: any; studioProjects: any; crewTasks: any; reviews: any;
  settings: any;

  constructor(deviceId = 'device-local') {
    this.deviceId = deviceId;
    this.settings = new MemorySettings();
    this.events = new MemoryEventLog(deviceId);
    const log = async (action: string, target: string, payload?: unknown) => {
      await this.events.append({ action, target, payload });
    };
    this.stories = new MemoryStories(log, 'story');
    this.assets = new MemoryAssets(log, 'asset');
    this.users = new SimpleCollection(log, 'user');
    this.takes = new SimpleCollection(log, 'take');
    this.transcripts = new SimpleCollection(log, 'transcript');
    this.credits = new SimpleCollection(log, 'credit');
    this.appearances = new SimpleCollection(log, 'appearance');
    this.releases = new SimpleCollection(log, 'release');
    this.roleAssigns = new SimpleCollection(log, 'roleAssign');
    this.badges = new SimpleCollection(log, 'badge');
    this.episodes = new SimpleCollection(log, 'episode');
    this.deliverables = new SimpleCollection(log, 'deliverable');
    this.jobs = new SimpleCollection(log, 'job');
    this.blasts = new SimpleCollection(log, 'blast');
    this.motionPackages = new SimpleCollection(log, 'motionPackage');
    this.showtimeProjects = new SimpleCollection(log, 'showtimeProject');
    this.podcastShows = new SimpleCollection(log, 'podcastShow');
    this.podcastProjects = new SimpleCollection(log, 'podcastProject');
    this.samplerPresets = new SimpleCollection(log, 'samplerPreset');
    this.studioProjects = new SimpleCollection(log, 'studioProject');
    this.crewTasks = new SimpleCollection(log, 'crewTask');
    this.reviews = new SimpleCollection(log, 'review');
  }

  async open(): Promise<void> { /* memory needs no opening */ }
}

class MemorySettings {
  private held: Record<string, unknown> = {};
  async get(): Promise<Record<string, unknown>> { return { ...this.held }; }
  async save(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.held = { ...this.held, ...patch };
    return { ...this.held };
  }
}
