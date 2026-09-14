import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { SampleLibraryEntry, SampleLibraryScan } from '../audio/sample-library.js';
import { SampleShelfView } from './SampleShelf.js';

const nothing = () => undefined;
const later = async () => undefined;

function entry(name: string, category = 'Drums'): SampleLibraryEntry {
  return {
    id: name, name, category, relativePath: `${category}/${name}`, size: 1_024,
    lastModified: 1, mime: 'audio/wav', extension: 'WAV',
    getFile: async () => new File([new Uint8Array(1_024)], name, { type: 'audio/wav' }),
  };
}

function scan(entries: SampleLibraryEntry[] = [entry('kick.wav')]): SampleLibraryScan {
  return { folderName: 'School Sounds', entries, categories: ['Drums'], linked: true };
}

function view(overrides: Partial<Parameters<typeof SampleShelfView>[0]> = {}) {
  return renderToStaticMarkup(createElement(SampleShelfView, {
    scan: scan(), query: '', category: 'ALL', loading: false,
    onQueryChange: nothing, onCategoryChange: nothing, onClose: nothing,
    onConnect: later, onRefresh: later, onChooseSnapshot: nothing,
    onPreview: later, onAddToTimeline: later, onLoadSampler: later,
    ...overrides,
  }));
}

describe('Sound Shelf view', () => {
  it('makes timeline and sampler actions explicit for a connected sound', () => {
    const html = view();
    expect(html).toContain('School Sounds');
    expect(html).toContain('kick.wav');
    expect(html).toContain('Add at playhead');
    expect(html).toContain('Load sampler');
    expect(html).toContain('Preview kick.wav');
  });

  it('turns an empty connected folder into a next action', () => {
    const html = view({ scan: scan([]) });
    expect(html).toContain('This folder is empty');
    expect(html).toContain('then press Refresh');
  });

  it('keeps lost permission visible with a reconnect action', () => {
    const html = view({ scan: undefined, error: 'Studio needs permission to read School Sounds.', reconnectName: 'School Sounds' });
    expect(html).toContain('Studio needs permission to read School Sounds.');
    expect(html).toContain('Reconnect folder');
  });
});
