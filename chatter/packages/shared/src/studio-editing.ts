import { newId } from './ids.js';
import { secondsToBeats, clipDuration, type MidiNote, type AudioClip, type AudioTrack, type GarageProject } from './garage.js';

export const STUDIO_MAX_SECONDS=15*60;

export interface StudioClipboard { clips: Array<{ trackId: string; trackIndex: number; kind: AudioTrack['kind']; clip: AudioClip }>; startSec: number; endSec: number }
export function copyStudioClips(project: GarageProject, ids: string[]): StudioClipboard {
  const selected = new Set(ids);
  const clips = project.tracks.flatMap((track, trackIndex) => track.clips.filter(c => selected.has(c.id)).map(clip => ({trackId:track.id, trackIndex, kind:track.kind, clip:structuredClone(clip)})));
  return { clips, startSec: clips.length ? Math.min(...clips.map(c=>c.clip.startSec)) : 0, endSec: clips.length ? Math.max(...clips.map(c=>c.clip.startSec+clipDuration(c.clip))) : 0 };
}
export function pasteStudioClips(project: GarageProject, copied: StudioClipboard, startSec: number, targetTrackId?: string): GarageProject {
  if (!copied.clips.length) return project;
  const firstIndex=Math.min(...copied.clips.map(c=>c.trackIndex));
  const destination=targetTrackId ? project.tracks.findIndex(t=>t.id===targetTrackId) : -1;
  const next={...project,tracks:project.tracks.map(t=>({...t,clips:[...t.clips]}))};
  for(const item of copied.clips) {
    const track=destination>=0 ? next.tracks[destination+item.trackIndex-firstIndex] : next.tracks.find(t=>t.id===item.trackId);
    if(!track || (track.kind==='AUDIO') !== (item.clip.source!=='INSTRUMENT')) throw new Error('Audio clips need audio tracks; MIDI clips need instrument tracks.');
    const clip=structuredClone(item.clip);
    clip.id=newId(); clip.engineId=''; clip.notes=clip.notes.map(n=>({...n,engineId:''}));
    clip.startSec=Math.max(0,startSec)+item.clip.startSec-copied.startSec;
    if(clip.startSec+clipDuration(clip)>STUDIO_MAX_SECONDS)throw new Error('A Studio song can run for up to 15 minutes. Move this copy earlier.');
    track.clips.push(clip);
  }
  return next;
}
export function moveStudioClips(project: GarageProject, ids: string[], deltaSec: number, targetTrackId?: string): GarageProject {
  const copied=copyStudioClips(project,ids);
  if(!copied.clips.length) return project;
  const delta=Math.max(-copied.startSec,Math.min(deltaSec,STUDIO_MAX_SECONDS-copied.endSec));
  const selected=new Set(ids);
  const next={...project,tracks:project.tracks.map(t=>({...t,clips:t.clips.filter(c=>!selected.has(c.id))}))};
  const base=targetTrackId ? next.tracks.findIndex(t=>t.id===targetTrackId) : -1;
  const first=Math.min(...copied.clips.map(c=>c.trackIndex));
  for(const item of copied.clips) {
    const target=base>=0 ? next.tracks[base+item.trackIndex-first] : next.tracks.find(t=>t.id===item.trackId);
    if(!target || (target.kind==='AUDIO') !== (item.clip.source!=='INSTRUMENT')) throw new Error('Audio clips need audio tracks; MIDI clips need instrument tracks.');
    target.clips.push({...item.clip,startSec:item.clip.startSec+delta});
  }
  return next;
}
export function trimStudioClip(project: GarageProject, id: string, edge: 'START'|'END', deltaSec: number): GarageProject {
  return {...project,tracks:project.tracks.map(t=>({...t,clips:t.clips.map(c=>{
    if(c.id!==id) return c;
    if(edge==='START') {
      const delta=Math.max(-c.trimStartSec,-c.startSec,Math.min(deltaSec,clipDuration(c)-.01));
      return {...c,startSec:c.startSec+delta,trimStartSec:c.trimStartSec+delta};
    }
    // MIDI may grow beyond its original bounds; audio may reveal only real source samples.
    const end=Math.max(c.trimStartSec+.01,Math.min(c.trimStartSec+STUDIO_MAX_SECONDS-c.startSec,c.source==='INSTRUMENT' ? c.trimEndSec+deltaSec : Math.min(c.sourceDurationSec,c.trimEndSec+deltaSec)));
    return {...c,trimEndSec:end,sourceDurationSec:Math.max(c.sourceDurationSec,end)};
  })}))};
}
export function splitStudioClips(project: GarageProject, ids: string[], atSec: number): GarageProject {
  const selected=new Set(ids);
  return {...project,tracks:project.tracks.map(t=>({...t,clips:t.clips.flatMap(c=>{
    const position=atSec-c.startSec;
    if(!selected.has(c.id)||position<.01||position>clipDuration(c)-.01) return [c];
    const cut=c.trimStartSec+position;
    return [{...c,trimEndSec:cut},{...structuredClone(c),id:newId(),engineId:'',startSec:atSec,trimStartSec:cut,notes:c.notes.map(n=>({...n,engineId:''}))}];
  })}))};
}
export function deleteStudioClips(project:GarageProject, ids:string[]):GarageProject {
  const selected=new Set(ids); return {...project,tracks:project.tracks.map(t=>({...t,clips:t.clips.filter(c=>!selected.has(c.id))}))};
}
export const gainToDb=(gain:number)=>gain<=.001 ? -60 : 20*Math.log10(gain);
export const dbToGain=(db:number)=>db<=-60 ? 0 : Math.pow(10,Math.min(0,db)/20);

/** Snapshots contain durable IDs. Runtime IDs are refreshed by the engine reconciler. */
export class StudioHistory {
  private entries: Array<{project:GarageProject;label:string;group?:string}>;
  private index=0;
  constructor(project:GarageProject) { this.entries=[{project:structuredClone(project),label:'Open session'}]; }
  get canUndo(){return this.index>0;}
  get canRedo(){return this.index<this.entries.length-1;}
  get undoLabel(){return this.entries[this.index]?.label ?? '';}
  commit(project:GarageProject,label='Edit song',group?:string) {
    if(JSON.stringify(project)===JSON.stringify(this.entries[this.index]!.project)) return;
    this.entries=this.entries.slice(0,this.index+1);
    if(group && this.index>0 && this.entries[this.index]!.group===group) this.entries[this.index]={project:structuredClone(project),label,group};
    else { this.entries.push({project:structuredClone(project),label,group}); this.index++; }
    if(this.entries.length>100){this.entries.shift();this.index--;}
  }
  undo(){if(!this.canUndo)return; return structuredClone(this.entries[--this.index]!.project);}
  redo(){if(!this.canRedo)return; return structuredClone(this.entries[++this.index]!.project);}
  replaceCurrent(project:GarageProject){this.entries[this.index]!.project=structuredClone(project);}
}

/** Notes as heard inside a trimmed region; source notes remain available when revealing edges. */
export function visibleStudioNotes(clip: AudioClip, bpm: number) {
  const from=secondsToBeats(clip.trimStartSec,bpm), to=secondsToBeats(clip.trimEndSec,bpm);
  return clip.notes.filter(note=>note.startBeat<to && note.startBeat+note.durationBeats>from).map(note=>({
    ...note, startBeat:Math.max(from,note.startBeat)-from,
    durationBeats:Math.min(to,note.startBeat+note.durationBeats)-Math.max(from,note.startBeat),
  }));
}

/** Apply visible deltas to the original note so moving a trimmed note retains its hidden material. */
export function studioSourceNotePatch(clip: AudioClip, visible: MidiNote, patch: Partial<Omit<MidiNote,'engineId'>>) {
  const source=clip.notes.find(note=>note.engineId===visible.engineId);
  if(!source)throw new Error('This note is no longer in the clip.');
  return {...patch,
    ...(patch.startBeat===undefined?{}:{startBeat:Math.max(0,source.startBeat+patch.startBeat-visible.startBeat)}),
    ...(patch.durationBeats===undefined?{}:{durationBeats:Math.max(.0625,source.durationBeats+patch.durationBeats-visible.durationBeats)}),
  };
}
