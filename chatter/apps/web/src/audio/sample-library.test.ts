import { describe, expect, it } from 'vitest';
import {
  SampleLibraryLimitError,
  sampleEntriesFromFiles,
  scanSampleDirectory,
  searchSampleEntries,
} from './sample-library.js';

interface FakeFolder { [name: string]: FakeNode }
type FakeNode = File | FakeFolder;

function folder(name: string, children: FakeFolder): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory',
    name,
    async *entries() {
      for (const [childName, child] of Object.entries(children)) {
        yield [childName, child instanceof File ? fileHandle(child) : folder(childName, child)];
      }
    },
  };
  return handle as unknown as FileSystemDirectoryHandle;
}

function fileHandle(file: File): FileSystemFileHandle {
  return { kind: 'file', name: file.name, getFile: async () => file } as unknown as FileSystemFileHandle;
}

function audio(name: string, type = 'audio/wav', bytes = 4, modified = 100): File {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: modified });
}

describe('Studio sample library', () => {
  it('recursively scans compatible audio into folder categories and stable paths', async () => {
    const result = await scanSampleDirectory(folder('School Sounds', {
      Drums: {
        Kicks: { 'Deep Kick.WAV': audio('Deep Kick.WAV') },
        'snare.mp3': audio('snare.mp3', 'audio/mpeg'),
        'notes.txt': new File(['ignore'], 'notes.txt', { type: 'text/plain' }),
      },
      Vocals: { 'Crowd Cheer.m4a': audio('Crowd Cheer.m4a', 'audio/mp4') },
      'loose.flac': audio('loose.flac', 'audio/flac'),
    }));

    expect(result.folderName).toBe('School Sounds');
    expect(result.entries.map(({ relativePath, category }) => [relativePath, category])).toEqual([
      ['Drums/Kicks/Deep Kick.WAV', 'Drums'],
      ['Drums/snare.mp3', 'Drums'],
      ['loose.flac', 'Loose sounds'],
      ['Vocals/Crowd Cheer.m4a', 'Vocals'],
    ]);
    expect(result.categories).toEqual(['Drums', 'Loose sounds', 'Vocals']);
    await expect(result.entries[0]!.getFile()).resolves.toMatchObject({ name: 'Deep Kick.WAV' });
  });

  it('searches file and folder names inside the selected category', async () => {
    const { entries } = await scanSampleDirectory(folder('Shelf', {
      Drums: { 'kick.wav': audio('kick.wav'), 'snare.wav': audio('snare.wav') },
      Ambience: { 'school-hall.wav': audio('school-hall.wav') },
    }));

    expect(searchSampleEntries(entries, 'hall', 'ALL').map((entry) => entry.name)).toEqual(['school-hall.wav']);
    expect(searchSampleEntries(entries, '', 'Drums').map((entry) => entry.name)).toEqual(['kick.wav', 'snare.wav']);
    expect(searchSampleEntries(entries, 'drums', 'ALL')).toHaveLength(2);
  });

  it('turns a folder-picker snapshot into the same relative-path model', () => {
    const kick = audio('kick.wav');
    Object.defineProperty(kick, 'webkitRelativePath', { value: 'School Sounds/Drums/kick.wav' });
    const cheer = audio('cheer.ogg', 'audio/ogg');
    Object.defineProperty(cheer, 'webkitRelativePath', { value: 'School Sounds/Vocals/cheer.ogg' });

    const result = sampleEntriesFromFiles([kick, cheer]);

    expect(result.folderName).toBe('School Sounds');
    expect(result.entries.map((entry) => [entry.relativePath, entry.category])).toEqual([
      ['Drums/kick.wav', 'Drums'],
      ['Vocals/cheer.ogg', 'Vocals'],
    ]);
  });

  it('stops an accidental drive-wide scan at the safety ceiling', async () => {
    const entries = Object.fromEntries(Array.from({ length: 3 }, (_, index) => [`sound-${index}.wav`, audio(`sound-${index}.wav`)]));
    await expect(scanSampleDirectory(folder('Too Much', entries), { maxFiles: 2 }))
      .rejects.toBeInstanceOf(SampleLibraryLimitError);
  });
});
