/*
 * Chatter travels on school USB drives, so every face is bundled with the app.
 * Keep this list curated: each family has a job, not just a different costume.
 */
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400-italic.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-800.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-400.css';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/dynapuff/latin-400.css';
import '@fontsource/dynapuff/latin-600.css';
import '@fontsource/dynapuff/latin-700.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/latin-400-italic.css';
import '@fontsource/newsreader/latin-500.css';
import '@fontsource/newsreader/latin-600.css';
import '@fontsource/newsreader/latin-700.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/baloo-2/latin-500.css';
import '@fontsource/baloo-2/latin-600.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/bungee/latin-400.css';
import '@fontsource/luckiest-guy/latin-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';

export type EditorFontGroup = {
  label: string;
  fonts: Array<{ label: string; value: string }>;
};

export const EDITOR_FONT_GROUPS: EditorFontGroup[] = [
  {
    label: 'Clear & flexible',
    fonts: [
      { label: 'Atkinson Hyperlegible', value: 'Atkinson Hyperlegible Next' },
      { label: 'Bricolage Grotesque', value: 'Bricolage Grotesque' },
      { label: 'Fredoka', value: 'Fredoka' },
      { label: 'Nunito', value: 'Nunito' },
    ],
  },
  {
    label: 'Display headlines',
    fonts: [
      { label: 'DynaPuff', value: 'DynaPuff' },
      { label: 'Bungee', value: 'Bungee' },
      { label: 'Luckiest Guy', value: 'Luckiest Guy' },
      { label: 'Baloo 2', value: 'Baloo 2' },
    ],
  },
  {
    label: 'Editorial & handwritten',
    fonts: [
      { label: 'Newsreader', value: 'Newsreader' },
      { label: 'Patrick Hand', value: 'Patrick Hand' },
    ],
  },
  {
    label: 'Pixel & monospace',
    fonts: [
      { label: 'Pixelify Sans', value: 'Pixelify Sans' },
      { label: 'Space Mono', value: 'Space Mono' },
    ],
  },
  {
    label: 'Computer classics',
    fonts: [
      { label: 'Georgia', value: 'Georgia' },
      { label: 'Arial', value: 'Arial' },
    ],
  },
];

const BUNDLED_FONT_NAMES = EDITOR_FONT_GROUPS.flatMap((group) => group.fonts.map((font) => font.value))
  .filter((font) => !['Georgia', 'Arial'].includes(font));

/** Make canvas/video exports wait for editor-only faces, not just the app chrome. */
export async function waitForEditorFonts() {
  if (!document.fonts) return;
  await Promise.all(BUNDLED_FONT_NAMES.map((family) => document.fonts.load(`600 32px "${family}"`)));
  await document.fonts.ready;
}
