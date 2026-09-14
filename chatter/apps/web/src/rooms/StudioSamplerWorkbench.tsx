import type { GarageSamplerSettings } from '@chatter/shared';
import type { PointerEvent as ReactPointerEvent } from 'react';

const NOTES = Array.from({ length: 104 }, (_, index) => ({ pitch: index + 12, label: noteName(index + 12) }));

export function StudioSamplerWorkbench({
  sampleName, durationSec, waveform, settings, onChange, onAutoSlice, onDetectSlices,
}: {
  sampleName?: string;
  durationSec?: number;
  waveform?: number[];
  settings: GarageSamplerSettings;
  onChange(patch: Partial<GarageSamplerSettings>): void;
  onAutoSlice(count: number): void;
  onDetectSlices(): void;
}) {
  const bars = waveform?.length ? waveform : [];
  const duration = durationSec ?? 0;

  function addSlice(event: ReactPointerEvent<HTMLDivElement>) {
    if (settings.layout !== 'SLICE') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const absolute = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (absolute <= settings.start || absolute >= settings.end) return;
    const point = (absolute - settings.start) / (settings.end - settings.start);
    onChange({ slicePoints: [...settings.slicePoints, point] });
  }

  function removeSlice(point: number) {
    onChange({ slicePoints: settings.slicePoints.filter((current) => current !== point) });
  }

  return <div className="sampler-lab">
    <div className="sampler-mode-switch" role="group" aria-label="Sampler layout">
      <button type="button" className={settings.layout === 'PLAY' ? 'active' : ''} onClick={() => onChange({ layout: 'PLAY' })}><b>Play it</b><span>One sound across the keys</span></button>
      <button type="button" className={settings.layout === 'SLICE' ? 'active' : ''} onClick={() => onChange({ layout: 'SLICE' })}><b>Slice it</b><span>Pieces across the drum pads</span></button>
    </div>

    <section className="sampler-wave-panel">
      <header><div><small>SOURCE SOUND</small><b>{sampleName ?? 'Loaded sample'}</b></div><span>{duration ? `${duration.toFixed(duration < 10 ? 2 : 1)} sec` : 'Ready to play'}</span></header>
      <div className={`sampler-waveform ${settings.layout === 'SLICE' ? 'slice-ready' : ''}`} onPointerDown={addSlice} aria-label="Sample waveform">
        <div className={`sampler-wave-bars ${bars.length ? '' : 'unavailable'}`}>{bars.length ? bars.map((peak, index) => <i key={index} style={{ height: `${Math.max(6, peak * 100)}%` }} />) : <span>Waveform unavailable · the sound still plays</span>}</div>
        <span className="sampler-trim-shade before" style={{ width: `${settings.start * 100}%` }} />
        <span className="sampler-trim-shade after" style={{ left: `${settings.end * 100}%` }} />
        <span className="sampler-trim-line start" style={{ left: `${settings.start * 100}%` }}><b>IN</b></span>
        <span className="sampler-trim-line end" style={{ left: `${settings.end * 100}%` }}><b>OUT</b></span>
        {settings.layout === 'SLICE' && settings.slicePoints.slice(1, -1).map((point, index) => <button key={`${point}-${index}`} type="button" className="sampler-slice-line" style={{ left: `${(settings.start + point * (settings.end - settings.start)) * 100}%` }} aria-label={`Remove slice ${index + 2}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => removeSlice(point)}><b>{index + 2}</b></button>)}
      </div>
      {settings.layout === 'SLICE' && <div className="sampler-slice-tools"><span>Click the waveform to add a cut. Click a numbered cut to remove it.</span><button type="button" className="detect" onClick={onDetectSlices}>Find the hits</button><button type="button" onClick={() => onAutoSlice(8)}>8 even</button><button type="button" onClick={() => onAutoSlice(16)}>16 even</button></div>}
    </section>

    <div className="sampler-control-board">
      <section><small>WINDOW</small><label><span><b>Start</b><output>{formatPoint(settings.start, duration)}</output></span><input type="range" min="0" max="0.99" step="0.005" value={settings.start} onChange={(event) => onChange({ start: Number(event.target.value) })} /></label><label><span><b>End</b><output>{formatPoint(settings.end, duration)}</output></span><input type="range" min="0.01" max="1" step="0.005" value={settings.end} onChange={(event) => onChange({ end: Number(event.target.value) })} /></label></section>
      <section><small>PITCH</small><label><span><b>Root note</b><output>{noteName(settings.rootNote)}</output></span><select aria-label="Sampler root note" value={settings.rootNote} onChange={(event) => onChange({ rootNote: Number(event.target.value) })}>{NOTES.map((note) => <option key={note.pitch} value={note.pitch}>{note.label}</option>)}</select></label><label><span><b>Tune</b><output>{settings.tune > 0 ? '+' : ''}{settings.tune.toFixed(1)} st</output></span><input type="range" min="-12" max="12" step="0.1" value={settings.tune} onChange={(event) => onChange({ tune: Number(event.target.value) })} /></label></section>
      <section><small>SHAPE</small><SamplerKnob label="Attack" value={settings.attack} onChange={(attack) => onChange({ attack })} low="Sharp" high="Soft" /><SamplerKnob label="Release" value={settings.release} onChange={(release) => onChange({ release })} low="Tight" high="Long" /><SamplerKnob label="Filter" value={settings.filter} onChange={(filter) => onChange({ filter })} low="Dark" high="Open" /></section>
      <section className="sampler-trigger-section"><small>TRIGGER</small><div role="group" aria-label="Sampler trigger mode">{(['ONE_SHOT', 'GATE', 'LOOP'] as const).map((mode) => <button key={mode} type="button" className={settings.mode === mode ? 'active' : ''} onClick={() => onChange({ mode })}>{mode === 'ONE_SHOT' ? 'One-shot' : mode === 'GATE' ? 'Gate' : 'Loop'}</button>)}</div><p>{settings.mode === 'ONE_SHOT' ? 'Tap once to hear the whole window.' : settings.mode === 'GATE' ? 'The sound stops when the key lifts.' : 'The window repeats while the key is held.'}</p></section>
    </div>
  </div>;
}

function SamplerKnob({ label, value, low, high, onChange }: { label: string; value: number; low: string; high: string; onChange(value: number): void }) {
  return <label className="sampler-knob"><span><b>{label}</b><output>{Math.round(value * 100)}</output></span><input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} /><em><i>{low}</i><i>{high}</i></em></label>;
}

function formatPoint(point: number, duration: number): string {
  return duration ? `${(point * duration).toFixed(duration < 10 ? 2 : 1)}s` : `${Math.round(point * 100)}%`;
}

function noteName(pitch: number): string {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  return `${names[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}
