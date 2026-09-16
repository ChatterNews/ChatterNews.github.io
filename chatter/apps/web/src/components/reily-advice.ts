import type { Story } from '@chatter/shared';

export const REILY_ROOMS = [
  'home', 'slate', 'crew', 'desk', 'booth', 'studio', 'chatterbox',
  'blast', 'stinger', 'showtime', 'greenlight', 'files', 'reruns', 'frontdesk',
] as const;

export type ReilyRoom = typeof REILY_ROOMS[number];

export type ReilyFocus =
  | 'slate.direction' | 'slate.questions' | 'slate.sources'
  | 'desk.write' | 'desk.structure' | 'desk.sources' | 'desk.review'
  | 'booth.setup' | 'booth.record' | 'booth.listen' | 'booth.edit'
  | 'studio.instrument' | 'studio.record' | 'studio.arrange' | 'studio.mix'
  | 'chatterbox.rundown' | 'chatterbox.record' | 'chatterbox.edit' | 'chatterbox.package'
  | 'blast.canvas' | 'blast.text' | 'blast.image' | 'blast.shape'
  | 'stinger.screen' | 'stinger.text' | 'stinger.image' | 'stinger.motion'
  | 'showtime.record' | 'showtime.switch' | 'showtime.cut' | 'showtime.captions'
  | 'greenlight.preview' | 'greenlight.notes' | 'greenlight.release';

export type ReilyRecoveryKind =
  | 'slate.save' | 'desk.save' | 'booth.microphone' | 'booth.import'
  | 'studio.engine' | 'studio.record' | 'studio.import' | 'studio.export'
  | 'chatterbox.microphone' | 'chatterbox.import' | 'chatterbox.export'
  | 'blast.import' | 'blast.export' | 'stinger.import' | 'stinger.export'
  | 'showtime.camera' | 'showtime.microphone' | 'showtime.media' | 'showtime.export'
  | 'greenlight.load';

export interface ReilyRecovery {
  kind: ReilyRecoveryKind;
  workChanged: boolean;
}

export interface ReilyContext {
  room: ReilyRoom;
  focus?: ReilyFocus;
  story?: Pick<Story, 'id' | 'title' | 'status' | 'channels' | 'creationRecipeId'>;
  role: 'STUDENT' | 'ADVISER';
  previousRoom?: ReilyRoom;
  recovery?: ReilyRecovery;
}

export type PipMood = 'smile' | 'grin' | 'big' | 'flat' | 'oh';

export interface ReilyAdvice {
  id: string;
  room: ReilyRoom;
  focus?: ReilyFocus;
  recovery?: ReilyRecoveryKind;
  kind: 'CRAFT' | 'TOOL' | 'EXPERIMENT' | 'RECOVERY' | 'ORIENTATION';
  text: string;
  mood?: PipMood;
}

const ROOM_COPY: Record<ReilyRoom, readonly string[]> = {
  home: [
    'Start with what you want to make. Reily can point to the room for recording, writing, design, video, review, or finished work.',
    'The lit route follows the active project. Use it when you want the next production step, not just another room.',
    'Open work stays with its project. Pick the project first, then return to the room where you left off.',
    'Assignments are smaller than whole projects. Scan Crew to see the one part that belongs to you.',
    'Media Bin holds working and exported files. Reruns is where finished work is watched, read, or heard.',
    'If you know the job but not the room, open Find a room and choose the result you want.',
  ],
  slate: [
    'Name the audience before the format. A clear audience helps you choose the right words, shots, sounds, and length.',
    'Give the project one main purpose. It can inform, explain, invite, document, or entertain without trying to do all five at once.',
    'Turn a broad topic into a question the crew can answer with people, documents, observation, pictures, or sound.',
    'Keep exact words in the quote field. Put your summary and interpretation in notes so nobody mixes them up.',
    'Plan the pictures and sounds while you plan the words. The next maker should know what material to gather.',
    'A useful handoff names what is ready, where the source material lives, and what the next person still needs.',
  ],
  crew: [
    'Claim a job you can describe in one sentence. “Help with video” is fuzzy; “record the hallway interview” has a finish line.',
    'Read the last handoff before starting. It may contain the file, pronunciation, timing, or missing piece that saves a second trip.',
    'When you finish, name the exact thing that is ready instead of only saying “done.”',
    'If something is missing, name the missing person, file, answer, shot, or decision so the next move is obvious.',
    'A handoff should carry source material as well as instructions. Link the take, draft, photo, or export the next maker needs.',
    'Ask for help at the point where progress stopped: permission, equipment, a decision, a file, or a tool you cannot make behave.',
  ],
  desk: [
    'Lead with the change, discovery, moment, or invitation the audience came to learn about. Save the warm-up for later.',
    'Read a paragraph aloud. If your breath or attention gets lost, shorten the sentence or move the key words earlier.',
    'Keep exact quotes exact. Use your own sentence before or after the quote to explain why it belongs.',
    'Give readers the new information first, then the background they need to understand it.',
    'Write for the form you are making. A spoken script, poster paragraph, web story, and show intro need different rhythms.',
    'Move whole sections before polishing single words. Strong order makes the later sentence work easier.',
  ],
  booth: [
    'Set the microphone about a handspan away, aim past the loudest breath, and speak at the volume you will really use.',
    'Listen before you keep a take. A clean waveform can still hide a stumble, room noise, or a delivery that feels wrong.',
    'Record a few seconds of the room with nobody talking. Editors can use that sound to smooth cuts between phrases.',
    'For a pickup, pause and repeat the whole sentence. Complete sentences are easier to join than a single repaired word.',
    'Drop a marker after a strong moment or a mistake. The marker is a map for the person who edits later.',
    'Choose the take that is clear and believable. The most perfect take is not always the one people want to hear.',
  ],
  studio: [
    'Name the song sections before filling the timeline. Intro, verse, hook, bridge, and outro give every block a job.',
    'Audition a sound with the other tracks playing. A huge solo sound may crowd the voice or drums inside the song.',
    'Leave space below the red. A mix with headroom can get louder later; a clipped recording cannot be unclipped.',
    'Let the drums change when the section changes. Removing a hat, adding a fill, or changing the kick can announce the next part.',
    'Try one clear contrast move: wider, quieter, brighter, drier, or emptier. Contrast makes a section feel new without replacing everything.',
    'Mute one part and listen again. If the song gets clearer, that track may only belong in selected sections.',
  ],
  chatterbox: [
    'Build the rundown as an arc: open the door, develop the idea, then leave the listener somewhere intentional.',
    'Give every segment a purpose. An intro sets up, an interview reveals, tape proves, a break resets, and an outro closes.',
    'Record pickups as complete thoughts with a little silence before and after. Clean edges make the cut quicker.',
    'Cut for pace by listening across the edit. Remove dead time without removing the breath that makes speech sound human.',
    'Move music under voices instead of fighting them. The words should stay understandable without draining all energy from the bed.',
    'Package for someone who missed the whole process. The title, cover, description, chapters, and credits should explain what they are opening.',
  ],
  blast: [
    'Build one reading path. The eye should find the main message, then the supporting detail, then the action or credit.',
    'Choose one dominant element. If the headline, photo, date, and badge all shout equally, none of them leads.',
    'Align edges on purpose. Shared left edges or centers make separate pieces feel like one composition.',
    'Repeat a color, shape, line, or spacing rule so the page feels related without making every part identical.',
    'Check the design at the size people will see it. A poster across a hall and a phone graphic need different type and detail.',
    'Whitespace is part of the layout. Empty space can group related pieces and give the main message room to land.',
  ],
  stinger: [
    'Keep important words and faces inside title-safe. Screens crop differently, especially when the graphic sits over video.',
    'Give each screen one main message. A viewer should understand it before the graphic leaves.',
    'Read the words aloud at a calm pace, then leave a beat. That is the minimum useful screen duration.',
    'Build scenes as a family. Shared type, color, spacing, and motion make an opener, lower third, and end card feel like one show.',
    'Test an overlay on both a bright frame and a dark frame. A backing panel or shadow can protect the words when footage changes.',
    'Use motion to reveal hierarchy: first the category, then the name, then the supporting detail. Movement should clarify the order.',
  ],
  showtime: [
    'Name and sort source clips before the timeline fills up. A clear bin makes every later edit faster.',
    'Cut where an action or thought changes. The viewer follows meaning more easily when picture changes have a reason.',
    'Use B-roll to show what the speaker means, cover a trim, or establish place—not only to decorate the interview.',
    'Balance music under the quietest important voice, not only under the loudest speaker.',
    'Watch once with the sound off. Captions, titles, and pictures should still carry the essential message.',
    'Watch the complete export from its first frame to its last. Check cuts, captions, credits, silence, and the final held image.',
  ],
  greenlight: [
    'Review the work as its audience will receive it. Read the page, watch the cut, or hear the episode from beginning to end.',
    'Compare the deliverable to the project brief. Check whether it serves the intended audience and purpose, not whether it matches your personal taste.',
    'Verify the spelling of names, roles, teams, places, and credits against the source material.',
    'Make a note actionable: name the location, the problem you can observe, and the result needed.',
    'Separate release blockers from ideas for another version. Permissions, missing files, and wrong facts stop release; optional polish can wait.',
    'If words, media, timing, or credits change after review, reopen the check on the version the audience will actually get.',
  ],
  files: [
    'An editable project and a finished export serve different jobs. Keep the project for changes and use the export for sharing.',
    'Preview a file before downloading it. Check that it belongs to the right project and contains the version you expect.',
    'Use a filename another person can understand: project, deliverable, and version or date.',
    'Keep related audio, graphics, documents, video, and packages attached to the same project whenever possible.',
    'Download the publication copy before moving to another platform. The preview is a check, not the handoff file.',
    'Open a file in its making room when it needs changes. Media Bin gathers the work; the production room edits it.',
  ],
  reruns: [
    'Watch, read, or listen as the audience. Notice where your attention rises, drifts, or needs more information.',
    'Check the beginning and ending back to back. They should feel like parts of the same piece.',
    'Listen once without looking. You may catch buried words, abrupt edits, or silence that the picture distracted you from.',
    'Inspect names and credits in the finished version. Everyone who contributed should be represented correctly.',
    'Compare how the same project works as a page, clip, episode, or show segment. Each format can emphasize a different strength.',
    'Use finished work as a reference for a technique, not a mold. Borrow the principle and make a new arrangement.',
  ],
  frontdesk: [
    'Check the active badge before changing adviser settings. The name in the corner should match the person at the computer.',
    'Scan project status before release. The route shows whether the crew is making, checking, exporting, or already finished.',
    'Release controls belong to the adviser badge because publication is the final human decision, not an automatic step.',
    'Removing a badge stops future check-in. Existing bylines, credits, and finished work keep the name that made them.',
    'Open the exact project before publishing so its review, files, and finished package stay together.',
    'Hand the computer back to the badge table when adviser work is finished. The next student should enter under their own badge.',
  ],
};

const FOCUS_COPY: Record<ReilyFocus, readonly [string, string]> = {
  'slate.direction': ['Try finishing this sentence: “After this, our audience will understand…” The ending usually reveals the project direction.', 'Choose one angle you can support with material the crew can actually gather.'],
  'slate.questions': ['Write questions that invite examples, moments, and reasons—not only yes or no.', 'Put the hardest unanswered question near the top so the crew sees the reporting gap early.'],
  'slate.sources': ['A person, document, and firsthand observation can reveal different sides of the same subject.', 'Record where each fact or quote came from while the source is still in front of you.'],
  'desk.write': ['Draft the useful sentence first. You can shape its rhythm after the information is on the page.', 'If the cursor stalls, write the next fact you know, then decide where it belongs.'],
  'desk.structure': ['Give each paragraph one job. If its sentences do different jobs, split or move them.', 'Read only the first sentence of every paragraph. Together they should form a clear path.'],
  'desk.sources': ['Use project notes to pull in verified details instead of rebuilding them from memory.', 'Introduce a quote with enough context that the reader knows who is speaking and why it matters.'],
  'desk.review': ['Answer the note at the exact place it points to, then reread the sentence before and after the change.', 'A revision note is a production instruction. Resolve the observable issue without erasing your own voice.'],
  'booth.setup': ['Do a ten-second mic check at real performance volume, then listen through headphones before the take.', 'Turn off noisy fans and move reflective objects only when the room sound actually needs it.'],
  'booth.record': ['Keep rolling after a stumble, pause, and restart the sentence. The clean pause gives the editor room.', 'Watch the meter with your side vision and keep your main attention on the delivery.'],
  'booth.listen': ['Compare takes from the same starting sentence so differences in pace and feeling are easy to hear.', 'Listen for clear words, steady level, room noise, and whether the delivery fits the piece.'],
  'booth.edit': ['Trim after the breath when the breath belongs to the sentence; trim before it when the next thought starts fresh.', 'Play across every cut. The join matters more than either edge by itself.'],
  'studio.instrument': ['Choose a sound for its role: pulse, bass, chord, melody, texture, or accent.', 'Record a short phrase, then adjust the sound while the phrase loops so your hands can focus on listening.'],
  'studio.record': ['Use the count-in to hear the tempo before the first note or word lands.', 'Practice once with the track moving, then record. Knowing the entry is more useful than staring at the record button.'],
  'studio.arrange': ['Duplicate a section only after naming what changes the second time through.', 'Leave room for an entrance. A part feels larger when it arrives after space.'],
  'studio.mix': ['Turn the whole mix down before fixing a red master meter. Headroom is a mix decision, not a last-second patch.', 'Make one voice or instrument the focus, then move competing tracks under or around it.'],
  'chatterbox.rundown': ['Alternate information, voice, and texture so the episode does not stay in one gear.', 'Write a purpose on every rundown card; cards with the same purpose may belong together or need a different job.'],
  'chatterbox.record': ['Record host links with the next segment in mind so the final word can hand the listener forward.', 'Leave a clean second before and after remote or imported tape when you can.'],
  'chatterbox.edit': ['Move clips for meaning first, then trim pauses and breaths for pace.', 'Build and play the full cut often. A clip can work alone and still feel wrong in the episode.'],
  'chatterbox.package': ['Write the description for a listener deciding whether to press play, not for the crew who already knows the project.', 'Check cover, title, description, chapters, credits, and master as one listener-facing package.'],
  'blast.canvas': ['Zoom out until the whole page fits. The overall balance should still make sense before you read the words.', 'Turn on margins and snap while building structure, then switch them off to judge the finished page.'],
  'blast.text': ['Set hierarchy with size, weight, spacing, and placement before adding another font.', 'Shorten a headline before shrinking it into a space where nobody can read it.'],
  'blast.image': ['Choose crop or fit based on the subject. Do not cut off the detail that makes the picture informative.', 'Check brightness and contrast in the full composition; the surrounding colors change how the photo feels.'],
  'blast.shape': ['Use shapes to group, point, frame, or establish rhythm. Give each shape a job.', 'Repeat a corner, stroke, or color rule before adding a new kind of shape.'],
  'stinger.screen': ['Preview the whole screen at normal speed before editing a single layer.', 'Check the first and last frame. A clean entrance and exit make the package feel finished.'],
  'stinger.text': ['Keep on-screen wording shorter than print wording. Viewers read while watching something else.', 'Pair a name with only the role or detail the viewer needs at that moment.'],
  'stinger.image': ['Use an image that still reads behind titles and motion; busy detail may need a crop or backing panel.', 'Preview image edges inside title-safe so the important subject survives different screens.'],
  'stinger.motion': ['Offset layer entrances slightly to show reading order instead of launching everything together.', 'Scrub to the middle of the move. A strong start and end can still hide an awkward path between them.'],
  'showtime.record': ['Frame a little wider than you think you need when the shot may be cropped later.', 'Record a stable five seconds before and after the action. Those handles make editing easier.'],
  'showtime.switch': ['Prepare the next source in Preview, check it, then Take. Program is the audience feed.', 'Call the destination before switching so camera and talent know what is about to happen.'],
  'showtime.cut': ['Build the main picture story on the primary track before decorating it with overlays.', 'Play from a few seconds before the cut. Edits are judged by what leads into and out of them.'],
  'showtime.captions': ['Keep caption phrases readable in one glance and time them to the spoken thought.', 'Check names, punctuation, and line breaks while watching at normal speed with sound off.'],
  'greenlight.preview': ['Open the actual deliverable, not only its project card. Review what the audience will receive.', 'Use the beginning-to-end preview before jumping to individual checklist items.'],
  'greenlight.notes': ['Write one observable issue per note and point to the moment, page, or layer where it occurs.', 'If a note offers a solution, also name the underlying problem so the maker can choose the best fix.'],
  'greenlight.release': ['Confirm permissions, names, credits, and final files before the adviser makes the release decision.', 'A fresh export after a material edit needs a fresh final check.'],
};

const RECOVERY_COPY: Record<ReilyRecoveryKind, { room: ReilyRoom; text: string }> = {
  'slate.save': { room: 'slate', text: 'Your open plan is still on screen. Retry the save before leaving this project, then confirm the saved notice returns.' },
  'desk.save': { room: 'desk', text: 'Your words are still in this tab. Press Retry save before navigating away, then wait for the saved mark.' },
  'booth.microphone': { room: 'booth', text: 'No take was changed. Check the browser microphone permission and selected input, then run Mic check again.' },
  'booth.import': { room: 'booth', text: 'Your existing takes did not change. Choose the recording again and keep the original file available until the import finishes.' },
  'studio.engine': { room: 'studio', text: 'Your arrangement is still here. Stop playback, press the engine retry control, and wait for the ready light before playing again.' },
  'studio.record': { room: 'studio', text: 'No finished take was replaced. Check the input and count-in, then make a short test recording before the full pass.' },
  'studio.import': { room: 'studio', text: 'Your arrangement did not change. Check that the sound is WAV, MP3, M4A, WebM, OGG, or FLAC, then try Bring in a sound again.' },
  'studio.export': { room: 'studio', text: 'Your arrangement is still editable. Retry the mix after playback stops; keep this room open until the file reaches Media Bin.' },
  'chatterbox.microphone': { room: 'chatterbox', text: 'No episode clip was changed. Check microphone permission and input, then make a short check before recording the segment.' },
  'chatterbox.import': { room: 'chatterbox', text: 'Your current cut did not change. Rechoose the audio file and wait for its duration to appear before placing it.' },
  'chatterbox.export': { room: 'chatterbox', text: 'Your episode edit is still here. Rebuild the listening mix, check it once, then try the package again.' },
  'blast.import': { room: 'blast', text: 'Your page did not change. Choose the image again and keep this project open while the photo is screened and placed.' },
  'blast.export': { room: 'blast', text: 'Your editable page is still here. Retry the export and confirm the new file appears in Media Bin before leaving.' },
  'stinger.import': { room: 'stinger', text: 'Your scenes did not change. Choose the image again and wait for its preview before assigning it to the layer.' },
  'stinger.export': { room: 'stinger', text: 'Your graphic package is still editable. Stop the preview, retry the export, and confirm the finished file appears in Media Bin.' },
  'showtime.camera': { room: 'showtime', text: 'No recorded shot was changed. Check camera permission and source, then make a short Roll test before the full take.' },
  'showtime.microphone': { room: 'showtime', text: 'No recorded shot was changed. Check microphone permission and the selected input, then test the level again.' },
  'showtime.media': { room: 'showtime', text: 'Your existing edit did not change. Rechoose the source file and wait for its thumbnail and duration before cutting it in.' },
  'showtime.export': { room: 'showtime', text: 'Your timeline is still editable. Stop preview playback, retry the render, and watch the finished file before handoff.' },
  'greenlight.load': { room: 'greenlight', text: 'No review decision changed. Retry loading the project, then open the actual deliverable before leaving a note or release decision.' },
};

function roomCards(): ReilyAdvice[] {
  return REILY_ROOMS.flatMap((room) => ROOM_COPY[room].map((text, index) => ({
    id: `${room}-room-${String(index + 1).padStart(2, '0')}`,
    room,
    kind: index === 4 ? 'EXPERIMENT' as const : index === 5 ? 'ORIENTATION' as const : 'CRAFT' as const,
    text,
    mood: index % 3 === 0 ? 'grin' as const : index % 3 === 1 ? 'smile' as const : undefined,
  })));
}

function focusCards(): ReilyAdvice[] {
  return (Object.entries(FOCUS_COPY) as Array<[ReilyFocus, readonly [string, string]]>).flatMap(([focus, copy]) => {
    const room = focus.split('.')[0] as ReilyRoom;
    return copy.map((text, index) => ({
      id: `${focus.replace('.', '-')}-${String(index + 1).padStart(2, '0')}`,
      room,
      focus,
      kind: index === 0 ? 'TOOL' as const : 'EXPERIMENT' as const,
      text,
      mood: index === 0 ? 'smile' as const : 'grin' as const,
    }));
  });
}

function recoveryCards(): ReilyAdvice[] {
  return (Object.entries(RECOVERY_COPY) as Array<[ReilyRecoveryKind, { room: ReilyRoom; text: string }]>).map(([recovery, card]) => ({
    id: `${recovery.replace('.', '-').replace('microphone', 'mic')}-recovery-01`,
    room: card.room,
    recovery,
    kind: 'RECOVERY',
    text: card.text,
    mood: 'flat',
  }));
}

export const REILY_ADVICE: readonly ReilyAdvice[] = [
  ...roomCards(),
  ...focusCards(),
  ...recoveryCards(),
];

export function eligibleReilyAdvice(context: ReilyContext): ReilyAdvice[] {
  const recovery = context.recovery
    ? REILY_ADVICE.filter((card) => card.room === context.room && card.recovery === context.recovery?.kind)
    : [];
  const focus = context.focus
    ? REILY_ADVICE.filter((card) => card.room === context.room && card.focus === context.focus)
    : [];
  const room = REILY_ADVICE.filter((card) => card.room === context.room && !card.focus && !card.recovery);
  return [...recovery, ...focus, ...room];
}

export function nextReilyAdvice(context: ReilyContext, seenIds: readonly string[]): { card: ReilyAdvice; exhausted: boolean } {
  const eligible = eligibleReilyAdvice(context);
  if (!eligible.length) throw new Error(`Reily has no advice for ${context.room}.`);
  const seen = new Set(seenIds);
  const unseen = eligible.find((card) => !seen.has(card.id));
  return { card: unseen ?? eligible[0]!, exhausted: !unseen };
}

const FORBIDDEN_COPY = [
  'great job', 'looks bad', 'boring', 'ugly', 'not creative', 'your score', 'localStorage', 'IndexedDB', 'the app stores',
] as const;

export function validateReilyAdvice(cards: readonly ReilyAdvice[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const copy = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) issues.push(`${card.id}: duplicate id`);
    ids.add(card.id);
    if (copy.has(card.text)) issues.push(`${card.id}: duplicate copy`);
    copy.add(card.text);
    if (card.kind !== 'RECOVERY' && card.text.length > 240) issues.push(`${card.id}: copy exceeds 240 characters`);
    for (const phrase of FORBIDDEN_COPY) {
      if (card.text.toLowerCase().includes(phrase.toLowerCase())) issues.push(`${card.id}: copy contains forbidden phrase "${phrase}"`);
    }
  }
  return issues;
}
