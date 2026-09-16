import { ControlIcon } from './ControlIcon.js';
import { useEffect, useRef, useState } from 'react';
import { WebsiteUpdate } from './WebsiteUpdate.js';
import { fullscreenAvailable, isFullscreen, toggleFullscreen } from './display-mode.js';
import '../styles/DisplayControls.css';

export function DisplayControls({ lowSpec, onLowSpecChange, afterHours, onAfterHoursChange, inRoom }: {
  lowSpec: boolean; onLowSpecChange: (value: boolean) => void; inRoom: boolean;
  afterHours: boolean; onAfterHoursChange: (value: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState(isFullscreen);
  const [notice, setNotice] = useState('');
  const [standalone, setStandalone] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mode=window.matchMedia('(display-mode: standalone)');
    const update=() => {
      setFull(isFullscreen());
      setStandalone(mode.matches || !!(navigator as Navigator & {standalone?: boolean}).standalone);
    };
    update(); document.addEventListener('fullscreenchange',update); document.addEventListener('webkitfullscreenchange',update);
    mode.addEventListener?.('change',update);
    return () => { document.removeEventListener('fullscreenchange',update);document.removeEventListener('webkitfullscreenchange',update);mode.removeEventListener?.('change',update); };
  }, []);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  async function fullscreen() {
    setNotice('');
    try { await toggleFullscreen();setFull(isFullscreen());close(); }
    catch { setNotice('This browser could not change fullscreen. Try its own fullscreen control, or use the Home Screen option below on iPhone or iPad.'); }
  }
  return <>
    <button ref={trigger} type="button" className="display-controls-trigger" data-in-room={inRoom} data-low-spec={lowSpec}
      aria-label={`Screen settings${lowSpec ? ': low-spec mode on' : ''}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => {setNotice('');dialog.current?.showModal();setOpen(true);}}>
      <ControlIcon kind="screen" /><b>Screen</b>
    </button>
    <dialog ref={dialog} className="display-controls-dialog" aria-labelledby="display-controls-title"
      onCancel={() => {setOpen(false);}} onClose={() => {setOpen(false);}}
      onClick={(event) => {if(event.target===dialog.current) {const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) close();}}}>
      <header><h2 id="display-controls-title">Your screen</h2><button type="button" aria-label="Close screen settings" onClick={close}><ControlIcon kind="close" /></button></header>
      {standalone && !full ? <p>Orbit is already in its own app window.</p> :
        <button type="button" className="display-fullscreen" onClick={() => void fullscreen()} disabled={!fullscreenAvailable() && !full}>
          {full ? 'Exit fullscreen' : 'Enter fullscreen'}
        </button>}
      {!fullscreenAvailable() && !standalone && <p>This browser does not offer a fullscreen button for webpages.</p>}
      {notice && <p role="alert">{notice}</p>}
      <label className="display-appearance"><input type="checkbox" role="switch" aria-label="After Hours" checked={afterHours} onChange={(e) => onAfterHoursChange(e.target.checked)} /><span><b>After Hours</b><small>{afterHours ? 'Night-blue panels and cool lights.' : 'Space Lab is on. Switch to a darker workspace.'}</small></span></label>
      <label className="display-low-spec"><input type="checkbox" checked={lowSpec} onChange={(e) => onLowSpecChange(e.target.checked)} /><span><b>Low-spec mode</b><small>Quieter visuals and instant room changes. All your tools stay available.</small></span></label>
      <p className="display-remember">Remembered on this browser.</p>
      <WebsiteUpdate />
      <details className="display-install"><summary>iPhone or iPad: hide Safari’s toolbar</summary>
        <p>In Safari, choose Share → Add to Home Screen. Keep “Open as Web App” on if shown, then open Orbit from that icon.</p>
        <p>Use Finish session to save your work before switching. If the new desk is empty, open your saved session there.</p>
      </details>
    </dialog>
  </>;
}
