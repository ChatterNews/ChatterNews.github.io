import { Extension, type Command } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { deskShape, type DeskShape } from './desk-model.js';

export const DeskBeatAttributes = Extension.create({
  name: 'deskBeatAttributes',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'blockquote'],
      attributes: {
        deskBeat: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-desk-beat'),
          renderHTML: (attributes) => {
            const beat = attributes.deskBeat;
            const shape = attributes.deskShape;
            if (typeof beat !== 'string') return {};
            const label = typeof shape === 'string' ? deskShape(shape as DeskShape).beats.find((item) => item.id === beat)?.label : undefined;
            return { 'data-desk-beat': beat, ...(label ? { 'data-desk-label': label } : {}) };
          },
        },
        deskShape: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-desk-shape'),
          renderHTML: (attributes) => typeof attributes.deskShape === 'string' ? { 'data-desk-shape': attributes.deskShape } : {},
        },
        proofSourceId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-proof-source'),
          renderHTML: (attributes) => typeof attributes.proofSourceId === 'string' ? { 'data-proof-source': attributes.proofSourceId } : {},
        },
      },
    }];
  },
});

/** Remove only the scaffold, as one undoable edit. Keep words, marks, sources and media. */
export const useRegularWriting: Command = ({ editor, tr, dispatch }) => {
  if (!editor.isEditable) return false;
  let changed = false;
  tr.doc.descendants((node, pos) => {
    if (node.attrs.deskBeat == null && node.attrs.deskShape == null) return;
    changed = true;
    if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, deskBeat: null, deskShape: null });
  });
  // Keep Undo separate from the words typed immediately before this action.
  if (changed && dispatch) closeHistory(tr);
  return changed;
};
