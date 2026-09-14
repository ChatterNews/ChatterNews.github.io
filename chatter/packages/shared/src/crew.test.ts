import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { roleCounts, whoseTurn, gradebookCsv, csvField } from './crew.js';
import type { Store } from './store.js';

let store: Store;
let maya: any, marcus: any, theo: any;

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  maya = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT', gradeBand: '6th' });
  marcus = await store.users.create({ name: 'Marcus D.', penName: 'Marcus D.', role: 'STUDENT', gradeBand: '8th' });
  theo = await store.users.create({ name: 'Theo B.', penName: 'Theo B.', role: 'STUDENT', gradeBand: '5th' });
});

async function did(userId: string, role: string, cycle = 'week-1') {
  const story = await store.stories.create({ title: `${role} ${Math.random()}` });
  await store.roleAssigns.create({ userId, storyId: story.id, role, cycle });
}

describe('roleCounts - assessment is a query, not paperwork', () => {
  test('the gradebook is the kids, not the teacher', async () => {
    await store.users.create({ name: 'Ms. Boone', penName: 'Ms. Boone', role: 'ADVISER' });
    const counts = await roleCounts(store);
    expect(counts.some((c) => c.penName === 'Ms. Boone')).toBe(false);
  });

  test('counts what each kid actually did', async () => {
    await did(maya.id, 'voice');
    await did(maya.id, 'voice');
    await did(maya.id, 'write');

    const counts = await roleCounts(store);
    const hers = counts.find((c) => c.userId === maya.id)!;
    expect(hers.roles.voice).toBe(2);
    expect(hers.roles.write).toBe(1);
    expect(hers.total).toBe(3);
  });

  test('includes a kid who has not done anything yet', async () => {
    const counts = await roleCounts(store);
    const theirs = counts.find((c) => c.userId === theo.id)!;
    expect(theirs.total).toBe(0);
  });
});

describe('whoseTurn - rotation becomes visible', () => {
  test('names somebody who has done one job over and over', async () => {
    for (let i = 0; i < 4; i++) await did(marcus.id, 'voice');

    const turns = await whoseTurn(store);
    const stuck = turns.find((t) => t.userId === marcus.id)!;
    expect(stuck.overdoing).toBe('voice');
    expect(stuck.say).toMatch(/Marcus D\./);
  });

  test('flags a kid who has never had a turn at anything', async () => {
    await did(maya.id, 'voice');
    const turns = await whoseTurn(store);
    expect(turns.find((t) => t.userId === theo.id)!.neverTried).toBe(true);
  });

  test('says nothing about somebody with a spread of jobs', async () => {
    await did(maya.id, 'voice');
    await did(maya.id, 'write');
    await did(maya.id, 'edit');

    const hers = (await whoseTurn(store)).find((t) => t.userId === maya.id)!;
    expect(hers.overdoing).toBeUndefined();
    expect(hers.neverTried).toBe(false);
  });
});

describe('gradebookCsv', () => {
  test.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@IMPORTXML("x")', '\t=1+1', '\r=1+1'])(
    'neutralizes spreadsheet formulas in %s',
    (value) => expect(csvField(value)).toMatch(/^"?'\s*/u),
  );

  test('is a CSV with a header row', async () => {
    await did(maya.id, 'voice');
    const csv = await gradebookCsv(store);
    expect(csv.split('\n')[0]).toBe('Pen name,Grade,Total jobs,report,write,voice,edit,produce,picture');
  });

  test('has one row per kid', async () => {
    const rows = (await gradebookCsv(store)).trim().split('\n');
    expect(rows).toHaveLength(4);   // header plus three kids
  });

  test('counts land in the right column', async () => {
    await did(maya.id, 'voice');
    await did(maya.id, 'voice');
    const row = (await gradebookCsv(store)).split('\n').find((r) => r.startsWith('Maya R.'))!;
    expect(row).toBe('Maya R.,6th,2,0,0,2,0,0,0');
  });

  test('quotes a name containing a comma so the CSV does not break', async () => {
    await store.users.create({ name: 'X', penName: 'Smith, Jr.', role: 'STUDENT', gradeBand: '7th' });
    const row = (await gradebookCsv(store)).split('\n').find((r) => r.includes('Smith'))!;
    expect(row).toContain('"Smith, Jr."');
  });
});
