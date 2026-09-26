# Group Story Implementation Plan

> Execution: implement in the current authorized workspace; preserve unrelated WIP. Native integration with bounded independent code/transport tasks under dispatching-parallel-agents, then independent review. Do not create a worktree or commit the outer workspace. Publish only reviewed intended files through the established checkout after verification.

**Goal:** Offline story codes, preserved contributions, comparison/assembly, and additive USB handoff across current Orbit editors.
**Architecture:** Normal Story records remain the editable units. Optional group context identifies each work item; immutable groupRevision records point to self-contained portable snapshots. Group collection never imports over a working story. Opening received work makes an isolated editable copy; adopting text explicitly checkpoints the previous main version.
**Tech Stack:** Existing TypeScript, React, IndexedDB/OPFS, JSZip, Tiptap and Vitest.
**Spec:** Docs/plans/group-story-collection-2026-09-26.md

## Global constraints
- No server, new account role, destructive reset, title-based identity or timestamp-based conflict winner.
- Public badge names only; Gate review survives transport; keep `.chatter` versions 1–7 readable.
- Every piece is independently usable and saves required source bytes, including attached unused media.
- USB writes append unique packages and verify bytes; download fallback never claims verified USB storage.
- Physical Chromebook/Windows/Mac acceptance is separate from automated evidence.

## Review focus
- Same-title stories and same-name contributors remain distinct (tasks 1, 3).
- Codes with typos and repeat joins cannot create accidental records (tasks 1, 3).
- Corrupt archives and interrupted writes cannot modify prior work (task 2).
- Group collection survives Finish session/portable round trips with unused media (task 3).
- Four contributions and divergent main revisions stay available after adoption and Undo (task 4).

## Interfaces
`Story.group?: { code: string; rootId?: string; kind: 'main'|'piece'|'joined'; contributionId: string; authorId: string; authorName: string; baseRevisionId?: string; lastRevisionId?: string; usedRevisionIds?: string[] }`
`Story.attachedAssetIds?: string[]` explicitly includes unused source media.
`GroupRevision extends Base { groupCode: string; rootId?: string; contributionId: string; parentRevisionId?: string; kind: 'main'|'piece'; authorId: string; authorName: string; title: string; storyTitle: string; snapshotHash: string; contentHash: string; body: ProseNode }`
`store.groupRevisions` is immutable, clone-safe, validated and supports caller IDs; DB version increments to 13. Do not export authority or trust foreign author IDs as local roles.

### Task 1: Code and persistence contract
Files: shared `group-story.ts`, `group-story.test.ts`, types/store/memory/index, browser store-idb and contract tests.
- [ ] RED: invalid code fails without records; normalization retains identity; checksums reject single-symbol edits; immutable records reject update/duplicate IDs; Story.group/attachedAssetIds survive create/update/reopen.
- [ ] Implement `createStoryCode(): string`, `normalizeStoryCode(input: string): string` (throws), `groupIdentity(code: string): string`, `validateGroupRevision(row: GroupRevision): void`.
- [ ] GREEN: focused code/store tests and typecheck.
Example contract: `expect(groupIdentity(code.toLowerCase().replaceAll('-', ' '))).toBe(groupIdentity(code));` and `await expect(store.groupRevisions.update(id,{title:'changed'})).rejects.toThrow()`.

### Task 2: Independent portable collection codec and transport
Files: web `group/group-archive.ts`, `.test.ts`, `group-drive.ts`, `.test.ts`.
Consumes no Store; packages opaque complete `.chatter` snapshots with verified SHA256. Manifest record metadata is validated by task 3 before persistence.
Produces `encodeGroupArchive(entries: GroupArchiveEntry[]): Promise<Blob>`, `decodeGroupArchive(blob: Blob): Promise<GroupArchiveEntry[]>` with `{record: GroupRevision,snapshot: Uint8Array}` and `saveGroupArchive(directory,blob,storyTitle): Promise<string>`.
- [ ] RED: byte mismatch, unsafe paths, duplicate revision IDs with differing hashes, oversized/expanded archives, missing media payloads, same-title saves and write interruption.
- [ ] Implement strict bounded manifest format `orbit-group`, version 1; hash every snapshot; validate every entry before returning any. No code from the archive runs. New batch directory with verified archive and receipt last; caller handles download fallback.
- [ ] GREEN: codec/transport tests. `expect(await decodeGroupArchive(await encodeGroupArchive([entry]))).toEqual([entry]);` then mutate encoded hash/bytes and expect reject.

### Task 3: Group operations and full portable preservation
Files: web `group/group-work.ts`, `.test.ts`, portable-project, finish-session, import dispatch; explicit asset attachment integration.
Consumes tasks 1–2. Produces start/join/make-piece/capture/collect/open-copy/export operations using Store/Gate. Collection only creates immutable records after preflight, never updates story.body.
- [ ] RED: four MemoryStores join one code, independently capture writing, collect in fifth, repeat collect creates no duplicates; same-name authors preserved; two same-title groups isolated.
- [ ] Implement snapshots from existing editors via normal Story; deterministic content hash excludes export timestamp; full assets/dependencies included. Persist blob before revision; conflicting existing identity rejects. No partial package adoption. Failed batch entries reported individually.
- [ ] RED: Finish and .chatter export/import retain immutable revisions and explicit unused attachments; snapshot capture avoids recursively embedding previous snapshots.
- [ ] Implement portable format extension, existing-format preservation, safe isolated opening and explicit main adoption with prior revision preserved; never run unreviewed new-format content through legacy overwrite path.
- [ ] GREEN: group/portable/Gate/finish tests. Source bytes remain after original path is removed.

### Task 4: Student workflow and assembly
Files: web `group/GroupWork.tsx`, `GroupWork.css`, `GroupJoin.tsx`, `GroupCompare.tsx`, Desk/Slate/ProjectDrive/StoryDriveOpen integration and regression tests.
- [ ] RED: SSR/DOM checks for Join, code error, independent pieces, empty group draft and collection summary.
- [ ] Implement code join and large code display; new group/piece contextual actions; story selection and file previews; batch/folder collect with duplicate summary; verified saves and download fallback.
- [ ] Implement all-selected source comparison beside Tiptap main draft, selected passage insertion with Undo and provenance, deliberate main adoption without deleting revisions. Media projects open editable isolated copies; source/media outputs selectable in existing editors.
- [ ] Verify creation/join/piece/edit/save/collect/compare/adopt/Undo/reopen in independent browser contexts, including imported unused image/audio/video bytes.

### Task 5: Integration, independent review and publication
- [ ] Run typecheck, app tests, website/reader/desktop tests, production build; inspect exported packages and actual workflows.
- [ ] Independent reviewer checks agreed spec and intended diff, particularly overwrite, version divergence, byte closure and trust boundaries. Fix substantive findings and rerun affected checks.
- [ ] Copy only intended files into publishing checkout, commit and push approved work; verify deployment and exact public release. Update handoff/release evidence, including physical-device checks still pending.

## Progress
- Design approved by user: “Make it happen Cap'n”. Execution and routine choices authorized; no repeated approval request for the same implementation.
- Plan interface review: tasks 1/3/4 share explicit Story.group and immutable GroupRevision. Task 2 depends only on those record types and existing verified file I/O, never on mutable store/editor state.

## Implementation verification — September 26

Implemented the approved flow with offline codes, immutable snapshots, additive USB
archives, safe isolated project copies, source/output media, comparison and explicit
main-writing adoption. Existing-work and wrong-code corrections preserve originals.
Independent review caught and resolved joined-wrapper reopening, same-title podcast
show/transcript and runtime-ID collisions, sound dependency validation, foreign
image URL adoption, and legacy file size compatibility.

Chromium rehearsal used five isolated stores: one lead and four students, including
one actual student badge during allowed hours. Joined and wrote through the UI,
collected four files, verified all four views, insertion, Undo, duplicate collection,
main adoption and reload. Native folder guarantees are covered by write-failure and
collision tests; physical USB/device rehearsal remains pending. See
[the classroom workflow](../GROUP-STORY-WORKFLOW.md). Final release evidence follows.
