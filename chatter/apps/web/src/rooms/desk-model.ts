import { looksLikeStarterCopy, resolveStoryCreationRecipe, type ProseNode, type Story } from '@chatter/shared';

export type DeskBeat = 'LEAD' | 'EVIDENCE' | 'QUOTE' | 'CONTEXT' | 'CLOSE';
export type DeskCheckId = 'HEADLINE' | DeskBeat;

export const DESK_SHAPES = [
  {
    id: 'UPDATE', label: 'Quick update', stamp: 'NEWS WIRE', mark: '⚡', accent: '#FFD331',
    bestFor: 'A change people need to know now.',
    example: { headline: 'A second lunch line cuts the sixth-grade wait', lead: 'The cafeteria opened a second serving line Monday, giving sixth graders about seven more minutes to eat.' },
    beats: [
      { id: 'LEAD', label: 'The news', prompt: 'What changed? Say it in the first sentence.' },
      { id: 'EVIDENCE', label: 'The proof', prompt: 'Add a verified fact, number, or observation.' },
      { id: 'QUOTE', label: 'A voice', prompt: 'Use exact words from someone who knows.' },
      { id: 'CONTEXT', label: 'Why now', prompt: 'Give the background people need.' },
      { id: 'CLOSE', label: 'Next', prompt: 'End with what happens next.' },
    ],
  },
  {
    id: 'PROFILE', label: 'Profile', stamp: 'PROFILE FILE', mark: '◎', accent: '#FF5C9B',
    bestFor: 'A person, team, or place worth knowing.',
    example: { headline: 'The crossing guard who studies every risky minute', lead: 'At 7:42 each morning, Ms. Carter steps three feet farther into the crosswalk—the moment traffic gets hardest to read.' },
    beats: [
      { id: 'LEAD', label: 'A scene', prompt: 'Open in a moment that shows the subject at work.' },
      { id: 'EVIDENCE', label: 'What you saw', prompt: 'Add a revealing detail you observed or checked.' },
      { id: 'QUOTE', label: 'Their voice', prompt: 'Let the subject speak in exact words.' },
      { id: 'CONTEXT', label: 'The bigger picture', prompt: 'Explain how this person or place fits the school.' },
      { id: 'CLOSE', label: 'A last image', prompt: 'End on a moment the audience can picture.' },
    ],
  },
  {
    id: 'EVENT', label: 'Event recap', stamp: 'FIELD NOTES', mark: '▣', accent: '#FF8054',
    bestFor: 'What happened, who felt it, and why it mattered.',
    example: { headline: 'STEM Night ends with one working circuit', lead: 'After three failed tries, first grader Mia Torres snapped in the final wire and lit her team’s cardboard city.' },
    beats: [
      { id: 'LEAD', label: 'The moment', prompt: 'Open with the scene that best shows the event.' },
      { id: 'EVIDENCE', label: 'What happened', prompt: 'Add the result, turnout, score, or observed detail.' },
      { id: 'QUOTE', label: 'From the room', prompt: 'Use a participant’s exact reaction.' },
      { id: 'CONTEXT', label: 'Why it mattered', prompt: 'Connect the event to the people who were there.' },
      { id: 'CLOSE', label: 'Afterward', prompt: 'End with the next date, result, or lasting moment.' },
    ],
  },
  {
    id: 'EXPLAINER', label: 'Explainer', stamp: 'HOW IT WORKS', mark: '◇', accent: '#22C7E8',
    bestFor: 'A question the audience keeps asking.',
    example: { headline: 'Where does a milk carton go after lunch?', lead: 'A carton dropped into the blue bin starts a six-stop trip—and one wrong item can send the whole load to trash.' },
    beats: [
      { id: 'LEAD', label: 'The question', prompt: 'Name the question and why the answer matters.' },
      { id: 'EVIDENCE', label: 'The short answer', prompt: 'Give the clearest checked answer first.' },
      { id: 'QUOTE', label: 'An expert voice', prompt: 'Use exact words from someone who understands the process.' },
      { id: 'CONTEXT', label: 'How it works', prompt: 'Walk through the steps, causes, or rules.' },
      { id: 'CLOSE', label: 'Remember this', prompt: 'End with the useful takeaway.' },
    ],
  },
  {
    id: 'INVESTIGATION', label: 'Investigation', stamp: 'CHECK THE RECORD', mark: '⌕', accent: '#9BE015',
    bestFor: 'A pattern, problem, or claim that needs proof.',
    example: { headline: 'Why the west hallway loses heat every afternoon', lead: 'Temperature logs from five classrooms show the west hallway drops an average of six degrees after lunch.' },
    beats: [
      { id: 'LEAD', label: 'The finding', prompt: 'Lead with what the reporting actually found.' },
      { id: 'EVIDENCE', label: 'The records', prompt: 'Show the strongest document, count, test, or observation.' },
      { id: 'QUOTE', label: 'The response', prompt: 'Give the person responsible a fair chance to answer.' },
      { id: 'CONTEXT', label: 'How we got here', prompt: 'Add the history and other perspectives.' },
      { id: 'CLOSE', label: 'Still open', prompt: 'End with what changes next or remains unanswered.' },
    ],
  },
] as const;

export type DeskShape = typeof DESK_SHAPES[number]['id'];
export type DeskShapeInfo = typeof DESK_SHAPES[number];
export interface DeskCheck { id: DeskCheckId; label: string; hint: string; complete: boolean }

export function deskShape(shape: DeskShape): DeskShapeInfo {
  return DESK_SHAPES.find((item) => item.id === shape) ?? DESK_SHAPES[0];
}

export function deskShapeTemplate(shape: DeskShape): ProseNode {
  return {
    type: 'doc',
    content: deskShape(shape).beats.map((beat) => {
      const paragraph: ProseNode = { type: 'paragraph', attrs: { deskBeat: beat.id, deskShape: shape } };
      return beat.id === 'QUOTE' ? { type: 'blockquote', content: [paragraph] } : paragraph;
    }),
  };
}

export function deskShapeFromDocument(node: ProseNode | undefined): DeskShape | undefined {
  let found: DeskShape | undefined;
  const walk = (item: ProseNode) => {
    const value = item.attrs?.deskShape;
    if (!found && typeof value === 'string' && DESK_SHAPES.some((shape) => shape.id === value)) found = value as DeskShape;
    item.content?.forEach(walk);
  };
  if (node) walk(node);
  return found;
}

export function deskRecommendedShape(story: Pick<Story, 'brief'>): DeskShape {
  const storyType = story.brief?.storyType;
  if (storyType === 'event') return 'EVENT';
  if (storyType === 'feature' || storyType === 'interview') return 'PROFILE';
  if (storyType === 'explainer') return 'EXPLAINER';
  if (storyType === 'investigation') return 'INVESTIGATION';
  return 'UPDATE';
}

function nodeText(node: ProseNode): string {
  return [node.text ?? '', ...(node.content ?? []).map(nodeText)].join('');
}

function beatHasText(node: ProseNode, beat: DeskBeat): boolean {
  if (node.attrs?.deskBeat === beat && nodeText(node).trim()) return true;
  return node.content?.some((item) => beatHasText(item, beat)) ?? false;
}

function firstParagraphHasText(node: ProseNode): boolean {
  let first: string | undefined;
  const walk = (item: ProseNode) => {
    if (first !== undefined) return;
    if (item.type === 'paragraph') { first = nodeText(item).trim(); return; }
    item.content?.forEach(walk);
  };
  walk(node);
  return Boolean(first);
}

function hasBlockquote(node: ProseNode): boolean {
  if (node.type === 'blockquote' && nodeText(node).trim()) return true;
  return node.content?.some(hasBlockquote) ?? false;
}

export function deskStoryCheck(story: Pick<Story, 'title'>, body: ProseNode): DeskCheck[] {
  const selected = deskShapeFromDocument(body);
  const route = deskShape(selected ?? 'UPDATE');
  const prompt = (id: DeskBeat) => route.beats.find((beat) => beat.id === id)!.prompt;
  const headline = story.title.trim();
  return [
    { id: 'HEADLINE', label: 'Headline', hint: 'Name the subject and the news.', complete: Boolean(headline) && !looksLikeStarterCopy(headline) && !/^(untitled|new story|story)$/i.test(headline) },
    { id: 'LEAD', label: 'Lead', hint: prompt('LEAD'), complete: beatHasText(body, 'LEAD') || (!selected && firstParagraphHasText(body)) },
    { id: 'EVIDENCE', label: 'Evidence', hint: prompt('EVIDENCE'), complete: beatHasText(body, 'EVIDENCE') },
    { id: 'QUOTE', label: 'Quote', hint: prompt('QUOTE'), complete: beatHasText(body, 'QUOTE') || hasBlockquote(body) },
    { id: 'CONTEXT', label: 'Context', hint: prompt('CONTEXT'), complete: beatHasText(body, 'CONTEXT') },
    { id: 'CLOSE', label: 'Close', hint: prompt('CLOSE'), complete: beatHasText(body, 'CLOSE') },
  ];
}

export function deskBeatPrompt(shape: DeskShape | undefined, beat: unknown): string | undefined {
  if (!shape || typeof beat !== 'string') return undefined;
  return deskShape(shape).beats.find((item) => item.id === beat)?.prompt;
}

export function deskOutline(node: ProseNode): Array<{ text: string; level: number }> {
  const found: Array<{ text: string; level: number }> = [];
  const walk = (item: ProseNode) => { if (item.type === 'heading') found.push({ text: nodeText(item).trim() || 'Untitled section', level: Number(item.attrs?.level ?? 2) }); item.content?.forEach(walk); };
  walk(node); return found;
}

export function deskDelivery(story: Pick<Story, 'channels' | 'creationRecipeId'>): { next: 'BOOTH' | 'BLAST' | 'STINGER' | 'REVIEW'; stepId: string; label: string; explanation: string } {
  const recipe = resolveStoryCreationRecipe(story);
  if (recipe.id === 'podcast') return { next: 'BOOTH', stepId: 'record', label: 'Hand script to Booth', explanation: 'The next contribution is a clean voice take for the episode cut.' };
  if (recipe.id === 'poster') return { next: 'BLAST', stepId: 'design', label: 'Take the words to Blast', explanation: 'The next contribution is the page people will see.' };
  if (recipe.id === 'video') return { next: 'STINGER', stepId: 'cut', label: 'Take the script to Stinger', explanation: 'The next contribution is the picture-and-sound edit.' };
  if (recipe.id === 'show') return { next: 'STINGER', stepId: 'produce', label: 'Take the rundown to Stinger', explanation: 'The next contribution is the assembled news show.' };
  return { next: 'REVIEW', stepId: 'check', label: 'Send draft to Green Light', explanation: 'This is a written story, so its next contribution is a second set of eyes.' };
}

export function deskTargetSeconds(story: Pick<Story, 'channels'>): { min: number; max: number } {
  return story.channels.includes('social') && story.channels.length === 1 ? { min: 15, max: 35 } : story.channels.some((channel) => ['pod', 'segment', 'video'].includes(channel)) ? { min: 45, max: 90 } : { min: 60, max: 180 };
}
