import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

describe('the Spiral Stage visual system', () => {
  test('loads last, builds the center-frame orbit, and respects reduced motion', () => {
    const cssUrl = new URL('./SpiralStage.css', import.meta.url);
    expect(existsSync(fileURLToPath(cssUrl))).toBe(true);
    const css = readFileSync(fileURLToPath(cssUrl), 'utf8');
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

    expect(app).toContain("./styles/SpiralStage.css");
    expect(css).toContain('.spiral-stage-scroller');
    expect(css).toContain('.spiral-center-frame');
    expect(css).toMatch(/\.spiral-center-room\s*\{[^}]*clip-path:\s*inset\(/s);
    expect(css).toMatch(/\.spiral-satellite-badge\s*\{[^}]*right:\s*15px;[^}]*top:\s*14px;/s);
    expect(css).toContain('--toolbar-corner-clearance: 70px;');
    expect(css).toMatch(/\.spiral-window-toolbar\s*\{[^}]*padding-right:\s*var\(--toolbar-corner-clearance\);/s);
    expect(css).toContain('[data-preview-kind=\'table\']');
    expect(css).toContain('[data-preview-kind=\'broadcast-lens\']');
    expect(css).toContain('[data-preview-kind=\'archive-carousel\']');
    expect(css).toContain('overflow: clip;');
    expect(css).toContain('@media (max-width: 650px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toContain('.spiral-orbit-bar');
  });

  test('gives Blast one bounded editor viewport inside the mechanical window', () => {
    const css = readFileSync(fileURLToPath(new URL('./SpiralStage.css', import.meta.url)), 'utf8');

    expect(css).toMatch(/\.spiral-center-room:has\(\.blast-editor\)\s*\{[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.spiral-live-board:has\(\.blast-editor\)\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
    const blastEditorRule = css.match(/\.blast-editor\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(blastEditorRule).toMatch(/margin:\s*0\s*!important;/);
    expect(blastEditorRule).toMatch(/height:\s*100%;/);
    expect(blastEditorRule).toMatch(/min-height:\s*0\s*!important;/);
    expect(blastEditorRule).toMatch(/display:\s*flex;/);
    expect(blastEditorRule).toMatch(/flex-direction:\s*column;/);
    expect(css).toMatch(/\.blast-workspace,[^}]*\.blast-guided \.blast-workspace\s*\{[^}]*position:\s*relative;[^}]*height:\s*auto\s*!important;[^}]*min-height:\s*0\s*!important;[^}]*flex:\s*1;/s);
    expect(css).toMatch(/@container newsroom-frame \(max-width:\s*1240px\)[\s\S]*?\.blast-inspector\s*\{[^}]*top:\s*0;/s);
  });
});
