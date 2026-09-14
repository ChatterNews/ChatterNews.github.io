import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('the newsroom motion layer', () => {
  it('is loaded after the tactile pass and keeps a reduced-motion path', () => {
    const stylesheetUrl = new URL('./MotionPass.css', import.meta.url);
    expect(existsSync(fileURLToPath(stylesheetUrl))).toBe(true);

    const stylesheet = readFileSync(fileURLToPath(stylesheetUrl), 'utf8');
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    expect(app.indexOf("./styles/MotionPass.css")).toBeGreaterThan(app.indexOf("./styles/TactilePass.css"));
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('@keyframes chatter-room-piece-in');
    expect(stylesheet).toContain('@keyframes chatter-signal-breathe');
  });
});
