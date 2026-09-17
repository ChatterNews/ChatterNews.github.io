import { requireAdviserAuthorization } from './access.js';
import type { Store } from './store.js';
import type { User } from './types.js';
import { createAdviser } from './identity.js';

export type FirstRunState = 'EMPTY' | 'LEGACY' | 'CONFIGURED';
export type PreferredDesk = 'STUDENT' | 'ADVISER';

export async function firstRunState(store: Store): Promise<FirstRunState> {
  const [settings, users, stories] = await Promise.all([
    store.settings.get(),
    store.users.list(),
    store.stories.list(),
  ]);

  if (settings.setupVersion === 1) return 'CONFIGURED';
  return users.length > 0 || stories.length > 0 ? 'LEGACY' : 'EMPTY';
}

export async function completeDeviceSetup(store: Store, preferredDesk: PreferredDesk): Promise<void> {
  await store.settings.save({ setupVersion: 1, preferredDesk });
}

/**
 * Return this device to its first check-in without touching anybody's work.
 * The adviser PIN belongs to the device setup, so it is cleared with the desk
 * choice; badges and authored records remain available for the next setup.
 */
export async function resetDeviceCheckIn(store: Store, pin?: string): Promise<void> {
  const settings = await store.settings.get();
  if (settings.adviserPin && !await verifyAdviserPin(store, pin ?? '')) {
    throw new Error('The adviser PIN did not match. Nothing changed.');
  }
  await store.settings.save({ setupVersion: undefined, preferredDesk: undefined, adviserPin: '' });
  await store.events.append({ action: 'device.checkin.reset', target: 'newsroom' });
}

export async function setupAdviser(
  store: Store,
  input: { adviserId?: string; penName?: string; pin: string; authorizationCode: string },
): Promise<User> {
  await requireAdviserAuthorization(input.authorizationCode);
  if (!/^\d{4}$/.test(input.pin)) throw new Error('An adviser PIN is four digits.');

  let adviser: User | undefined;
  if (input.adviserId) {
    adviser = (await store.users.get(input.adviserId)) as User | undefined;
    if (!adviser || !adviser.active || adviser.role !== 'ADVISER') {
      throw new Error('Choose an active adviser badge.');
    }
  } else {
    adviser = await createAdviser(store, { penName: input.penName ?? '', authorizationCode: input.authorizationCode });
  }

  await store.settings.save({
    adviserPin: input.pin,
    setupVersion: 1,
    preferredDesk: 'ADVISER',
  });
  await store.events.append({ action: 'adviser.setup', target: adviser.id, actor: adviser.id });
  return adviser;
}

export async function verifyAdviserPin(store: Store, pin: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false;
  const settings = await store.settings.get();
  return !!settings.adviserPin && settings.adviserPin === pin;
}
