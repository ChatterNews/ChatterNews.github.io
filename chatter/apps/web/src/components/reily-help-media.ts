import type { ReilyHelpContext, ReilyHelpTopic } from './reily-help-types.js';

// Authored against the real controls. Predicates recommend; search can still find a
// recovery guide before the problem happens. Only small UI facts are inspected.
const tool = (name: string) => (c: ReilyHelpContext) => c.situation?.activeTool === name;
const empty = (c: ReilyHelpContext) => c.situation?.projectSelected === true && c.situation.hasContent === false;
const video = (c: ReilyHelpContext) => c.situation?.activeTool === 'CUT';
const selectedVideoKind = (...kinds: string[]) => (c: ReilyHelpContext) => video(c) && kinds.includes(c.situation?.selectedKind ?? '');
const recovering = (c: ReilyHelpContext) => c.situation?.activeTool === 'RECOVER';
const topic = (room: ReilyHelpTopic['room'], id: string, title: string, keywords: string[], summary: string, steps: string[], extra: Partial<ReilyHelpTopic> = {}): ReilyHelpTopic => ({ room, id: `media.${id}`, title, keywords, summary, steps, ...extra });

export const REILY_MEDIA_HELP: readonly ReilyHelpTopic[] = [
  topic('booth', 'booth-start', 'Record my first voice take', ['start', 'voice', 'record', 'microphone', 'mic'], 'Booth records one story’s voice. Start with a short sound check.', [
    'Check the Story picker, then choose a performance mode for the kind of read you are making.',
    'Press Check microphone. Allow the browser request, speak, and watch the Sound check meter move.',
    'Press Record a take, wait for the count-in, and read. Press Stop & save when you finish.',
    'Select the saved take below and listen before choosing what to keep.',
  ], { focus: ['booth.setup'], when: empty }),
  topic('booth', 'booth-no-story', 'Choose the story before recording', ['missing', 'story', 'empty', 'start'], 'The recording needs a story to belong to.', [
    'Press Open Slate and create or open the story you are recording for.',
    'Return to Booth and check the Recording story picker before starting a take.',
  ], { priority: 80, when: c => c.situation?.projectSelected === false }),
  topic('booth', 'booth-mic', 'My microphone is not working', ['permission', 'blocked', 'mic', 'silent', 'no sound', 'hear'], 'Check permission and the selected input before making another take.', [
    'Look for a microphone permission request from the browser. If access is blocked, ask your adviser to help allow it for Orbit.',
    'Choose your microphone in Sound check and press Check microphone or Recheck microphone.',
    'Speak and watch the meter. If it stays still, check the microphone’s mute switch and connection.',
    'Record a short test and listen. If a school setting blocks access, ask the adviser rather than repeatedly pressing Record.',
  ], { priority: 95, when: c => c.recovery?.kind === 'booth.microphone' }),
  topic('booth', 'booth-pickup', 'I made a mistake while recording', ['mistake', 'pause', 'redo', 'pickup', 'marker'], 'You can mark a mistake and repeat the sentence without starting the whole take over.', [
    'Press Mark pickup near the mistake so you can find it later.',
    'Pause speaking, then repeat the whole sentence. Use Pause recording and Resume recording if you need thinking time.',
    'Press Stop & save. Listen around the pickup marker; use Chatterbox if you need to join pieces from several takes.',
  ], { priority: 85, focus: ['booth.record'], when: c => c.situation?.recording === true }),
  topic('booth', 'booth-recover', 'Keep a recording that did not save', ['save', 'failed', 'lost', 'recovery', 'download'], 'An unsaved capture needs attention before you leave the tab.', [
    'Keep this tab open while the Recording not saved message is visible.',
    'Press Download recovery audio and check that the download arrived.',
    'Try Retry saving take. If it still fails, keep the downloaded recording and ask your adviser for help.',
  ], { priority: 100, when: recovering }),
  topic('booth', 'booth-import', 'Bring in a recording from another device', ['import', 'phone', 'audio', 'wav', 'mp3', 'm4a'], 'Use an audio file, then have an adviser check the imported recording.', [
    'Check the story, then press Import a recording and choose the audio file.',
    'Use a non-empty file under 100 MB and no longer than 15 minutes. Split a longer interview into parts first.',
    'If the file cannot open, try an audio export such as WAV, MP3, or M4A from the original app.',
    'Ask an adviser to check uploaded recordings in Green Light before playback or use.',
  ], { priority: 90, when: c => c.recovery?.kind === 'booth.import' }),
  topic('booth', 'booth-trim', 'Trim a take and use it in my story', ['trim', 'cut', 'export', 'wav', 'chatterbox'], 'Choose the useful start and end, then save the edited version.', [
    'Select a take in The take room. Listen to where the useful speech starts and ends.',
    'Adjust Start and End under Keep the good part, or use Set start at playhead and Set end at playhead.',
    'Listen across both edges. Add a little Fade in or Fade out if an edge clicks.',
    'Choose Export edited WAV for a download, or Add to Chatterbox / Save edited story clip for the linked story’s workflow.',
  ], { focus: ['booth.edit', 'booth.listen'], when: c => c.situation?.selectionCount === 1 }),

  topic('booth', 'booth-approval', 'A take says Waiting for media check', ['approval', 'waiting', 'locked', 'listen', 'import'], 'An imported take must be reviewed before it can play or enter the story.', [
    'Select the take and check its status in The take room.',
    'Ask an adviser to review the uploaded recording in Green Light.',
    'Return to Booth and press Refresh takes after approval, then listen and trim the take.',
  ], { priority: 90, when: c => c.situation?.needsApproval === true }),
  topic('chatterbox', 'podcast-microphone', 'The episode microphone is not responding', ['microphone', 'mic', 'permission', 'blocked', 'record'], 'Check the input in Record before trying a new take.', [
    'Open Record and choose the microphone in Mic and destination.',
    'Press Check microphone. Allow the browser request if shown; if access is blocked, ask the adviser to help.',
    'Speak and check the input meter. Check the device mute switch and cable if the meter stays still.',
    'Make a short test take and listen before recording the full episode.',
  ], { priority: 95, when: c => c.recovery?.kind === 'chatterbox.microphone' }),
  topic('chatterbox', 'podcast-start', 'Turn recordings into an episode', ['start', 'podcast', 'episode', 'workflow'], 'The stations take you from a plan to a finished listening package.', [
    'Use Rundown to plan the parts of your episode and what each part should say.',
    'Use Record to capture voices or Add recordings in the Phone recordings tray.',
    'Use Cut to choose and arrange the useful pieces, then Mix to balance the tracks.',
    'Use Package to add credits and a description, check the listed problems, and build the handoff.',
  ], { when: empty }),
  topic('chatterbox', 'podcast-import', 'Bring everyone’s phone recordings together', ['phone', 'import', 'group', 'recordings', 'files'], 'The Phone recordings tray brings separate recordings into one episode.', [
    'Open Record or Cut and find Phone recordings. Press Add recordings and choose the audio files.',
    'Ask an adviser to review recordings waiting for approval before using them.',
    'For separate speeches, select the voices in speaking order and use Snap selected voices together.',
    'Listen through the joins. Open Cut for finer trims and spacing.',
  ], { focus: ['chatterbox.record'], when: c => c.recovery?.kind === 'chatterbox.import' }),
  topic('chatterbox', 'podcast-align', 'Match phones that recorded the same conversation', ['sync', 'align', 'clap', 'conversation', 'phones', 'overlap'], 'Use the same audible moment in each recording as a shared starting clue.', [
    'In Phone recordings, choose Same conversation, several phones.',
    'Listen to each approved recording, pause at the same shared sound, and press Mark shared sound here.',
    'Select the recordings and press Align shared cues.',
    'Listen near the beginning and end. If voices drift apart, ask the adviser to help adjust the timing; one shared cue does not fix changing recorder speed.',
  ]),
  topic('chatterbox', 'podcast-cut', 'Remove a mistake from the middle', ['split', 'cut', 'delete', 'mistake', 'trim'], 'Select the clip first, then put the playhead where the cut belongs.', [
    'Open Cut and click the clip you want to edit.',
    'Place the yellow playhead inside that clip and press Split. Repeat at the end of the unwanted part.',
    'Select just the unwanted piece and press Remove. Move the remaining pieces into place.',
    'Press Build + play full cut or Rebuild mix to hear the new join. Use Undo if you removed the wrong piece.',
  ], { focus: ['chatterbox.edit'], when: tool('CUT') }),
  topic('chatterbox', 'podcast-select', 'The editing controls are not available', ['disabled', 'grey', 'select', 'clip', 'controls'], 'Cut’s edit bench opens for a selected clip.', [
    'Open Cut and click a clip on the timeline, not just an empty part of the track.',
    'Use the Edit bench for Trim in, Trim out, Clip level, and fades.',
    'If there are no clips, choose saved audio in Tape shelf and press Place at end, or record a take first.',
  ], { priority: 70, when: c => tool('CUT')(c) && c.situation?.selectionCount === 0 }),
  topic('chatterbox', 'podcast-silent', 'My episode is silent or a track disappeared', ['silent', 'sound', 'mute', 'solo', 'volume', 'hear'], 'Check the mix controls and rebuild the listening copy after changes.', [
    'Open Mix. Turn off unwanted MUTE buttons and any SOLO that is hiding other tracks.',
    'Check the track level and the selected clip’s Clip level in Cut. Also check your headphones and computer volume.',
    'Make a listening preview, or use Rebuild mix in Cut, so you hear the current changes.',
    'If the app reports a missing or unapproved recording, restore that source or ask an adviser to review it before retrying.',
  ], { when: tool('MIX') }),
  topic('chatterbox', 'podcast-music', 'Keep music below the voices', ['music', 'loud', 'duck', 'balance', 'effects'], 'Background sound should leave the words easy to hear.', [
    'Open Mix and find the music or effects track.',
    'Lower its level, then turn on Move under voices if it should dip while people speak.',
    'Press Make a listening preview and listen to a quiet sentence as well as a loud one.',
  ], { when: tool('MIX') }),
  topic('chatterbox', 'podcast-transcript', 'The transcript is missing or a word is wrong', ['transcript', 'words', 'text', 'waiting'], 'You can continue editing the audio while transcription finishes.', [
    'In Cut, select the clip and look at Transcript cut. A waiting message means the text is not ready yet.',
    'Use the waveform and Trim in / Trim out while you wait. Listen to the original for names and exact quotes.',
    'When transcript parts appear, Cut removes that audio range; Put back restores it. Check the listening preview after changes.',
  ], { when: tool('CUT') }),
  topic('chatterbox', 'podcast-credits', 'Credit the people who made this episode', ['credits', 'names', 'members', 'sources', 'description'], 'Episode credits travel with the show notes in the package.', [
    'Open Package and enter the members and their contributions in Episode credits.',
    'Add source credits and any attribution required for outside music or sounds.',
    'Check Episode description and cover art, then rebuild the package after changing these details.',
  ], { when: tool('PACKAGE') }),
  topic('chatterbox', 'podcast-export', 'Finish or fix an episode handoff', ['export', 'package', 'download', 'zip', 'green light', 'blocked'], 'Package lists what still needs attention before the episode can leave.', [
    'Open Package and read the list under Handoff. Fix those items first, including missing media or episode details.',
    'Listen to a preview, check credits, and confirm music rights only when the crew or adviser has checked the permission.',
    'Press Build package + send to Green Light. Keep the tab open while the package builds.',
    'Use Download episode ZIP when it is ready. If a build fails, read its message, fix that cause, and retry; do not clear browser storage.',
  ], { priority: 90, when: c => c.recovery?.kind === 'chatterbox.export' || tool('PACKAGE')(c) }),

  topic('foley', 'foley-start', 'Make a short sound cue', ['start', 'sound', 'effect', 'cue', 'empty'], 'Choose a tool on the left; its options open beside the sound canvas.', [
    'Choose Sounds and listen to an included sound, or use Import audio for your own source.',
    'Add the sound to the canvas. Choose Arrange to place it, Shape to change its edges, and Mix to balance it.',
    'Press Play cue to hear the result, then Finish and Save sound version when it is ready.',
  ], { when: empty }),
  topic('foley', 'foley-import', 'Import downloaded audio with its credits', ['import', 'free', 'license', 'source', 'download', 'folder'], 'Bring the audio file into Orbit and keep its source information with it.', [
    'Choose Sounds → Import audio. Use Choose audio files or Choose a folder, or drop files into the import area.',
    'Fill in the creator, source page, and license from the place you got the sound.',
    'Use Different credits on a file when its source differs from the batch, then press Import sounds (the button includes the file count).',
    'Ask an adviser to review imported audio before using it. A free download still needs its own license checked.',
  ], { when: tool('IMPORT') }),
  topic('foley', 'foley-import-retry', 'Some sounds did not finish importing', ['failed', 'import', 'retry', 'cancel', 'files'], 'Retry the unsaved files rather than importing the whole batch again.', [
    'Read the message beside each file in the import list.',
    'Correct the file or missing source details, then choose Retry unsaved files.',
    'Cancel remaining stops the rest of a running batch; files already saved remain in Our sounds.',
  ], { priority: 90, when: c => tool('IMPORT')(c) && c.situation?.error === true }),
  topic('foley', 'foley-record', 'Record a sound from the room', ['record', 'mic', 'microphone', 'effect'], 'Give the sound a useful name before you capture it.', [
    'Choose Record and enter a Recording name, such as Door closing softly.',
    'Choose a microphone and press Check microphone. Allow the browser request and check that the input level responds.',
    'Press Record sound, make the effect, then press Stop & save recording.',
    'Find the recording in Sounds → Our sounds and add it to your cue when it is ready to use.',
  ], { when: tool('RECORD') }),
  topic('foley', 'foley-microphone', 'Foley cannot hear my microphone', ['microphone', 'mic', 'permission', 'blocked', 'record'], 'Use the Record tool to check permission and the selected microphone.', [
    'Choose Record and select the microphone you connected.',
    'Press Check microphone and allow the browser request. If access was blocked, ask the adviser to help with the site permission.',
    'Check the microphone mute switch and cable, then watch the input reading while making your sound.',
  ], { priority: 95, when: tool('MICROPHONE') }),
  topic('foley', 'foley-recover', 'Recover an unsaved sound recording', ['save', 'recovery', 'lost', 'download', 'recording'], 'Keep the captured sound before closing this tab.', [
    'Press Download recovery recording and check that a file downloaded.',
    'Try Retry saving recording and wait for the saved message.',
    'If saving still fails, keep the downloaded file and ask your adviser. Discard unsaved recording removes the recovery copy from this tab.',
  ], { priority: 100, when: recovering }),
  topic('foley', 'foley-arrange', 'Put sounds in the right order', ['arrange', 'move', 'layer', 'timeline'], 'The canvas holds the pieces of your cue; selecting one opens its options.', [
    'Choose Arrange, then select a sound on the canvas.',
    'Move it to the time where it should happen. Put overlapping sounds on separate layers when you want to balance them separately.',
    'Press Play cue and listen to the timing. Use Undo if the last move was not what you meant.',
  ], { when: tool('ARRANGE') }),
  topic('foley', 'foley-shape', 'Soften a click or shorten a sound', ['trim', 'fade', 'shape', 'click', 'shorten'], 'Select a sound before opening Shape.', [
    'Click the sound on the canvas, then choose Shape.',
    'Use Soft start and Soft finish for gentler edges. Open Trim & exact values for Source in and Source out.',
    'Press Play cue and listen across both edges. Use Undo to compare the change.',
  ], { when: tool('SHAPE') }),
  topic('foley', 'foley-mix', 'One sound is too loud or cannot be heard', ['mix', 'volume', 'silent', 'loud', 'mute', 'solo'], 'Balance the layers together, then play a fresh cue preview.', [
    'Choose Mix and select the layer you want to change.',
    'Check Mute this layer and Layer volume. Lower a loud layer rather than raising every other layer.',
    'Press Play cue again and listen. If the peak message says it is too loud, lower a layer and try again.',
  ], { when: tool('MIX') }),
  topic('foley', 'foley-send', 'Use this sound in my video or podcast', ['send', 'stinger', 'chatterbox', 'handoff', 'use', 'export'], 'Save a sound version, then choose where it belongs.', [
    'Choose Finish and press Save sound version.',
    'Press Use saved sound and choose your saved Stinger video or Chatterbox episode.',
    'Review the placement in the receiving app before adding it. If there is no destination yet, create a video or episode there and use Add sound.',
  ], { when: tool('FINISH') }),
  topic('foley', 'foley-pack', 'Move editable sounds to another computer', ['usb', 'pack', 'save', 'editable', 'backup', 'transfer'], 'A WAV is the finished sound. A sound pack carries editable sound work.', [
    'Use Finish → Save editable sound pack, or Projects → Save sound pack.',
    'Copy the downloaded .soundpack file to your USB drive and check that it arrived.',
    'On the other computer, open Foley → Projects → Open sound pack. Ask the adviser to review imported audio before use.',
  ]),
  topic('foley', 'foley-credit', 'Add the sound crew’s names', ['credits', 'members', 'attribution', 'names'], 'Cue credits describe the people who made the arrangement.', [
    'Choose Finish and open Who made it?',
    'Enter members and their contributions. Keep outside-source attribution with the imported sounds too.',
    'Save a sound version after updating the credits before handing that version to another app.',
  ], { when: tool('FINISH') }),

  topic('stinger', 'video-start', 'Put my first footage on the timeline', ['start', 'video', 'import', 'footage', 'append'], 'The Story bin holds sources. The timeline holds the parts you choose.', [
    'Press Import media for video or audio, or Record to capture footage in Showtime.',
    'After any required adviser review, select a source in Story bin and preview it in SOURCE.',
    'Pause at the beginning you want and press Set In. Pause at the ending and press Set Out.',
    'Press Append to add it to the end of the video. Play PROGRAM to see the assembled edit.',
  ], { when: c => video(c) && empty(c) }),
  topic('stinger', 'video-edits', 'Insert a shot or put footage over another shot', ['insert', 'overwrite', 'overlay', 'b-roll', 'append'], 'Choose the edit that matches what should happen to the existing story.', [
    'Choose a source, then use Set In and Set Out to mark the part you want.',
    'Set the PROGRAM playhead where you want the new part to begin.',
    'Use Insert to make room in the main story, Overwrite to replace that time, Place on top for an overlay, or Append for the end.',
    'Play across the edit and use Undo if you chose the wrong move.',
  ], { when: video }),
  topic('stinger', 'video-select', 'Open the controls for a video clip or title', ['select', 'controls', 'disabled', 'grey', 'clip', 'title', 'inspector'], 'A source in the bin and a piece on the timeline have different controls.', [
    'To change an existing edit, click its clip or title on the timeline below PROGRAM.',
    'The inspector below the cut opens the settings for that selection. A clip has trim and volume controls; a title has text or graphic controls.',
    'To bring in new media instead, choose it in Story bin and use the SOURCE controls first.',
  ], { priority: 65, when: c => video(c) && c.situation?.hasContent === true && c.situation?.selectionCount === 0 }),
  topic('stinger', 'video-trim', 'Cut a mistake out of a video clip', ['split', 'trim', 'cut', 'delete', 'mistake'], 'Work on the selected timeline clip and check the join afterward.', [
    'Click the timeline clip. Put the playhead inside it where the unwanted section begins and press Split.',
    'Split at the end of that section, select the unwanted piece, and press Delete.',
    'For an edge trim, drag Trim start / Trim end or adjust In point / Out point in the inspector.',
    'Play across the join. If a clip will not move, check whether its track’s Lock button is on.',
  ], { when: selectedVideoKind('VIDEO', 'AUDIO') }),
  topic('stinger', 'video-text', 'Add a name label or a graphic', ['text', 'title', 'graphic', 'name', 'caption'], 'Text and graphics have their own timing on the title track.', [
    'Move the playhead where the label should begin and press Add text, or Add graphic for a designed graphic.',
    'Select the title on the timeline to edit its content and timing.',
    'For a graphic already in the edit, select it and choose Edit graphic design.',
    'Preview over the actual footage and give the audience enough time to read it.',
  ], { focus: ['showtime.captions'], when: selectedVideoKind('TITLE', 'GRAPHIC') }),
  topic('stinger', 'video-credits', 'Put member credits at the end', ['credits', 'members', 'names', 'end', 'attribution'], 'The project’s credits field can make an end-credit graphic.', [
    'Open Project credits above the editing workspace.',
    'Enter one member and contribution per line, plus any required source credits.',
    'Press Add end credits. If you later change the credits field, press Update end credits to rebuild the cards.',
    'Select the end cards to check their timing and graphic design, then watch the ending before export.',
  ], { when: selectedVideoKind('CREDITS') }),
  topic('stinger', 'video-sound', 'Fix missing sound in my video', ['silent', 'sound', 'volume', 'mute', 'music', 'audio'], 'Check both the clip and its track before exporting again.', [
    'Select the clip and check Mute clip and Volume in the inspector.',
    'Check the track’s Mute button, then your computer volume and headphones.',
    'For a separate audio source in Story bin, choose Voice, Music, or Sounds to put it on an audio track.',
    'Play PROGRAM to hear the edit. A picture-only camera take has no recorded microphone sound to turn up.',
  ], { when: selectedVideoKind('AUDIO') }),
  topic('stinger', 'video-framing', 'My shot is cropped or in the wrong shape', ['crop', 'frame', 'vertical', 'fit', 'scale', 'picture'], 'Choose the project’s frame and then fit each shot inside it.', [
    'Check Frame in the project strip and choose the shape needed for the finished video.',
    'Select the clip. Choose Show whole image under Fit if you need to keep all its edges.',
    'Adjust Scale, Left / right, and Up / down while watching PROGRAM. Check that faces and text remain visible.',
  ], { when: selectedVideoKind('VIDEO') }),
  topic('stinger', 'video-export', 'Export is blocked or taking a long time', ['export', 'render', 'slow', 'download', 'blocked', 'save'], 'The export needs usable media and a checked timeline.', [
    'Read the cut-check findings and the error message. Fix missing sources, approval issues, or invalid timing first.',
    'Preview the beginning, joins, and ending. Choose Export final WebM for a download, or Render + send to Green Light for review.',
    'Rendering runs in real time. Keep the tab open and let the progress display finish before starting another export.',
    'If export fails, keep the project open, note the message, and ask your adviser. Clearing browser storage can remove local work.',
  ], { priority: 90, when: c => video(c) && (c.situation?.busy === true || c.recovery?.kind === 'showtime.export' || c.recovery?.kind === 'stinger.export') }),

  topic('showtime', 'showtime-record', 'Record a camera take with sound', ['camera', 'record', 'microphone', 'silent', 'start'], 'Camera and microphone are switched on separately.', [
    'In Roll, choose the Camera and press Start camera. Allow the browser’s camera request.',
    'Choose the Microphone and press Start microphone. Check that both device indicators are on.',
    'Press Record take, then Stop + save take when you finish.',
    'Press Edit in Stinger to continue with the same video project. Record picture-only take does not capture microphone sound.',
  ], { focus: ['showtime.record'], when: tool('ROLL') }),
  topic('showtime', 'showtime-permission', 'The camera or microphone will not open', ['permission', 'blocked', 'camera', 'mic', 'device'], 'Check the selected device and browser permission before recording.', [
    'Look for a camera or microphone request in the browser. Ask the adviser to help if access is blocked.',
    'Close another app that may be using the device, check its cable or privacy switch, and choose it in the device picker.',
    'Press Check camera. Once the camera is ready, press Start microphone or Check microphone.',
    'If school settings still prevent access, ask your adviser to help record elsewhere and bring the file in with Import footage.',
  ], { priority: 95, when: c => c.recovery?.kind === 'showtime.camera' || c.recovery?.kind === 'showtime.microphone' }),
  topic('showtime', 'showtime-switch', 'Choose what the audience sees next', ['live', 'preview', 'program', 'switch', 'take', 'screen'], 'PREVIEW is the next source. PROGRAM is the current output.', [
    'In Live, select the source you want in PREVIEW and check its picture.',
    'Choose a Transition, then press TAKE to move that source to PROGRAM.',
    'Use RECORD PROGRAM when you want to save the switched programme, then STOP PROGRAM when finished.',
    'Watch the saved result in Stinger before handing it off; changing PREVIEW alone does not change PROGRAM.',
  ], { focus: ['showtime.switch'], when: tool('LIVE') }),
  topic('showtime', 'showtime-stop', 'Finish recording before moving rooms', ['stop', 'save', 'leave', 'recording', 'busy'], 'Stop the active capture and wait for its save before opening another app.', [
    'For a camera take, press Stop + save take. For a live programme, press STOP PROGRAM.',
    'Wait for the saving message to finish and check for any error.',
    'Press Edit in Stinger to work on the saved recording. If saving failed, keep this tab open and ask your adviser for help.',
  ], { priority: 85, when: c => c.situation?.recording === true }),
];
