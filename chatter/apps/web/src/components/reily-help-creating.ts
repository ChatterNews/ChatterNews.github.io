import type { ReilyHelpContext, ReilyHelpTopic } from './reily-help-types.js';

const blastSelection = (kind: string) => (context: ReilyHelpContext) => context.situation?.selectedKind === kind;
const tool = (value: string) => (context: ReilyHelpContext) => context.situation?.activeTool === value;
const graphics = (context: ReilyHelpContext) => Boolean(context.situation?.activeTool?.startsWith('graphics:'));

/** Control names verified against the editors. Conditions rank help; they do not hide it from search. */
export const REILY_CREATING_HELP: readonly ReilyHelpTopic[] = [
  {
    id: 'blast.start', room: 'blast', title: 'Start my first design', keywords: ['start', 'new', 'poster', 'template', 'blank'],
    summary: 'Choose a job, then a starting page you can change.', when: tool('start'), priority: 10,
    steps: ['Choose a mission such as Spread the word or Share a story.', 'Pick the page type. Add your headline first is optional.', 'Click a look to open it. Select words or pictures on the page to make them yours.'], done: 'Your design is open with editable layers.',
  },
  {
    id: 'blast.resume', room: 'blast', title: 'Find a design I already made', keywords: ['saved', 'open', 'resume', 'missing', 'design'],
    summary: 'The design shelf holds work saved in this browser.', when: tool('start'),
    steps: ['On the starting screen, choose Keep working for the most recent design.', 'For another design, open All your saved designs and choose its title.', 'Already editing? Click BLAST to return to the shelf. Work on a different computer needs your saved project file.'],
  },
  {
    id: 'blast.select', room: 'blast', title: 'Select the thing I want to change', keywords: ['select', 'click', 'options', 'inspector', 'tools'],
    summary: 'Click a layer to show its controls on the right.', when: c => c.situation?.projectSelected === true && c.situation.selectionCount === 0,
    steps: ['Click the words, picture, or shape once on the page.', 'Look in Edit layer on the right for its settings. On a small screen, open Tools for extra toolbar controls.', 'If another object covers it, open Layers and click its name instead.'],
  },
  {
    id: 'blast.text', room: 'blast', title: 'Change the words on my page', keywords: ['text', 'type', 'words', 'headline', 'edit'],
    summary: 'Select a text box, then enter its word-editing mode.', focus: ['blast.text'], when: blastSelection('TEXT'), priority: 8,
    steps: ['Click the text box, then Edit words on page, or double-click the words.', 'Select the old words and type yours. You can also use Plain text on the right; that removes mixed formatting inside that box.', 'Choose Done above the page when you finish editing words. Drag the box to move it.'],
  },
  {
    id: 'blast.text-style', room: 'blast', title: 'Change fonts, size, and color', keywords: ['font', 'size', 'color', 'bold', 'italic', 'type'],
    summary: 'Style the whole text box or just a few words.', when: blastSelection('TEXT'),
    steps: ['Select a text box. Use Font, Size, and Text color in Edit layer for the whole box.', 'To style only some words, choose Edit words on page, highlight those words, then use Bold, Italic, or Underline above the page.', 'Choose Done and check the full page at a smaller Zoom to make sure it still reads clearly.'],
  },
  {
    id: 'blast.text-fit', room: 'blast', title: 'My words do not fit', keywords: ['cut off', 'overflow', 'text', 'fit', 'clipped', 'headline'],
    summary: 'Give the words more room before making them tiny.', when: c => c.situation?.activeTool === 'text-edit',
    steps: ['Finish word editing with Done, then select the text box.', 'Drag its resize handle, or increase Width and Height in Edit layer. Adjust Size or Line height if needed.', 'Open Ready Check to look for remaining problems before exporting.'],
  },
  {
    id: 'blast.add', room: 'blast', title: 'Add text, shapes, or a line', keywords: ['add', 'new', 'shape', 'line', 'text', 'rectangle'],
    summary: 'Each new object is its own editable layer.', when: tool('add'),
    steps: ['Open Add on the left.', 'Choose Text, Shape, Line, or a shape from Shape library.', 'Select the new object, drag it into place, and use Edit layer to change its size and color.'],
  },
  {
    id: 'blast.image', room: 'blast', title: 'Add or replace a photo', keywords: ['image', 'photo', 'picture', 'import', 'replace', 'upload'],
    summary: 'Bring a picture from your computer into the design.', when: blastSelection('IMAGE'), focus: ['blast.image'],
    steps: ['To add a new picture, use Add → Photo. To fill an existing frame, select it and choose Add photo or Replace photo.', 'Choose the picture file and wait for the media check.', 'If the picture needs adviser approval, ask the adviser to review it. Keep the frame while it waits.'],
  },
  {
    id: 'blast.image-fit', room: 'blast', title: 'My photo is cropped or has empty edges', keywords: ['crop', 'fit', 'fill', 'photo', 'edges'],
    summary: 'Choose whether the full picture or the full frame matters more.', when: blastSelection('IMAGE'),
    steps: ['Select the picture.', 'Choose Fit photo to show the entire image, or Fill frame to cover the frame even if some edges are cropped.', 'Adjust Width and Height if the frame shape is wrong. Check the preview before exporting.'],
  },
  {
    id: 'blast.move', room: 'blast', title: 'Move or resize an object', keywords: ['move', 'resize', 'drag', 'position', 'width', 'height'],
    summary: 'Move the box itself after finishing any word editing.',
    steps: ['Select the object once. If you are typing, choose Done first.', 'Drag the object to move it. Drag the resize handle for size, or enter X, Y, Width, and Height in Edit layer.', 'Turn Snap off if it keeps jumping to a position you do not want. Use Zoom to see more of the page.'],
  },
  {
    id: 'blast.locked', room: 'blast', title: 'Something will not move or change', keywords: ['locked', 'stuck', 'move', 'template', 'guided'],
    summary: 'Check the layer lock and the design mode.', when: tool('locked'), priority: 65,
    steps: ['Open Layers and select the object by name.', 'If it is locked, use Unlock. If Guided mode protects part of the template, switch Guided to Freeform to open more layout control.', 'Try selecting and moving it again. Use Undo if a change moves more than you meant.'],
  },
  {
    id: 'blast.layers', room: 'blast', title: 'Put an object in front or find a hidden layer', keywords: ['layer', 'front', 'back', 'behind', 'hidden', 'missing'],
    summary: 'Layers lets you reach objects that overlap.', when: tool('layers'),
    steps: ['Open Layers. The top of the list is the front of the page.', 'Click the layer name. Use Show if it is hidden.', 'In Edit layer, use Bring forward or Send backward until it sits where you want.'],
  },
  {
    id: 'blast.group', room: 'blast', title: 'Move several objects together', keywords: ['group', 'ungroup', 'multiple', 'select', 'together'],
    summary: 'Select several layers before grouping or aligning them.', when: c => (c.situation?.selectionCount ?? 0) > 1, priority: 10,
    steps: ['Hold Shift and click the objects, or Shift-click their names in Layers.', 'Choose Group in Edit selection to move them together. Choose Ungroup to separate them again.', 'For even spacing, select at least three layers and choose Space across or Space down.'],
  },
  {
    id: 'blast.pages', room: 'blast', title: 'Add another page or make a copy', keywords: ['page', 'pages', 'duplicate', 'copy', 'newsletter'],
    summary: 'Pages keeps a multi-page design in one project.', when: tool('pages'),
    steps: ['Open Pages on the left.', 'Choose + New for a blank page, or select a page and choose Duplicate page to reuse its layout.', 'Click a page in the list to edit it. PDF can carry all the pages; PNG exports the current page.'],
  },
  {
    id: 'blast.undo', room: 'blast', title: 'Undo a design mistake', keywords: ['undo', 'redo', 'mistake', 'deleted', 'restore'],
    summary: 'Back up one editing step at a time.',
    steps: ['Use Undo in the top toolbar. While typing, finish the word edit with Done first if needed.', 'Use Redo if you went back too far.', 'Check the result before making more edits. Undo is not a backup that survives every reopen; save a portable project copy for keeping work.'],
  },
  {
    id: 'blast.story-words', room: 'blast', title: 'Use writing from a story', keywords: ['story text', 'article', 'quote', 'byline', 'headline'],
    summary: 'Bring existing story words into a design without retyping.',
    steps: ['Choose the right story in the Story menu at the top.', 'Open Add → Story text, or Story words in the Guided strip.', 'Choose the available story text you want to add, then select its new layer to fit it to the page.'],
  },
  {
    id: 'blast.export', room: 'blast', title: 'Save a picture or printable copy', keywords: ['export', 'download', 'print', 'pdf', 'png', 'svg'],
    summary: 'Choose the output that matches where the design is going.', when: c => c.situation?.hasExport === true,
    steps: ['Run Ready Check and fix problems it points out.', 'Choose PNG for a screen image, SVG for a scalable graphic, or PDF for the pages. Follow the export prompt.', 'For an editable USB handoff, also open Files and save the story project. A PNG or PDF is a finished copy, not the editable design.'],
  },
  {
    id: 'blast.wait', room: 'blast', title: 'A design import or export is taking a while', keywords: ['waiting', 'loading', 'slow', 'stuck', 'export', 'import'],
    summary: 'Let the current file job finish before starting another.', when: c => c.situation?.busy === true, priority: 100,
    steps: ['Check the loading message above the design and keep this tab open.', 'Avoid repeatedly clicking import or export while the same job is running.', 'If an error appears, read its reason. Try a smaller image or fewer pages when size is the problem; ask the adviser if the same file keeps failing.'],
  },
  {
    id: 'desk.start', room: 'desk', title: 'Open the right story and start writing', keywords: ['start', 'write', 'draft', 'story', 'empty'],
    summary: 'Desk writes into a story, so pick that story first.', when: c => c.situation?.projectSelected === false || c.situation?.hasContent === false,
    steps: ['If Desk has no story, choose Pitch a story to create one in Slate.', 'Use the Story menu at the top of Desk to check which draft you are editing.', 'Click in the paper and type. The brief tab shows the story direction when you need a reminder.'],
  },
  {
    id: 'desk.format', room: 'desk', title: 'Make headings, lists, and bold words', keywords: ['format', 'bold', 'italic', 'heading', 'list', 'quote'],
    summary: 'Select words or place the cursor in a paragraph before using the writing tools.',
    steps: ['Highlight the words for Bold or Italic.', 'For a heading, quote, or list, click inside the paragraph and use H2, Quote, or a list button.', 'Use Undo above the paper if the result is not what you intended.'],
  },
  {
    id: 'desk.route', room: 'desk', title: 'Give my draft a useful structure', keywords: ['structure', 'route', 'outline', 'template', 'organize'],
    summary: 'A writing route gives a new draft a starting order.', focus: ['desk.structure'],
    steps: ['Use the route choices beside the paper to pick a structure for your kind of story.', 'If you already wrote a draft, read the replacement confirmation carefully. Cancel to keep your current words.', 'Fill the sections with your reporting, then use check to see what is still missing.'],
  },
  {
    id: 'desk.regular-writing', room: 'desk', title: 'Drop the template and write freely', keywords: ['template', 'shape', 'stuck', 'locked', 'remove', 'regular writing', 'freehand', 'prompts'],
    summary: 'Regular writing removes the template prompts and keeps everything you wrote.',
    steps: ['If the side panels are hidden, choose Exit focus or Back to writing tools.', 'Under Choose the shape, click Regular writing. Your words, formatting, quotes, and pictures stay in place.', 'Keep writing anywhere in the paper. Use Undo right away if you want the prompts back. Your choice saves with the draft.'],
  },
  {
    id: 'desk.notes', room: 'desk', title: 'Use my notes and exact quotes', keywords: ['notes', 'source', 'reporting', 'quote', 'interview'],
    summary: 'Project notes from Slate are available beside the draft.', when: tool('REPORTING'), focus: ['desk.sources'],
    steps: ['Open reporting on the right. If the panels are hidden, choose Exit focus or Back to writing tools.', 'Read a source’s notes and use Insert linked quote for its exact quotation.', 'If the source is missing, choose Add project notes or open the full story plan in Slate. Save those notes before returning.'],
  },
  {
    id: 'desk.picture', room: 'desk', title: 'Put a picture into my writing', keywords: ['picture', 'image', 'photo', 'insert', 'media'],
    summary: 'Place the cursor where the approved picture should go.',
    steps: ['Click in your draft where the picture belongs.', 'Choose Picture above the paper and pick from the available media.', 'For a new picture, use Choose one under Add your own photo in the picture picker and choose your file. If it needs an adviser check, wait for approval before using it.'],
  },
  {
    id: 'desk.compare', room: 'desk', title: 'Combine everyone’s writing', keywords: ['compare', 'contributors', 'versions', 'combine', 'merge', 'group'],
    summary: 'Build the main draft while keeping each contributor’s original.', when: tool('compare'), priority: 12,
    steps: ['Open Collect everyone’s work → Compare writing. Choose pieces to compare; Open all pieces shows them together.', 'Select a useful passage in a piece and choose Add selected words, or choose Add whole writing.', 'Read and edit the combined draft to remove repeats. Open editable copy makes separate work; it does not replace the contributor’s original.'],
  },
  {
    id: 'desk.readonly', room: 'desk', title: 'Why can’t I type in this draft?', keywords: ['cannot type', 'locked', 'disabled', 'read only', 'owner', 'published'],
    summary: 'Check whether this is your piece, a group collection, or a published story.', when: c => c.situation?.projectSelected === true && c.situation.canEdit === false, priority: 25,
    steps: ['Check the story name and whether it is already published. Published editions stay frozen; start a follow-up from Reruns.', 'A joined group collection is for gathering work. Make your own piece to write your contribution.', 'Only the group draft’s owner or an adviser can edit that draft. Ask the lead to combine your piece instead of changing their work.'],
  },
  {
    id: 'desk.save', room: 'desk', title: 'Make sure my writing is saved', keywords: ['save', 'failed', 'unsaved', 'usb', 'backup'],
    summary: 'The save message below the paper tells you whether this browser has your latest words.', when: c => c.situation?.error === true, priority: 30,
    steps: ['Look below the paper for Saved, Saving, Unsaved, or Save failed.', 'If saving failed, keep the draft open and choose Retry save. Copy important unsaved words somewhere safe before reloading.', 'Use Files to save the editable story to your drive. Save .txt copy is useful for the words alone, but does not include all story media and editing data.'],
  },
  {
    id: 'desk.handoff', room: 'desk', title: 'Send the writing to the next step', keywords: ['handoff', 'finished', 'review', 'send', 'next'],
    summary: 'The handoff button follows the story’s production route.',
    steps: ['Read the draft aloud once and open review for any revision notes.', 'Use the main button in Your handoff below the writing workspace. Its label names the next job for this story.', 'For a plain text file, choose Save .txt copy. Keep the editable project too when handing work to another computer.'],
  },
  {
    id: 'slate.create', room: 'slate', title: 'Start a story from an idea', keywords: ['new', 'start', 'pitch', 'idea', 'create'],
    summary: 'Choose what you will make, then give the crew a clear direction.', when: c => c.situation?.projectSelected === false, priority: 8,
    steps: ['Choose + New story. Pick the finish line, such as Article, Video story, or Podcast episode.', 'Pick a reporting job and enter a working headline.', 'Fill the three direction answers, then choose Open story plan. The headline can improve later.'],
  },
  {
    id: 'slate.direction', room: 'slate', title: 'The story-plan button is not ready', keywords: ['disabled', 'direction', 'focus', 'audience', 'finish line', 'angle'],
    summary: 'The three direction fields help every teammate work toward the same result.', when: tool('create'), priority: 12,
    steps: ['Give the story a working headline.', 'Answer What’s the focus? with one thing to find out; answer Who is it for? with the people who need it.', 'Answer What can we use? with a real interview, observation, document, or file. Check that all three answers are filled before opening the plan.'],
  },
  {
    id: 'slate.find', room: 'slate', title: 'Find a story that disappeared from the board', keywords: ['missing', 'search', 'filter', 'board', 'find'],
    summary: 'Filters can hide a story without deleting it.', when: tool('board'),
    steps: ['Choose Everything instead of My stories or Needs a lead.', 'Clear the search and check the stage and format filters. If nothing matches, choose Clear filters.', 'Choose Refresh, then open the story by its title. Work from another computer needs to be opened from its saved file or story folder.'],
  },
  {
    id: 'slate.lead', room: 'slate', title: 'Take the lead and split up the jobs', keywords: ['lead', 'claim', 'assign', 'crew', 'jobs', 'team'],
    summary: 'The story lead keeps the pieces moving; Crew holds the individual jobs.', when: tool('PLAN'),
    steps: ['Open the story’s The brief tab. If it needs a lead, choose I will lead.', 'Open Production, then Find jobs for this story.', 'Use Crew to take or assign the available responsibilities. Leave a specific handoff when your part is ready.'], action: { label: 'Open Crew', room: 'crew' },
  },
  {
    id: 'slate.sources', room: 'slate', title: 'Keep reporting notes with the story', keywords: ['source', 'question', 'notes', 'interview', 'evidence'],
    summary: 'Separate exact quotes from your own summary so the writer can trust both.', when: tool('REPORT'),
    steps: ['Open Project notes. Add questions with Add and people or documents with + Source.', 'Fill the source’s name, why they know, and a reference or recording timestamp. Put summaries in Facts & reporting notes and exact words in Exact quotes.', 'Choose Save plan. These notes can then be read from Desk’s reporting tab.'],
  },
  {
    id: 'slate.save', room: 'slate', title: 'Save my plan and know where to go next', keywords: ['save', 'plan', 'next', 'production', 'failed'],
    summary: 'Save plan keeps changes to the brief, sources, and checklist.', when: c => c.situation?.error === true, priority: 20,
    steps: ['Choose Save plan after editing the headline, direction, questions, or production notes.', 'Wait for Plan saved. If an error appears, keep the plan open and retry; copy unsaved notes before reloading.', 'Use the Production route at the bottom to open the next making room for this story.'],
  },
  {
    id: 'graphics.words', room: 'stinger', title: 'Change the words on a graphic', keywords: ['graphic', 'title', 'words', 'text', 'lower third'],
    summary: 'Select a screen and its text layer to edit the graphic.', when: c => graphics(c) && c.situation?.selectedKind === 'TEXT',
    steps: ['In the graphics editor, choose a screen at the top, then click its text layer.', 'Use the Design tab’s Text field to write custom words.', 'For a headline or byline that follows a story, use Data → Text source and choose the story in Fill words from. Preview before using it.'],
  },
  {
    id: 'graphics.timing', room: 'stinger', title: 'Make a graphic move at the right moment', keywords: ['graphic', 'motion', 'keyframe', 'entrance', 'exit', 'timing'],
    summary: 'Start with entrance and exit presets; add keyframes for custom movement.', when: tool('graphics:MOTION'),
    steps: ['Select a layer in the graphic, then open Motion.', 'Set Entrance, Exit, Starts, and Ends. Use Preview this graphic to check the result.', 'For your own movement, move the playhead, set the layer’s position or size, and choose Keyframe at playhead. Repeat at a later time and preview.'],
  },
  {
    id: 'graphics.sound', room: 'stinger', title: 'Why is my exported graphic silent?', keywords: ['graphic', 'sound', 'silent', 'webm', 'audio'],
    summary: 'Export this graphic makes a silent WebM. The editable graphic can carry its sound cue into video.', when: graphics,
    steps: ['Deselect the layer to reach the screen controls and check Sound cue.', 'Use the graphic in the video editor to place its cue on the Sounds track.', 'Preview and export the assembled video there to include sound. Keep Download editable kit if someone needs to change the graphic later.'],
  },
];
