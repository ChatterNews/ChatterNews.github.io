import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import './styles/fonts.js';
import './styles/prototype.css';
import { prepareWebsiteStart } from './portable/website-update.js';
import { App } from './App.js';
import { connectReaderDrive, getReaderDrive, isMobileEdition, isWebsiteEdition, returnToReader } from './portable/reader-drive.js';
import './styles/Mobile.css';
import './styles/Responsive.css';
import './styles/RoomInteriors.css';
import './styles/Controls.css';

const root = createRoot(document.getElementById('root')!);
async function start(askPermission = false) {
  try {
    if (isWebsiteEdition()) root.render(<main className="checkin-room" role="status"><h1>Opening Orbit…</h1></main>);
    if (!await prepareWebsiteStart()) return;
    await connectReaderDrive(askPermission);
    const drive = getReaderDrive();
    root.render(<React.StrictMode>
      {drive && <div role="status" style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 100, background: '#fff5cd', color: '#201b39', border: '2px solid #201b39', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>Story Drive: <b>{drive.name}</b> · Finish session saves to Chatter News</div>}
      {isWebsiteEdition() ? <HashRouter><App /></HashRouter> : <BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter>}
    </React.StrictMode>);
  } catch (error) {
    root.render(<main style={{ maxWidth: 560, margin: '12vh auto', padding: 24 }}>
      <h1>{(isMobileEdition() || isWebsiteEdition()) ? 'Open your Orbit desk' : 'Reconnect your Story Drive'}</h1>
      <p role="alert">{error instanceof Error ? error.message : 'Orbit could not open this drive.'}</p>
      <button onClick={() => void start(true)}>{(isMobileEdition() || isWebsiteEdition()) ? 'Try opening Orbit again' : 'Reconnect and open Orbit'}</button>{' '}
      <button onClick={returnToReader}>Return to the reader</button>
    </main>);
  }
}
void start();
