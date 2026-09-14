import { useEffect, useState } from 'react';
import { dbToGain, gainToDb, effectSettingsFor, type GarageProject, type AudioTrack, type GarageEffect, type GarageEffectSettings } from '@chatter/shared';
import type { OpenDawEngine } from '../audio/OpenDawEngine.js';
export const STUDIO_COLORS=['#63d9cd','#edb954','#d898c5','#99acfa','#d0df76','#f49d77'];
const FX: Array<{id:GarageEffect;name:string;hint:string;parameter:string}>=[
 {id:'SPACE',name:'Reverb',hint:'Put it in a room',parameter:'Room size'},
 {id:'ECHO',name:'Delay',hint:'A little echo',parameter:'Repeats'},
 {id:'VOICE_SHINE',name:'Compressor',hint:'Even out the loud bits',parameter:'Punch'},
 {id:'CLEANUP',name:'Noise gate',hint:'Quiet between sounds',parameter:'Sensitivity'},
 {id:'ROBOT',name:'Bitcrusher',hint:'Crunchy computer sound',parameter:'Grit'},
 {id:'TUNE',name:'Pitch correction',hint:'Pull notes into key',parameter:'Speed'},
];
function Meter({engine,trackId,name}:{engine:OpenDawEngine;trackId?:string;name:string}){
 const [levels,setLevels]=useState([0,0,0,0]);
 useEffect(()=>{
  let last=0;
  const subscription=engine.subscribeMeter(trackId,values=>{const now=performance.now();if(now-last>55){last=now;setLevels(values);}});
  return ()=>subscription.terminate();
 },[engine,trackId]);
 const peak=Math.max(levels[0]??0,levels[1]??0), db=gainToDb(peak);
 return <div className="console-meter" role="meter" aria-label={`${name} output level`} aria-valuemin={-60} aria-valuemax={6} aria-valuenow={Math.max(-60,Math.min(6,Math.round(db)))}>
  <div className="meter-pair">{[0,1].map(i=><span key={i}><i style={{height:`${Math.max(0,Math.min(100,(gainToDb(levels[i]??0)+60)/60*100))}%`}} /></span>)}</div>
  <output className={peak>=1?'clipping':''}>{peak>=1?'Clip':db<=-60?'−∞':`${db.toFixed(1)}`}</output>
 </div>;
}
export function StudioMixer({project,engine,activeId,armedId,onSelect,onArm,onGain,onPan,onMute,onSolo,onMaster,onEffect,onEffectChange}:{
 project:GarageProject;engine:OpenDawEngine;activeId?:string;armedId?:string;
 onSelect(track:AudioTrack):void;onArm(track:AudioTrack):void;onGain(track:AudioTrack,gain:number):void;onPan(track:AudioTrack,pan:number):void;
 onMute(track:AudioTrack):void;onSolo(track:AudioTrack):void;onMaster(gain:number):void;
 onEffect(track:AudioTrack,effect:GarageEffect):void;onEffectChange(track:AudioTrack,effect:GarageEffect,patch:Partial<GarageEffectSettings>):void;
}){
 const active=project.tracks.find(t=>t.engineId===activeId);
 return <div className="studio-console">
  <div className="console-channels" aria-label="Mixer channels">
   {project.tracks.map((track,index)=><section className={`console-channel ${activeId===track.engineId?'selected':''}`} style={{'--channel':STUDIO_COLORS[index%STUDIO_COLORS.length]} as React.CSSProperties} key={track.id}>
    <button className="channel-name" onClick={()=>onSelect(track)}>{track.name}</button>
    <label className="console-pan">Pan<input aria-label={`${track.name} mixer pan`} type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={e=>onPan(track,Number(e.target.value))}/><output>{Math.abs(track.pan)<.01?'Center':`${Math.round(Math.abs(track.pan)*100)}${track.pan<0?' L':' R'}`}</output></label>
    <div className="channel-fader"><input aria-label={`${track.name} level in dB`} className="vertical-fader" type="range" min="-60" max="0" step="0.5" value={gainToDb(track.gain)} onChange={e=>onGain(track,dbToGain(Number(e.target.value)))}/><Meter engine={engine} trackId={track.engineId} name={track.name}/></div>
    <output className="fader-db">{track.gain===0?'−∞':gainToDb(track.gain).toFixed(1)} dB</output>
    <div className="console-switches"><button aria-label={`Mute ${track.name}`} aria-pressed={track.muted} onClick={()=>onMute(track)}>M</button><button aria-label={`Solo ${track.name}`} aria-pressed={track.soloed} onClick={()=>onSolo(track)}>S</button><button aria-label={`Arm ${track.name}`} aria-pressed={armedId===track.engineId} onClick={()=>onArm(track)}>●</button></div>
   </section>)}
   <section className="console-channel master-channel"><b>Master</b><small>The whole mix</small><div className="channel-fader"><input aria-label="Master level in dB" className="vertical-fader" type="range" min="-60" max="0" step="0.5" value={gainToDb(project.masterGain??1)} onChange={e=>onMaster(dbToGain(Number(e.target.value)))}/><Meter engine={engine} name="Master"/></div><output className="fader-db">{gainToDb(project.masterGain??1)<=-60?'−∞':gainToDb(project.masterGain??1).toFixed(1)} dB</output></section>
  </div>
  {active && <aside className="console-effects"><header><b>{active.name}</b><span>Effects rack</span></header>{FX.map(fx=>{
   const settings=effectSettingsFor(active,fx.id),enabled=active.effects.includes(fx.id);
   return <div className={`console-effect ${enabled?'on':''}`} key={fx.id}>
    <button aria-label={`${enabled?'Bypass':'Enable'} ${fx.name} on ${active.name}`} aria-pressed={enabled} onClick={()=>onEffect(active,fx.id)}><i/>{fx.name}</button><small>{fx.hint}</small>
    {enabled&&<div className="effect-knobs"><label>Amount<input aria-label={`${fx.name} amount`} type="range" min="0" max="1" step=".01" value={settings.amount} onChange={e=>onEffectChange(active,fx.id,{amount:Number(e.target.value)})}/></label><label>{fx.parameter}<input aria-label={`${fx.name} ${fx.parameter}`} type="range" min="0" max="1" step=".01" value={settings.character} onChange={e=>onEffectChange(active,fx.id,{character:Number(e.target.value)})}/></label></div>}
    {enabled&&fx.id==='TUNE'&&<div className="effect-knobs"><label>Key<select aria-label="Pitch correction key" value={settings.key} onChange={e=>onEffectChange(active,fx.id,{key:Number(e.target.value)})}>{['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'].map((n,i)=><option value={i} key={n}>{n}</option>)}</select></label><label>Scale<select aria-label="Pitch correction scale" value={settings.scale} onChange={e=>onEffectChange(active,fx.id,{scale:Number(e.target.value)})}>{['Chromatic','Major','Minor','Dorian','Mixolydian','Pentatonic','Blues','Whole tone'].map((n,i)=><option value={i} key={n}>{n}</option>)}</select></label></div>}
   </div>;
  })}</aside>}
 </div>;
}
