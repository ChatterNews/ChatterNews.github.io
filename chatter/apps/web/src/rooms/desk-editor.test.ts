// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProseNode } from '@chatter/shared';
import { DeskBeatAttributes, useRegularWriting } from './desk-editor.js';
import { DESK_SHAPES, deskShapeFromDocument, deskShapeTemplate } from './desk-model.js';

const editors: Editor[] = [];
function open(content: ProseNode) {
  const editor = new Editor({ extensions: [StarterKit, DeskBeatAttributes, Image], content });
  editors.push(editor);
  return editor;
}
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });

describe('Desk regular writing', () => {
  it.each(DESK_SHAPES)('removes $label prompts without losing the draft, and survives reopening', shape => {
    const body = deskShapeTemplate(shape.id);
    body.content![0]!.content = [{ type: 'text', text: 'Our garden opened.', marks: [{ type: 'bold' }] }];
    body.content![2]!.attrs = { deskBeat: 'QUOTE', deskShape: shape.id, proofSourceId: 'source-1' };
    body.content![2]!.content![0]!.content = [{ type: 'text', text: 'We grew it together.', marks: [{ type: 'italic' }] }];
    body.content!.push({ type: 'image', attrs: { src: 'data:image/png;base64,AA==', alt: 'Garden, photo by Sam' } });
    const editor = open(body);
    const before = editor.getJSON();
    const text = editor.getText();
    editor.commands.setTextSelection(5);
    expect(editor.commands.command(useRegularWriting)).toBe(true);
    expect(editor.state.selection.from).toBe(5);
    expect(editor.getText()).toBe(text);
    const expected = structuredClone(before);
    const clear = (node: ProseNode) => {
      if (node.attrs && ('deskBeat' in node.attrs || 'deskShape' in node.attrs)) {
        node.attrs.deskBeat = null;
        node.attrs.deskShape = null;
      }
      node.content?.forEach(clear);
    };
    clear(expected as ProseNode);
    expect(editor.getJSON()).toEqual(expected);
    expect(editor.getHTML()).not.toMatch(/data-desk-(beat|shape|label)/);
    expect(deskShapeFromDocument(open(editor.getJSON() as ProseNode).getJSON() as ProseNode)).toBeUndefined();
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(expected);
  });

  it('Undo restores just the template, keeping words typed immediately before dropping it', () => {
    const editor = open(deskShapeTemplate('UPDATE'));
    editor.commands.insertContent('New words');
    const written = editor.getJSON();
    editor.commands.command(useRegularWriting);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(written);
  });

  it('does not change read-only drafts or create edits in an already regular draft', () => {
    const editor = open(deskShapeTemplate('PROFILE'));
    editor.setEditable(false);
    const before = editor.getJSON();
    expect(editor.commands.command(useRegularWriting)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    const regular = open({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My draft' }] }] });
    expect(regular.commands.command(useRegularWriting)).toBe(false);
    expect(regular.can().undo()).toBe(false);
  });
});
