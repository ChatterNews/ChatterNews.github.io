import { REILY_CREATING_HELP } from './reily-help-creating.js';
import { REILY_MEDIA_HELP } from './reily-help-media.js';
import { REILY_HANDOFF_HELP } from './reily-help-handoff.js';
import type { ReilyHelpContext, ReilyHelpTopic } from './reily-help-types.js';

const COMMON_HELP: readonly ReilyHelpTopic[] = [
  { id: 'help.keep-working', room: 'any', title: 'Something is still running', keywords: ['wait', 'slow', 'loading', 'frozen', 'stuck', 'progress'],
    summary: 'A recording, import or export may need time to finish.',
    steps: ['Look for a progress bar or a message beside the control you just used.', 'Keep this tab open while it finishes. If a Cancel button is available, use that to stop the operation.', 'If it keeps failing, note the message and ask an adviser before reloading.'],
    when: c => c.situation?.busy === true || c.situation?.recording === true, priority: 95 },
  { id: 'help.slow-computer', room: 'any', title: 'Orbit feels slow', keywords: ['lag', 'laggy', 'slow', 'freeze', 'chromebook', 'speed', 'performance'],
    summary: 'Start with the lighter display setting.',
    steps: ['Open Screen and turn on Low-spec mode.', 'Stop previews you are not listening to or watching.', 'Finish one import or export before starting another. Keep unfinished work open.'],
    done: 'Low-spec reduces movement; it keeps the same editing tools.' },
  { id: 'help.update', room: 'any', title: 'I cannot see the new tools', keywords: ['update', 'new', 'changes', 'version', 'refresh'],
    summary: 'An open website session can still be using the previous release.',
    steps: ['Open Screen on the published Orbit website.', 'When it says an update is ready, choose Save and update.', 'Finish recording or exporting first. If a save fails, keep the tab open and ask an adviser.'],
    done: 'Updating should keep this browser’s saved work. Do not clear browser data.' },
  { id: 'help.adviser', room: 'any', title: 'I still need an adviser', keywords: ['help', 'teacher', 'advisor', 'adviser', 'stuck', 'broken', 'permission', 'approval'],
    summary: 'Give your adviser three clues so they can help quickly.',
    steps: ['Tell them which app and story you are using.', 'Show the control you tried and the message or result you got.', 'Tell them what you wanted to happen. Keep the work open so they can see it.'],
    done: 'Reily can explain the tools. Your adviser handles approvals, access and decisions about publishing.' },
];
export const REILY_HELP_TOPICS: readonly ReilyHelpTopic[] = [...REILY_CREATING_HELP, ...REILY_MEDIA_HELP, ...REILY_HANDOFF_HELP, ...COMMON_HELP];
const STOP_WORDS = new Set('a an the i my me to do how can cant cannot is it in on of for with and why wont does not get want help please dont know let need make some anything something trying tried just'.split(' '));
const ALIASES: Record<string, string> = { pics: 'image', pic: 'image', pictures: 'image', photos: 'image', photo: 'image', sound: 'audio', sounds: 'audio', music: 'audio', mic: 'microphone', mike: 'microphone', movie: 'video', movies: 'video', typing: 'text', type: 'text', words: 'text', undo: 'undo', usb: 'drive', thumbdrive: 'drive', download: 'export', downloading: 'export', advisor: 'adviser', teacher: 'adviser', froze: 'frozen', laggy: 'slow', rotate: 'rotation', smaller: 'size', bigger: 'size' };
function words(value: string): string[] {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean).map(word => ALIASES[word] ?? word);
}
const index = REILY_HELP_TOPICS.map(topic => ({ topic,
  title: words(topic.title), keywords: words(topic.keywords.join(' ')),
  body: words([topic.summary, ...topic.steps].join(' ')),
}));
function contextScore(topic: ReilyHelpTopic, context: ReilyHelpContext): number {
  const here = topic.room === context.room;
  let score = here ? 20 : topic.room === 'any' ? 2 : -20;
  // A declared condition must actually hold to gain task/error priority.
  if (topic.when?.(context)) score += 80 + (topic.priority ?? 0);
  else if (!topic.when) score += Math.min(topic.priority ?? 0, 30);
  if (here && topic.focus?.includes(context.focus!)) score += 40;
  return score;
}
export function recommendReilyHelp(context: ReilyHelpContext, limit = 6): ReilyHelpTopic[] {
  return REILY_HELP_TOPICS.filter(topic => (topic.room === context.room || topic.room === 'any') && (!topic.when || topic.when(context)))
    .map(topic => ({ topic, score: contextScore(topic, context) }))
    .sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id))
    .slice(0, limit).map(result => result.topic);
}
export function searchReilyHelp(query: string, context: ReilyHelpContext, limit = 8): ReilyHelpTopic[] {
  const intent = query.slice(0, 160).toLowerCase().replace(/[’']/g, '')
    .replace(/(?:cant|cannot|wont)(?: i| it)?(?: let me)? (?:type|edit|write)/g, 'edit words')
    .replace(/(?:cant|cannot|dont) hear(?: my)?(?: sound| audio)?|no (?:sound|audio)|(?:sound|audio) (?:is )?(?:not working|doesnt work)/g, 'silent audio');
  const tokens = [...new Set(words(intent).filter(word => !STOP_WORDS.has(word)))].slice(0, 12);
  if (!tokens.length) return query.trim() ? [] : recommendReilyHelp(context, limit);
  const matches = (token: string, list: string[]) => list.some(word => word === token || (token.length >= 4 && word.startsWith(token)));
  return index.map(({ topic, title, keywords, body }) => {
    let score = 0, matched = 0;
    for (const token of tokens) {
      const points = matches(token, title) ? 12 : matches(token, keywords) ? 9 : matches(token, body) ? 2 : 0;
      score += points; if (points) matched++;
    }
    // Require most of the meaningful words; never pretend an unrelated answer fits.
    if (matched < Math.ceil(tokens.length * 0.6)) return { topic, score: 0 };
    return { topic, score: score * 10 + (topic.room === context.room ? 45 : topic.room === 'any' ? 5 : -10) };
  }).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id))
    .slice(0, limit).map(result => result.topic);
}
