# Group stories and USB collection

September 26, 2026 · Proposed design for review; not implemented.

## Agreed need

Late-elementary students work in groups using five USB drives. Students use
Chromebooks; staff use Windows and Macs. A lead or teacher adviser collects work;
collector is a duty, not a new role. Students must be able to contribute separate
pieces and take turns editing the group's main draft. Four perspectives on one
article must be available together while the collector writes the final version.
Images, video and audio must be similarly available to use in the editors.

Most work starts inside Orbit. Outside files enter through Orbit's existing
imports. Once added to a story, their actual bytes must travel with its USB save;
there is no requirement for external-app integrations or additional device apps.
Children should not manage technical filenames, duplicate detection or versions.
Joining uses a story code with no server lookup. USB still transports contributions,
media, shared drafts and story details; there is no live synchronization.

## Recommendation and alternatives

Use one recognizable group folder on USB, containing independently saved pieces
and shared-draft revisions. Orbit presents its contents as story cards and a
collection shelf. The folder is transport; editing continues in the local app.

Renaming the current whole-story exports would be smaller, but would leave
competing drafts and consolidation unresolved. A single repeatedly overwritten
group archive would be easier to describe, but stale copies could replace newer
work and every contribution would require rewriting the entire collection.
Independent, self-contained packages keep collection additive and recoverable.

## Student workflow

1. A lead/adviser creates a story with a title and optional cover/color. Orbit
   creates its permanent internal identity once; title and cover are its visible
   labels. The identity survives filenames, later title changes and drive copies.
2. Orbit gives the lead/adviser a story code to put on the board. Children choose
   **Join a story**, enter that code, and use their own badges. No USB or network
   lookup is needed to establish the shared identity. The brief can be explained
   in class; its saved copy travels with the USB.
3. **Make my piece** starts named work for the story in Desk, Booth, Blast,
   Chatterbox, Stinger or Foley. **Work on the group draft** opens a local editable
   copy of its current shared version. Existing work can be attached to the story.
4. **Save to group USB** saves the student's changed pieces and any main-draft
   revision. The preview lists exactly what will travel, including source media.
5. **Collect group work** reads the selected group folder or a batch of packages.
   Orbit shows, for example, “4 new pieces · 1 updated piece · 2 already here.”
6. The lead/adviser can review and use the pieces, continue the shared draft, and
   save the collected story back to USB. Originals remain available.

The group folder may contain multiple stories. Selecting a different drive does
not switch browser identity or erase local work. A child who has not joined yet
can still make a piece and choose its destination story at handoff; assigning it
does not rename or merge a different story silently.

## Starting together: join by story code

The New story entry offers **Start a story** and **Join a story**. A lead or
adviser starts the group story once and supplies its title/brief. Orbit generates
and prominently displays its permanent story code, with a copy button and large
classroom-readable view. The lead can write it on the board. Joining needs no
USB, account service or server lookup. Use “story code” in the UI, not “sync code”,
because entering it does not transmit work or retrieve anything from another device.

The proposed code has 12 case-insensitive symbols in three groups of four: ten
random symbols from an unambiguous 32-character alphabet plus two checksum
symbols. Generate with browser cryptographic randomness. Normalize presentation
spacing/hyphens and case, then verify the checksum before creating local records.
Invalid entries ask the child to check the code; do not silently correct an
ambiguous code or create a different group. Shared, versioned code logic derives
the same namespaced group-story identity offline on every computer. Local database
IDs remain separate. Preserve an existing story's old portable identity when
adding a group identity, so old saves still refer to that story.

A code is a grouping label, not a password or proof that a badge is the lead.
Never derive one from the story title, badge name, device clock or a short counter.
Check generated codes against local stories and retry duplicates. Random codes
make accidental collision unlikely but do not establish global uniqueness without
a registry. If collection encounters conflicting independently created story roots
under one code, keep them separate and require explicit association/reassignment;
never overwrite or auto-combine their drafts. Different valid codes are distinct
stories, even if their titles match.

Each child enters the code once. Orbit creates or reopens its local story workspace
and shows **Make my piece**. The code does not contain the title, cover, lead or
brief: Orbit must not pretend it fetched these. Let the child add an optional
local story label from the classroom instructions, otherwise show “Group story”
with the code. The saved lead-created story card on USB supplies the full details
later; reconcile those details without replacing any contribution or local draft.
A valid checksum cannot prove the child chose the intended group: keep the code
visible on the join confirmation and contribution destination for comparison.

**Work on the group draft** becomes available when a main-draft snapshot has
actually been brought in from USB. Before then, show “Bring in the group draft
from USB to work on it” alongside **Make my piece**. The lead/adviser creates the
first main version from the assembly view. Joining by code alone neither creates
a competing main draft nor claims to have the newest version.

Every piece made within the joined story inherits its group-story identity.
Children keep working while the drive is elsewhere. At **Save to group USB**,
Orbit recognizes the correct story automatically by identity. No title matching
or repeated code entry. Re-entering the code resumes local work rather than
creating another copy or resetting the brief. Renaming a story does not change
its code. A new story gets a new code; duplicating a story as a separate project
must explicitly create a new identity and code.

Late joining is supported: **Add existing work** lets a child pick an earlier
piece after entering the code. If it belongs to another story, create a contribution
copy for the chosen destination and preserve the original. A lead/adviser can
likewise explicitly assign independent received pieces to the intended story.
A wrong-code contribution can be reassigned by copying into the correct story;
retain its source provenance. Similar titles never trigger automatic matching.
If the selected drive lacks this story, offer **Add this story to the drive**,
never redirect the piece into another story already on the drive.

A small story-card package carrying the code/identity, title, cover, brief and
public lead identity is saved with group work. It remains an optional alternative
for joining through USB. It contains no PIN, workspace identity or authority to
impersonate the lead. Independently saved contribution packages carry enough
identity to collect correctly even without the story card or a directory index.

## Multiple stories on one USB

Each drive is a shelf, not a single-story slot. Orbit lists all story cards on it.
An illustrative disk layout is:

```text
Orbit group work/
  Lunchroom story/
    Story card - Lunchroom story.chatter
    Contributions/
    Group drafts/
  Playground changes/
    Story card - Playground changes.chatter
    Contributions/
    Group drafts/
```

Actual folder names are collision-safe visible labels. If two different stories
are called “Lunchroom story”, allocate separate folders with a readable suffix;
Orbit distinguishes their cards by lead/cover and an extra short identifier if
needed. The package's embedded story ID is authoritative, not its directory path.
Renamed/moved folders and the same story copied onto two drives remain recognizable.

Saving story A must not change story B's files, indexes or records. Saving a new
revision must not truncate a previously completed file. Allocate a new, uniquely
named save batch, verify its contents, and expose it as complete only after the
receipt succeeds. Reused destination names must be checked before opening a writer;
unknown or different bytes get a new destination. Do not offer children a generic
“Replace existing file?” decision as part of the normal save flow. An unchanged
verified revision can report “Already saved” without writing it again.

The folder picker establishes the drive root once; embedded identities determine
the correct story below it. Fallback download bundles carry the same identities
and collision-safe names. If the user moves a package into the wrong visible
folder, collection still routes it by identity and reports where it belongs;
it never silently rewrites the package to match the folder label. These rules
prevent overwrites caused by normal Orbit saves; OS-level manual deletion or
replacement remains outside the app's control.

## Collection and assembly inside Orbit

Use the existing story/Media Bin/Desk context, not another app or role selector.
The story exposes **Group work**, **Main draft**, and **Save / Collect** actions.
Group work shows title, contributor, kind, preview, revision and receipt state.
Children see “My piece”; a lead/adviser sees the same pieces with assembly tools.
These are classroom workflow controls, not a new secure account system.

**Writing:** select several contributions and open them together. A comparison
view can show all four source drafts in readable, independently scrollable cards.
An assembly view retains all selected sources beside the editable main draft,
with adjustable space and a focused source when the screen is narrow. No forced
opening/closing of individual files. Selected passages can be inserted at the
cursor with Undo. Copy text and structure; never modify the source by inserting.
Record contributor provenance for inserted material, without claiming that later
rewriting preserves exact authorship. Credits remain editable by humans.

**Media:** preview/listen/watch contributions before choosing **Use in…**. Images,
audio and video are available to compatible editors through the existing asset
and review paths. A work-in-progress Orbit project travels with editable settings
and sources. It can be opened as a separate contributed project. First release
does not promise automatic merging of two arbitrary timelines or page layouts;
their source media and available rendered outputs can be used in the main work.
Export a finished clip from the contributed project when a flattened clip is needed.

**Main draft:** students may edit sequentially. Returning changes creates a
revision, never a blind overwrite. If based on the current revision, show the
update and allow adoption. If another revision has already been adopted, show
both as “Two versions to compare.” The lead/adviser explicitly chooses or combines
them. Keep the previous main revision and allow restoring it. Do not auto-merge
prose, video, audio or graphics by timestamps.

## Names children can recognize

Use editable descriptive titles and public badge names, not legal names. Suggest
“Maya's perspective” or “Lunchroom interview” from the work's context; never invent
a description based on unavailable media analysis. Show the student the name.

Example USB filenames:

- `Lunchroom story - Maya - My perspective - v2.chatter`
- `Lunchroom story - Jordan - Interview - v1.chatter`
- `Lunchroom story - Group draft - v3.chatter`

Names are labels only. Stable internal IDs identify the group story, contribution,
author and revision. Renaming a file must not create another contribution. Sanitize
cross-platform forbidden characters, reserved names and overlong paths. Resolve
filename collisions without replacing bytes: readable numbering plus a short
suffix when necessary. Two children sharing a display name remain distinct.

## What every USB save contains

Each contributed package contains its editable document/project, attribution,
revision metadata and the full dependency set of required source and output bytes.
It can be collected independently; no links into the sender's Downloads folder.

Add explicit story membership for imported/created assets. An unused photo added
to this story must travel too; inclusion cannot depend on already being placed in
a timeline or credited. Import in an active story defaults to that story and shows
the destination. Unassigned imports remain visible in Media Bin; saving surfaces
them with **Add to this story**, **Save separately**, or **Leave on this computer**.
Never silently classify all browser media as belonging to the selected group.

Saving a complete story includes its received contributions, current and retained
main revisions, linked projects, explicitly attached unused media and credits.
Finish session must retain these records as well. A contribution save contains
only the selected piece and its dependencies, not everyone else's private drafts.

Show packing, writing and checking progress with file counts/size where measurable.
Missing source bytes block a complete-save claim and identify the affected piece.
Keep the local originals and previous good USB packages on cancellation/failure.

## Persistence and receiving rules

- Stable story and contribution identities; immutable revision identity with
  parent revision IDs, content hash, public author identity and display timestamp.
  Device clocks and filenames do not decide which revision wins.
- Identical identity/hash is already received. A descendant is an available update.
  Divergent revisions remain separate choices. Same revision identity with different
  contents is rejected as inconsistent, never silently accepted.
- A received piece is preserved as a source. Editing it creates a new revision;
  using it in main work creates explicit provenance links, not shared mutable data.
- File-byte hashes allow local storage deduplication. Do not deduplicate distinct
  children's contributions just because their text or media bytes match.
- Validate archive structure, paths, schema, declared sizes, dependency closure
  and hashes before adoption. Bound expansion and file counts. Stage imports so a
  corrupt/interrupted package cannot partially replace existing work. Report good
  and failed packages separately in a batch; retry is idempotent.
- Write each save as a new package, verify readback where supported, then write its
  completion receipt. Never rely on overwriting a shared index safely. Reconstruct
  the collection from complete packages if the optional index is stale or missing.
- Imported media keeps existing Gate/review safeguards. Local creation or adviser
  approval on another computer does not automatically grant local approval.
  Preserve license/source information and export only existing public identity data.

## Cross-platform transport and old work

Detect folder-read/write capabilities at runtime. Where available, a selected USB
folder supports one-action collect and verified save. Otherwise offer batch file
selection and a clearly named download bundle, with an honest “Download ready”
message and a short instruction to put it on the drive. Never claim that a browser
download is verified on USB. Use the same story/contribution model in both paths.
No installation, cloud connector or changed staff browser is required by the design.

Keep existing `.chatter` versions 1–7 readable. Legacy imports offer **Bring in as
a contribution** or **Compare with the group draft** when related work exists;
the collection flow must not invoke today's destructive update path unchecked.
Unrelated legacy work opens separately. New collaboration records require a
versioned format extension and explicit unsupported-version handling; exporting
must never silently discard contributions to satisfy an older reader.
Frozen September device kits remain unchanged and are not promised support for
the new format. Current website updates must preserve existing local projects.

## Engineering boundaries and source evidence

Current `portable-project.ts` packs referenced source bytes, names files from the
story slug, and updates an existing story body by portable identity. Several
project imports match by title. Those behaviors cannot decide contribution
identity or conflict resolution. `finish-session.ts` already verifies writes and
preserves prior save attempts; retain those guarantees.

Implement a shared contribution/revision model and persistence adapters; a
dependency collector and validated package codec; a collection planner that makes
no writes; an explicit adoption operation; transport adapters; and UI consumers.
Reuse existing editor/checkpoint/media mechanisms. Add explicit asset membership
and collection views rather than rewriting all editors or introducing a new DAW.

## Acceptance gates

1. Four independent student workspaces join one story, write different perspectives,
   save them, and a fifth collects all four with correct names and no overwritten text.
2. All four can be opened together and passages assembled into an editable main
   article, with Undo, retained sources and saved/reopened provenance.
3. Sequential shared-draft changes can be adopted; two edits from the same base
   produce a visible comparison, preserving both and the previous main draft.
4. Recollecting, renaming or changing the order of packages creates no duplicates.
   Same-name children, stories and media projects do not collapse into each other.
5. An externally imported image, video and audio file, including an unused attached
   asset, survive save/collect after removing access to the original source paths.
6. Editable media contributions reopen with their sources; available media/outputs
   can be inserted into Stinger, Chatterbox and Blast as appropriate, retaining review.
7. Missing media, corrupt packages, failed writes, permission loss, cancellation,
   interrupted imports and a full drive preserve prior work and allow safe retry.
8. Whole-story save, Finish session and old-format import preserve the new records
   or reject an unsupported operation clearly; normal existing workflows still pass.
9. Rehearse the actual USB round trip on a student Chromebook, staff Windows and
   staff Mac, including whichever folder/download path each browser supports.
   Automated browser tests alone do not certify this physical classroom workflow.
10. Starting once and entering the code on four independent computers with network
    access disabled produces one group identity with four distinct contributors.
    Rejoining preserves local edits. Title changes do not change the code; same-title
    new stories get different codes. Invalid/checksum-failing entries make no writes.
    No title/brief or main draft is claimed available before it is received.
    A wrong valid code remains visible and can be corrected without losing the piece.
11. Save multiple stories, including two with the same title, onto one drive.
    Update each repeatedly and verify all other story bytes remain unchanged.
    Renames, copied drives, missing starters and wrong-folder placement must not
    overwrite or silently associate another story's contributions.

## Review requested

Confirm the proposed student workflow and assembly behavior before implementation
planning. This document is a proposal; no product code, database or live site has
been changed for this redesign.
