import { expect, it } from 'vitest';
import { addAudioClip, addTrack, emptyProject } from './garage.js';
import { copyStudioClips, pasteStudioClips, moveStudioClips, trimStudioClip, splitStudioClips, StudioHistory, gainToDb, dbToGain, visibleStudioNotes, studioSourceNotePatch } from './studio-editing.js';
function song() {
  let p = addTrack(emptyProject('Song', 120), 'Keys', 't1', 'KEYS');
  p = addTrack(p, 'Bass', 't2', 'BASS');
  p = addTrack(p, 'Voice', 't3', 'AUDIO');
  return addAudioClip(p, p.tracks[0]!.id, {engineId:'c1', name:'Phrase', source:'INSTRUMENT', startSec:2, sourceDurationSec:4, notes:[{engineId:'n1', pitch:60,startBeat:1,durationBeats:2,velocity:.8}]});
}
it('copies an independent MIDI phrase at the destination', () => {
  const p=song(), source=p.tracks[0]!.clips[0]!;
  const next=pasteStudioClips(p,copyStudioClips(p,[source.id]),8);
  const clip=next.tracks[0]!.clips[1]!;
  expect(clip.startSec).toBe(8); expect(clip.id).not.toBe(source.id);
  clip.notes[0]!.pitch=70;
  expect(source.notes[0]!.pitch).toBe(60); expect(clip.trimEndSec).toBe(4);
});
it('moves a selection and rejects incompatible track moves atomically', () => {
  const p=song(), id=p.tracks[0]!.clips[0]!.id;
  const moved=moveStudioClips(p,[id],-10,p.tracks[1]!.id);
  expect(moved.tracks[0]!.clips).toHaveLength(0);
  expect(moved.tracks[1]!.clips[0]!.startSec).toBe(0);
  expect(()=>moveStudioClips(p,[id],1,p.tracks[2]!.id)).toThrow(/audio/i);
  expect(p.tracks[0]!.clips).toHaveLength(1);
});
it('left trims and reveals the same source again without shifting the sound', () => {
  const p=song(), id=p.tracks[0]!.clips[0]!.id;
  const trimmed=trimStudioClip(p,id,'START',1);
  expect(trimmed.tracks[0]!.clips[0]).toMatchObject({startSec:3,trimStartSec:1,trimEndSec:4});
  expect(trimStudioClip(trimmed,id,'START',-1).tracks[0]!.clips[0]).toMatchObject({startSec:2,trimStartSec:0,trimEndSec:4});
});
it('splits a trimmed region at its true source offset', () => {
  let p=song(); const id=p.tracks[0]!.clips[0]!.id;
  p=trimStudioClip(p,id,'START',1);
  const next=splitStudioClips(p,[id],4);
  expect(next.tracks[0]!.clips).toHaveLength(2);
  expect(next.tracks[0]!.clips[0]).toMatchObject({startSec:3,trimStartSec:1,trimEndSec:2});
  expect(next.tracks[0]!.clips[1]).toMatchObject({startSec:4,trimStartSec:2,trimEndSec:4});
  expect(next.tracks[0]!.clips[1]!.notes[0]!.startBeat).toBe(1);
});
it('preserves relative timing and lanes when pasting grouped clips', () => {
  let p=song(); p=addAudioClip(p,p.tracks[1]!.id,{engineId:'c2',name:'Bass',source:'INSTRUMENT',startSec:3,sourceDurationSec:1});
  const ids=p.tracks.flatMap(t=>t.clips.map(c=>c.id));
  const next=pasteStudioClips(p,copyStudioClips(p,ids),10);
  expect(next.tracks[0]!.clips[1]!.startSec).toBe(10);
  expect(next.tracks[1]!.clips[1]!.startSec).toBe(11);
});
it('groups fader gestures and branches history after an edit', () => {
  const p=song(), history=new StudioHistory(p);
  history.commit({...p,name:'First'}, 'Rename');
  history.commit({...p,name:'Second'}, 'Rename', 'drag');
  history.commit({...p,name:'Third'}, 'Rename', 'drag');
  expect(history.undo()?.name).toBe('First');
  expect(history.redo()?.name).toBe('Third');
  history.undo(); history.commit({...p,name:'Branch'},'Rename');
  expect(history.redo()).toBeUndefined(); expect(history.undo()?.name).toBe('First');
});
it('converts mixer gain to decibels and represents silence exactly',()=> {
  expect(gainToDb(.5)).toBeCloseTo(-6.0206); expect(dbToGain(-6.0206)).toBeCloseTo(.5);
  expect(dbToGain(-60)).toBe(0); expect(gainToDb(0)).toBe(-60);
});

it('projects trimmed MIDI notes into the visible clip without mutating the source', () => {
  const clip=song().tracks[0]!.clips[0]!;
  clip.trimStartSec=1; clip.trimEndSec=2;
  expect(visibleStudioNotes(clip,120)).toEqual([{engineId:'n1',pitch:60,startBeat:0,durationBeats:1,velocity:.8}]);
  expect(clip.notes[0]!.startBeat).toBe(1);
  clip.trimStartSec=1.5;
  expect(visibleStudioNotes(clip,120)).toEqual([]);
});

it('preserves hidden MIDI head and tail when a trimmed note is moved or transposed',()=>{
 const clip=song().tracks[0]!.clips[0]!;
 clip.notes[0]!.durationBeats=5; clip.trimStartSec=1;clip.trimEndSec=2;
 const visible=visibleStudioNotes(clip,120)[0]!;
 const patch=studioSourceNotePatch(clip,visible,{...visible,startBeat:.25,pitch:72});
 Object.assign(clip.notes[0]!,patch);
 clip.trimStartSec=0;clip.trimEndSec=4;
 expect(visibleStudioNotes(clip,120)[0]).toMatchObject({startBeat:1.25,durationBeats:5,pitch:72});
});

it('keeps arrangement edits inside the portable fifteen-minute timeline',()=>{
 const p=song(),id=p.tracks[0]!.clips[0]!.id;
 expect(()=>pasteStudioClips(p,copyStudioClips(p,[id]),899)).toThrow(/15 minutes/);
 expect(moveStudioClips(p,[id],10000).tracks[0]!.clips[0]!.startSec).toBe(896);
 expect(trimStudioClip(p,id,'END',10000).tracks[0]!.clips[0]!.trimEndSec).toBe(898);
});
