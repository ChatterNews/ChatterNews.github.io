import { useEffect, useRef, useState, type ReactNode } from 'react';
import { countWords, type BoothPerformanceMode, type ProseNode, type Story } from '@chatter/shared';
import type { RecorderPhase } from '../audio/useBoothRecorder.js';
import { BOOTH_PERFORMANCE_MODES } from '../audio/booth-take-check.js';

function scriptLines(body: ProseNode): string[] {
  const collect = (node: ProseNode): string => node.text ?? node.content?.map(collect).join('') ?? '';
  return body.content?.map(collect).map((line) => line.trim()).filter(Boolean) ?? [];
}

export function BoothPrompter({ story, phase, countdown, mode, controls, onEdit }: { story: Story; phase: RecorderPhase; countdown: number; mode: BoothPerformanceMode; controls: ReactNode; onEdit: () => void }) {
  const lines = scriptLines(story.body); const words = countWords(story.body);
  const [running, setRunning] = useState(false); const [wpm, setWpm] = useState(140); const [fontSize, setFontSize] = useState(32);
  const [mirror, setMirror] = useState(false); const [focus, setFocus] = useState(false); const [autoRoll, setAutoRoll] = useState(true);
  const scroller = useRef<HTMLDivElement>(null); const roll = useRef<HTMLDivElement>(null);
  useEffect(() => { const guide = BOOTH_PERFORMANCE_MODES.find((item) => item.id === mode); if (guide) setWpm(Math.round((guide.pace[0] + guide.pace[1]) / 10) * 5); }, [mode]);
  useEffect(() => { setRunning(false); if (scroller.current) scroller.current.scrollTop = 0; }, [story.id]);
  useEffect(() => { if (autoRoll && phase === 'RECORDING') setRunning(true); if (['PAUSED', 'SAVING', 'OFF'].includes(phase)) setRunning(false); }, [phase, autoRoll]);
  useEffect(() => {
    if (!running || !words) return;
    let frame = 0; let last = performance.now(); let carried = 0;
    const tick = (now: number) => {
      const box = scroller.current; const content = roll.current;
      if (!box || !content) return;
      const contentHeight = content.scrollHeight - box.clientHeight;
      carried += Math.min(100, now - last) / 1000 * Math.max(10, contentHeight) / Math.max(1, words / wpm * 60); last = now;
      if (carried >= 1) { box.scrollTop += carried; carried = 0; }
      if (box.scrollTop >= box.scrollHeight - box.clientHeight - 1) { setRunning(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [running, words, wpm, fontSize]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable) return;
      if (event.code === 'Space') { event.preventDefault(); setRunning((value) => !value); }
      if (event.key === 'Escape') setFocus(false);
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, []);
  return <section className={`booth-prompter ${focus ? 'focus-mode' : ''}`} aria-label="Teleprompter">
    <div className="booth-screen-bar"><span className={phase === 'RECORDING' ? 'live' : ''}>● {phase === 'RECORDING' ? 'RECORDING' : phase === 'PAUSED' ? 'PAUSED' : running ? 'REHEARSING' : 'YOUR SCRIPT'}</span><span>{words} words · ~{Math.round(words / wpm * 60)}s at this pace</span><button onClick={() => setFocus(!focus)}>{focus ? 'Exit focus ↙' : 'Focus view ↗'}</button></div>
    <div className="booth-script-window"><div className="booth-reading-guide" aria-hidden="true" /><div ref={scroller} className="booth-script-scroll" onWheel={() => setRunning(false)}><div ref={roll} className="booth-script-roll" style={{ fontSize, transform: mirror ? 'scaleX(-1)' : undefined }}>{lines.length ? lines.map((line, index) => <p key={index}>{line}</p>) : <div className="booth-empty-script"><h2>Your voice can start here.</h2><p>Record freely, or write a script in the Desk and it will appear here.</p><button className="newsroom-button" disabled={['RECORDING', 'PAUSED', 'SAVING', 'COUNTDOWN'].includes(phase)} onClick={onEdit}>Write a script ↗</button></div>}</div></div>{phase === 'COUNTDOWN' && <div className="booth-countdown" role="status">{countdown}<small>Get ready. This countdown is silent.</small></div>}</div>
    <div className="booth-prompter-tools"><button className="newsroom-button" aria-pressed={running} disabled={!words} onClick={() => setRunning(!running)}>{running ? 'Ⅱ Pause scroll' : '▶ Rehearse / scroll'}</button><button className="newsroom-button" onClick={() => { setRunning(false); if (scroller.current) scroller.current.scrollTop = 0; }}>↶ Top</button><label>Pace · {wpm} wpm<input aria-label="Prompter pace" type="range" min={60} max={240} step={5} value={wpm} onChange={(event) => setWpm(Number(event.target.value))} /></label><label>Type · {fontSize}px<input aria-label="Prompter text size" type="range" min={22} max={64} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><label className="booth-check-label"><input type="checkbox" checked={autoRoll} onChange={(event) => setAutoRoll(event.target.checked)} />Scroll on record</label><label className="booth-check-label"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />Mirror</label></div>
    {controls}
    <div className="booth-shortcuts">Space · scroll / pause &nbsp; R · record / stop &nbsp; M · mark a pickup &nbsp; Esc · leave focus. Scrolling never changes the recording.</div>
  </section>;
}
