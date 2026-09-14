import { describe, expect, it } from 'vitest';
import {
  REILY_ADVICE,
  REILY_ROOMS,
  eligibleReilyAdvice,
  nextReilyAdvice,
  validateReilyAdvice,
  type ReilyContext,
} from './reily-advice.js';

describe('Reily advice library', () => {
  it.each(REILY_ROOMS)('%s has at least six room-level cards', (room) => {
    const cards = REILY_ADVICE.filter((card) => card.room === room && !card.focus && !card.recovery);
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });

  it('uses unique stable ids and unique copy', () => {
    expect(new Set(REILY_ADVICE.map((card) => card.id)).size).toBe(REILY_ADVICE.length);
    expect(new Set(REILY_ADVICE.map((card) => card.text)).size).toBe(REILY_ADVICE.length);
  });

  it('passes the copy contract', () => {
    expect(validateReilyAdvice(REILY_ADVICE)).toEqual([]);
  });

  it('reports long and forbidden copy', () => {
    const base = REILY_ADVICE[0]!;
    expect(validateReilyAdvice([{ ...base, id: 'bad-long', text: 'x'.repeat(241) }])).toContain('bad-long: copy exceeds 240 characters');
    expect(validateReilyAdvice([{ ...base, id: 'bad-phrase', text: 'Great job using localStorage.' }])).toEqual([
      'bad-phrase: copy contains forbidden phrase "great job"',
      'bad-phrase: copy contains forbidden phrase "localStorage"',
    ]);
  });
});

describe('Reily advice selection', () => {
  it('prioritizes recovery, then exact focus, then room cards', () => {
    const context: ReilyContext = {
      room: 'studio',
      role: 'STUDENT',
      focus: 'studio.mix',
      recovery: { kind: 'studio.export', workChanged: false },
    };

    expect(eligibleReilyAdvice(context)[0]?.kind).toBe('RECOVERY');
    expect(eligibleReilyAdvice({ ...context, recovery: undefined })[0]?.focus).toBe('studio.mix');
    expect(eligibleReilyAdvice({ ...context, recovery: undefined, focus: undefined })[0]?.room).toBe('studio');
  });

  it('walks a deterministic deck without repeating', () => {
    const context: ReilyContext = { room: 'booth', role: 'STUDENT' };
    const first = nextReilyAdvice(context, []);
    const second = nextReilyAdvice(context, [first.card.id]);

    expect(second.card.id).not.toBe(first.card.id);
    expect(nextReilyAdvice(context, []).card.id).toBe(first.card.id);
    expect(first.exhausted).toBe(false);
  });

  it('resets only after every eligible card has been seen', () => {
    const context: ReilyContext = { room: 'frontdesk', role: 'ADVISER' };
    const eligible = eligibleReilyAdvice(context);
    const result = nextReilyAdvice(context, eligible.map((card) => card.id));

    expect(result.card.id).toBe(eligible[0]?.id);
    expect(result.exhausted).toBe(true);
  });
});
