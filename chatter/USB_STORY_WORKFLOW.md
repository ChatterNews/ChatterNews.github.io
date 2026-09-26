# Group story update — September 26, 2026

The website now supports offline **Join a story** codes and multi-contribution USB
collections. Start in Slate → Work with a group. See the
[group workflow](../Docs/GROUP-STORY-WORKFLOW.md) for saving pieces, collecting files,
comparing writing and using source media. Existing single-story instructions follow.

# Orbit Story Drive workflow

Updated: September 21, 2026.

## Current website and portable saves

Open **https://chatternews.github.io/** directly. No cartridge or preparation is
required for online use. Files → Prepare for offline use is optional. The
[school guide](../Docs/SCHOOL-GUIDE.md) covers current startup, access and rehearsal.

One `.chatter` file carries one story and linked work. Browser autosave remains
on the current device; it does not continuously write to USB. Use Files to save
stories or Finish session, then check the chosen local/USB folder or downloaded ZIP.
Unpack session ZIPs before opening individual stories. A download-start message
alone is not destination verification. The website does not invoke an OS share
sheet; the old mobile-reader Save to Files flow below belongs to that frozen kit.

Finish captures every stored story in the active newsroom after saving editor
checkpoints and pending Chatterbox work. Meaningful unlinked episodes need **Add
story card**; Media Bin can link old Studio records. Failed saves or unfinished
capture/export block handoff. Whole-newsroom records backup separately requires
the adviser PIN and does not replace linked-media story exports.

Chatterbox portable records preserve phone cue marks, clip positions, trims and
quieter-mic settings/bypass. Imported audio needs local review on the destination.
See [phone workflow](../Docs/PHONE-PODCAST-WORKFLOW.md). A physical two-device
school rehearsal remains pending.

## Frozen kits: scope of the following device instructions

The device-specific startup sections below apply to the September 12/14 native,
USB-reader and mobile-cartridge kits. September 12 builds differ; the September 14
Monday set shares one frozen source. Neither includes later website changes.
Choose the exact package and matching reader in [Releases](../Docs/RELEASES.md).
Never use these preparation/replacement steps as the website's update routine.
The original Python/localhost kit is superseded.

## Mac and Windows startup

1. Download the appropriate native ZIP and extract the entire `Orbit` folder.
   Choose Apple Silicon or Intel for Mac; Windows is for 64-bit Windows 10/11.
   The Mac candidates require macOS 13 or newer.
2. Keep the whole folder together in a writable location, including on USB.
   Double-click **Start Orbit** from the extracted folder, not a ZIP preview.
3. Enter the live Student or Adviser desk with the correct badge. Open a saved
   `.chatter` through **Story Drive**, or create a story in Slate.

The runtime is bundled: no Python, Terminal, local server or port selection is
required. Windows is unsigned; Mac is ad-hoc signed rather than notarized. School
management or the OS can require approval or block startup. Report the message;
do not disable security settings. If the Mac launcher asks for its original
folder, choose the extracted `Orbit` folder.

```text
Orbit/
  Start Orbit             # Native app/launcher
  Chatter News/           # Explicit portable saves
  _Orbit/                 # App, runtime, models, source and notices
```

`_Orbit` is hidden by the native package/launcher. Keep it with the other files.
Startup creates its workspace reference there, so a read-only installation
location does not fit this portable layout.

## Chromebook startup

1. Extract the Chromebook ZIP onto USB and keep the whole `Orbit` folder.
2. Open **Start Orbit.html → Open Orbit**, or visit the
   reader URL supplied with that exact kit in the release catalog.
3. Choose **Open Story Drive**, select the whole `Orbit` folder, allow read/write
   access, and wait. The HTTPS reader verifies and caches the app from the folder.
4. Bookmark the reader. After preparation it can reopen from cache offline;
   keep the USB available for selection and saving.

The layout is `Start Orbit.html`, `Chatter News`, and one nested `_Orbit` folder.
No Linux environment, extension or local server is required. First preparation
needs internet for the small reader. School policy must allow the website,
selected-folder access, browser storage and microphone/camera when used. If
sign-out clears browser storage, prepare again; a bookmark alone does not
preserve the app. Keep each cartridge paired with the reader release in the
catalog.

## iPhone and iPad startup and saving

The mobile candidate is a Safari/Home Screen web app targeting iOS/iPadOS 18.4
or newer, with the latest OS preferred. It is not an App Store, TestFlight or
Android APK package. Actual iPhone/iPad operation remains a pilot check.

1. Download the `.orbit` cartridge into Files. The companion ZIP also contains
   it beside `Start Orbit.html`, `Chatter News` and `_Orbit` support material.
2. Open the matching mobile reader listed for that kit in Safari,
   choose **Share → Add to Home Screen**, and open the new Orbit icon.
3. Prepare inside that Home Screen app: select the `.orbit` file, wait for
   verification, then tap **Open Orbit**. Keep the cartridge for re-preparation.
   Safari and the installed web app can have separate storage.
4. Use **Prepare story file** for one story or **Finish session** for the desk.
   Both prepare a file; neither has saved it into Files yet.
5. Tap **Save to Files**, select or create `Chatter News` in the share sheet,
   then open Files and check the saved copy. **Download file** is the alternative
   when sharing is unavailable; check Downloads and move the file.

Closing or cancelling the share sheet is not proof of a handoff. Orbit cannot
verify the external Files destination. Mobile Finish prepares a ZIP with a
256 MiB prepared-payload ceiling; use individual stories or a computer for larger
sessions. To reopen a session, unpack its ZIP in Files, then choose an individual
`.chatter` in Story Drive. Keep recording/export in the foreground; switching
apps or locking the screen can interrupt it.

## Save story versus Finish session (shared behavior and kit destinations)

**Save story** captures the selected story and linked work. Native and
Chromebook-reader saves write into their bound `Chatter News` folder and read
back bytes before reporting success. A browser download only reports that it
started. Further edits need another save.

**Finish session** captures every stored story in the active live or demo desk,
not just the current story or student's work. It flushes editor checkpoints and
legacy Studio and Chatterbox saves, blocks known unfinished recording/export work, and refuses projects
or outputs without valid story links. Resolve the named items before trying again.

- In the Monday packages, merely visiting Chatterbox leaves its untouched starter
  unstored. Meaningful unlinked episode work must be connected with **Add story card**.
  Opening from a valid story plan creates or recovers that story’s linked episode.
- All Monday editions expose Studio scratch work and **Link session**. September 12
  native and Chromebook bundles lack that repair. Use the release catalog to
  identify the package: changing source does not update a downloaded app.
- Finish, story export and import wait for queued Chatterbox writes. A failed write
  blocks the handoff until that record saves successfully; keep the original app open.

Each native/Chromebook Finish attempt creates a new folder:

```text
Chatter News/
  Orbit-session-.../
    1-story-name.chatter
    2-another-story.chatter
    SESSION-COMPLETE.json
```

Each archive is checked; the receipt is written last with titles, filenames and
byte sizes. Earlier folders remain intact. On failure, keep Orbit open and retry;
retain partial output until a complete attempt succeeds. Mobile checks prepared
session content inside a ZIP and still needs the separate Files handoff above.

After verified native/Chromebook completion, close Orbit—or return to the reader
and close the editing tab—then eject USB in Finder or Files. Closing alone is not
Finish session. Separate Chromebook room Download/export buttons use Chrome's
normal destination. Linked outputs travel in story archives; collect standalone
WAVs, videos or images from their ordinary download location when needed.

## Workspace identity and classroom copies

For desktop/Chromebook, make **independent student drives from fresh, unopened
ZIP extractions**. First use creates `_Orbit/workspace.json`; preserve that UUID when moving or updating
the same drive. Copying a used kit copies its newsroom identity, not a new student
workspace. Do not delete the reference to reset work; follow the catalog's
update guidance. Mobile identity lives in its Safari/Home Screen context;
selecting a different cartridge there reopens the same workspace. A new mobile
ZIP does not create a separate newsroom.

Native recovery stays in the computer's local profile; Chromebook recovery is
scoped to the selected drive in browser storage. Neither travels with USB.
Continue on another computer by opening the saved `.chatter` file. The reader
permits one editing tab per workspace, but there is no cross-computer lock or
live synchronization. Use one computer to edit a drive at a time.

On the current website, adviser setup/sign-in also requires the general authorization
code and student hours apply; see [adviser access](../Docs/ADVISER-ACCESS.md).
Set up the intended live adviser badge/PIN and student badges before the class
workflow depends on them. The PIN is local classroom access, not a cloud account.
Demo is isolated from live work. Finish does not erase recovery, publish work or
back up the entire device profile.

## Portable contents and Gate rules

Current format is **6**; versions **1–6** are accepted and available fields are
migrated. A `.chatter` ZIP contains `story.chatter.json` and linked media/output
bytes, including:

- story, recipe, plan, draft, workflow status and frozen edition;
- public pen/on-air contributor names, credits, appearances, roles and Crew work;
- takes, transcripts, take edits, reviews, releases and publication receipts;
- linked Blast, Stinger, Showtime and Chatterbox projects;
- preserved legacy Studio arrangements, audio/MIDI clips, notes, instruments,
  sampler presets, mixer/effect settings and source audio (no active website DAW);
- linked Media Bin deliverables and their bytes.

A stable portable identity updates an existing recovery copy rather than creating
another story. Every imported media byte enters the Gate with `ownDevice: false`:
media from another computer cannot claim automatic “made here” approval. Missing
or quarantined sources can require recovery or adviser review. Legal names and
adviser email addresses are omitted. Local permission authority stays local;
foreign records are not blindly accepted as adviser approval.

The adviser collects explicit portable files and uses the school's ordinary
publishing accounts. There is no automatic cloud sync or public posting. Keep
the last known-good handoff, verify it reopens with media, and never unplug while
Orbit packs or writes. The [release catalog](../Docs/RELEASES.md) distinguishes
demonstrated behavior from remaining school and device checks.
