import { CreativeToolIcon } from '../components/CreativeToolIcon.js';
import { BlastStart } from './BlastStart.js';
import { LoadingStatus } from '../components/LoadingStatus.js';
import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { completeRecipeProduction, newId, resolveStoryCreationRecipe, saveDeliverable, type BlastElement, type BlastPage, type BlastProject, type BlastShape, type Story, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { LookInside } from '../components/LookInside.js';
import { BLAST_TEMPLATES, clonePage, editableBlastProject, element, layersForPanel, makeBlankPage, selectedCanvasZIndex } from './blast-model.js';
import { BLAST_RECIPE_FAMILIES, buildBlastRecipe, remixBlastRecipe } from './blast-recipes.js';
import { checkBlastProject } from './blast-quality.js';
import { BlastReadyCheck } from './BlastReadyCheck.js';
import { BlastHistoryControls } from './BlastHistoryControls.js';
import { BlastStoryTextPicker } from './BlastStoryTextPicker.js';
import { blastStorySources, type BlastStoryPiece, type BlastStorySource } from './blast-story-text.js';
import { sanitizedRichText } from './blast-rich-text.js';
import { imagePagesPdf } from '../export/image-pdf.js';
import { FontSelect } from '../components/FontSelect.js';
import { waitForEditorFonts } from '../styles/fonts.js';
import { selectStoryWorkspace } from '../story-navigation.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { blastReilyFocus, blastReilyRecovery } from '../components/reily-room-focus.js';
import './Blast.css';

type SideTab = 'templates' | 'add' | 'pages' | 'layers';
type Snapshot = BlastProject;

const PALETTE = ['#1A1626', '#FFFFFF', '#FFFDF7', '#FFF6E4', '#FF3D8B', '#FF7A1A', '#FFD21E', '#9BE015', '#22C7E8', '#8B4DE8'];
const SHAPES: Array<{ shape: BlastShape; icon: string; label: string }> = [
  { shape: 'RECTANGLE', icon: '■', label: 'Rectangle' }, { shape: 'ELLIPSE', icon: '●', label: 'Circle' },
  { shape: 'TRIANGLE', icon: '▲', label: 'Triangle' }, { shape: 'DIAMOND', icon: '◆', label: 'Diamond' },
  { shape: 'STAR', icon: '★', label: 'Star' }, { shape: 'HEXAGON', icon: '⬢', label: 'Hexagon' },
  { shape: 'ARROW', icon: '➜', label: 'Arrow' }, { shape: 'HEART', icon: '♥', label: 'Heart' },
  { shape: 'SPEECH', icon: '▰', label: 'Speech bubble' },
];

const SHAPE_PATHS: Record<BlastShape, string> = {
  RECTANGLE: 'M0 0H100V100H0Z',
  ELLIPSE: 'M50 0A50 50 0 1 1 49.99 0Z',
  TRIANGLE: 'M50 2L98 98H2Z',
  DIAMOND: 'M50 1L99 50L50 99L1 50Z',
  STAR: 'M50 1L61.5 35L97.5 35.5L68.5 56.5L79 91L50 70L21 91L31.5 56.5L2.5 35.5L38.5 35Z',
  HEXAGON: 'M25 2H75L99 50L75 98H25L1 50Z',
  ARROW: 'M2 34H62V10L98 50L62 90V66H2Z',
  HEART: 'M50 94C42 84 5 61 5 31C5 8 34 0 50 22C66 0 95 8 95 31C95 61 58 84 50 94Z',
  SPEECH: 'M5 8H95V72H58L38 94L42 72H5Z',
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeName(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'blast-design';
}

function xml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

function richTextHtml(item: BlastElement): string {
  return item.richText ? sanitizedRichText(item.richText) : xml(item.text ?? '').replace(/\n/g, '<br/>');
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function attr(value: unknown, fallback = ''): string {
  return xml(String(value ?? fallback));
}

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9a-z.,%/\s+-]*\)|[a-z]+)$/i;

function color(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return COLOR.test(text) ? text : fallback;
}

function keyword(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^[a-z-]+$/i.test(text) ? text : fallback;
}

function fillValue(item: BlastElement): string {
  if (item.fillType === 'LINEAR') return `linear-gradient(${item.fillAngle ?? 90}deg, ${item.fill}, ${item.fillSecondary ?? '#8B4DE8'})`;
  if (item.fillType === 'RADIAL') return `radial-gradient(circle, ${item.fill}, ${item.fillSecondary ?? '#8B4DE8'})`;
  return item.fill;
}

function shadowValue(item: BlastElement): string | undefined {
  if (!(item.shadowBlur || item.shadowX || item.shadowY)) return undefined;
  return `${num(item.shadowX)}px ${num(item.shadowY)}px ${num(item.shadowBlur)}px ${color(item.shadowColor, '#1A1626')}`;
}

function imageFilter(item: BlastElement): string {
  return `brightness(${num(item.brightness, 100)}%) contrast(${num(item.contrast, 100)}%) saturate(${num(item.saturation, 100)}%) grayscale(${num(item.grayscale)}%)`;
}

function dashArray(item: BlastElement): string | undefined {
  return item.strokeStyle === 'DASHED' ? '10 7' : item.strokeStyle === 'DOTTED' ? '2 7' : undefined;
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const step = 0x8000;
  for (let at = 0; at < bytes.length; at += step) {
    binary += String.fromCharCode(...bytes.subarray(at, at + step));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function elementMarkup(item: BlastElement, imageSources: Map<string, string>): string {
  if (item.hidden) return '';
  const x = num(item.x);
  const y = num(item.y);
  const width = num(item.width);
  const height = num(item.height);
  const transform = `rotate(${num(item.rotation)} ${x + width / 2} ${y + height / 2})`;
  const rawId = String(item.id ?? '').replace(/[^a-z0-9]/gi, '');
  const gradientId = `gradient-${rawId}`;
  const shadowId = `shadow-${rawId}`;
  const angle = (num(item.fillAngle, 90) - 90) * Math.PI / 180;
  const x1 = 50 - Math.cos(angle) * 50;
  const y1 = 50 - Math.sin(angle) * 50;
  const x2 = 50 + Math.cos(angle) * 50;
  const y2 = 50 + Math.sin(angle) * 50;
  const gradient = item.fillType === 'LINEAR'
    ? `<linearGradient id="${gradientId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop stop-color="${color(item.fill, '#1A1626')}"/><stop offset="1" stop-color="${color(item.fillSecondary, '#8B4DE8')}"/></linearGradient>`
    : item.fillType === 'RADIAL'
      ? `<radialGradient id="${gradientId}"><stop stop-color="${color(item.fill, '#1A1626')}"/><stop offset="1" stop-color="${color(item.fillSecondary, '#8B4DE8')}"/></radialGradient>`
      : '';
  const shadow = shadowValue(item) ? `<filter id="${shadowId}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${num(item.shadowX)}" dy="${num(item.shadowY)}" stdDeviation="${num(item.shadowBlur) / 2}" flood-color="${color(item.shadowColor, '#1A1626')}"/></filter>` : '';
  const defs = gradient || shadow ? `<defs>${gradient}${shadow}</defs>` : '';
  const filter = shadow ? `filter="url(#${shadowId})"` : '';
  const objectFill = gradient ? `url(#${gradientId})` : color(item.fill, '#1A1626');
  const stroke = color(item.stroke, 'none');
  const strokeWidth = num(item.strokeWidth);
  const radius = num(item.radius);
  const opacity = num(item.opacity, 1);
  if (item.kind === 'TEXT') {
    const body = richTextHtml(item);
    const decoration = `${item.underline ? 'underline ' : ''}${item.strikethrough ? 'line-through' : ''}`.trim() || 'none';
    const vertical = item.verticalAlign === 'middle' ? 'center' : item.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
    const shadowCss = shadowValue(item) ?? 'none';
    return `${defs}<foreignObject x="${x}" y="${y}" width="${width}" height="${height}" opacity="${opacity}" transform="${transform}" ${filter}><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden;color:${color(item.fill, '#1A1626')};font-family:${attr(item.fontFamily, 'Nunito').replace(/[^\w\s,'-]/g, '')},sans-serif;font-size:${num(item.fontSize, 16)}px;font-weight:${num(item.fontWeight, 400)};font-style:${keyword(item.fontStyle, 'normal')};line-height:${num(item.lineHeight, 1.2)};letter-spacing:${num(item.letterSpacing)}px;text-align:${keyword(item.align, 'left')};text-decoration:${decoration};text-transform:${keyword(item.textTransform, 'none')};text-shadow:${shadowCss};-webkit-text-stroke:${num(item.textStrokeWidth)}px ${color(item.textStrokeColor, '#1A1626')};white-space:pre-wrap;overflow-wrap:anywhere;display:flex;flex-direction:column;justify-content:${vertical}">${body}</div></foreignObject>`;
  }
  if (item.kind === 'IMAGE') {
    const source = item.imageAssetId ? imageSources.get(item.imageAssetId) : undefined;
    if (!source) return `${defs}<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${objectFill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" transform="${transform}" ${filter}/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" fill="#8C82A3" font-family="Nunito" font-size="20">ADD A PHOTO</text>`;
    const preserve = item.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
    const clipId = `clip-${rawId}`;
    const flip = `translate(${item.flipX ? x * 2 + width : 0} ${item.flipY ? y * 2 + height : 0}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1})`;
    return `<defs>${gradient}${shadow}<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath></defs><g transform="${transform}" ${filter}><image href="${attr(source)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${preserve}" clip-path="url(#${clipId})" opacity="${opacity}" transform="${flip}" style="filter:${imageFilter(item)}"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray(item) ?? ''}"/></g>`;
  }
  if (item.kind === 'SHAPE' && (item.shape ?? 'RECTANGLE') !== 'RECTANGLE') {
    const path = SHAPE_PATHS[item.shape as BlastShape] ?? SHAPE_PATHS.RECTANGLE;
    return `${defs}<g transform="${transform}" opacity="${opacity}" ${filter}><svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}" fill="${objectFill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray(item) ?? ''}" vector-effect="non-scaling-stroke"/></svg></g>`;
  }
  return `${defs}<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${item.kind === 'LINE' ? 0 : radius}" fill="${objectFill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray(item) ?? ''}" opacity="${opacity}" transform="${transform}" ${filter}/>`;
}

function pageSvg(project: BlastProject, page: BlastPage, imageSources: Map<string, string>) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(project.width)}" height="${num(project.height)}" viewBox="0 0 ${num(project.width)} ${num(project.height)}"><rect width="100%" height="100%" fill="${color(page.background, '#FFFFFF')}"/>${page.elements.map((item) => elementMarkup(item, imageSources)).join('')}</svg>`;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

interface CanvasTextRun { text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; color?: string; background?: string }
interface CanvasTextToken extends CanvasTextRun { width: number }

function richRuns(item: BlastElement): CanvasTextRun[] {
  if (!item.richText) return [{ text: item.text ?? '', bold: false, italic: false, underline: false, strike: false }];
  const template = document.createElement('template');
  template.innerHTML = sanitizedRichText(item.richText);
  const runs: CanvasTextRun[] = [];
  const walk = (node: Node, style: Omit<CanvasTextRun, 'text'>) => {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ ...style, text: node.textContent ?? '' });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const tag = node instanceof HTMLElement ? node.tagName : '';
    if (tag === 'BR') { runs.push({ ...style, text: '\n' }); return; }
    const element = node instanceof HTMLElement ? node : undefined;
    const next = {
      bold: style.bold || tag === 'B' || tag === 'STRONG',
      italic: style.italic || tag === 'I' || tag === 'EM',
      underline: style.underline || tag === 'U',
      strike: style.strike || tag === 'S' || tag === 'STRIKE',
      ...(element?.style.color ? { color: element.style.color } : style.color ? { color: style.color } : {}),
      ...(element?.style.backgroundColor ? { background: element.style.backgroundColor } : style.background ? { background: style.background } : {}),
    };
    if (tag === 'DIV' && runs.length && !runs.at(-1)!.text.endsWith('\n')) runs.push({ ...style, text: '\n' });
    node.childNodes.forEach((child) => walk(child, next));
    if (tag === 'DIV' && runs.length && !runs.at(-1)!.text.endsWith('\n')) runs.push({ ...style, text: '\n' });
  };
  walk(template.content, { bold: false, italic: false, underline: false, strike: false });
  return runs;
}

function textFont(item: BlastElement, run: CanvasTextRun) {
  const style = run.italic || item.fontStyle === 'italic' ? 'italic ' : '';
  const weight = run.bold ? Math.max(700, item.fontWeight) : item.fontWeight;
  return `${style}${weight} ${item.fontSize}px "${item.fontFamily}"`;
}

function transformedText(value: string, transform: BlastElement['textTransform']) {
  if (transform === 'uppercase') return value.toUpperCase();
  if (transform === 'lowercase') return value.toLowerCase();
  if (transform === 'capitalize') return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  return value;
}

function richTextLines(context: CanvasRenderingContext2D, item: BlastElement): CanvasTextToken[][] {
  const lines: CanvasTextToken[][] = [[]];
  let lineWidth = 0;
  for (const run of richRuns(item)) {
    for (const piece of run.text.split(/(\n|\s+)/).filter((part) => part !== '')) {
      if (piece === '\n') { lines.push([]); lineWidth = 0; continue; }
      const text = transformedText(piece, item.textTransform);
      context.font = textFont(item, run);
      const measured = context.measureText(text).width + Math.max(0, text.length - 1) * item.letterSpacing;
      const whitespace = /^\s+$/.test(text);
      if (!whitespace && lineWidth && lineWidth + measured > item.width) {
        lines.push([]);
        lineWidth = 0;
      }
      if (whitespace && lineWidth === 0) continue;
      lines.at(-1)!.push({ ...run, text, width: measured });
      lineWidth += measured;
    }
  }
  return lines;
}

function canvasPaint(context: CanvasRenderingContext2D, item: BlastElement): string | CanvasGradient {
  if (item.fillType === 'RADIAL') {
    const gradient = context.createRadialGradient(item.width / 2, item.height / 2, 0, item.width / 2, item.height / 2, Math.max(item.width, item.height) / 2);
    gradient.addColorStop(0, item.fill);
    gradient.addColorStop(1, item.fillSecondary ?? '#8B4DE8');
    return gradient;
  }
  if (item.fillType === 'LINEAR') {
    const angle = ((item.fillAngle ?? 90) - 90) * Math.PI / 180;
    const x = Math.cos(angle) * item.width / 2;
    const y = Math.sin(angle) * item.height / 2;
    const gradient = context.createLinearGradient(item.width / 2 - x, item.height / 2 - y, item.width / 2 + x, item.height / 2 + y);
    gradient.addColorStop(0, item.fill);
    gradient.addColorStop(1, item.fillSecondary ?? '#8B4DE8');
    return gradient;
  }
  return item.fill;
}

async function renderPageImage(project: BlastProject, page: BlastPage, imageSources: Map<string, string>, mime: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = project.width * scale;
  canvas.height = project.height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.scale(scale, scale);
  context.fillStyle = page.background;
  context.fillRect(0, 0, project.width, project.height);

  for (const item of page.elements) {
    if (item.hidden) continue;
    context.save();
    context.globalAlpha = item.opacity;
    context.globalCompositeOperation = (item.blendMode ?? 'source-over') === 'normal' ? 'source-over' : item.blendMode as GlobalCompositeOperation;
    context.shadowColor = item.shadowColor ?? 'transparent';
    context.shadowOffsetX = item.shadowX ?? 0;
    context.shadowOffsetY = item.shadowY ?? 0;
    context.shadowBlur = item.shadowBlur ?? 0;
    context.translate(item.x + item.width / 2, item.y + item.height / 2);
    context.rotate(item.rotation * Math.PI / 180);
    context.translate(-item.width / 2, -item.height / 2);

    if (item.kind === 'TEXT') {
      context.beginPath();
      context.rect(0, 0, item.width, item.height);
      context.clip();
      context.textBaseline = 'top';
      const lineHeight = item.fontSize * item.lineHeight;
      const lines = richTextLines(context, item);
      const totalHeight = lines.length * lineHeight;
      const startY = item.verticalAlign === 'middle' ? (item.height - totalHeight) / 2 : item.verticalAlign === 'bottom' ? item.height - totalHeight : 0;
      lines.forEach((line, lineIndex) => {
        const width = line.reduce((sum, token) => sum + token.width, 0);
        let x = item.align === 'center' ? (item.width - width) / 2 : item.align === 'right' ? item.width - width : 0;
        const y = startY + lineIndex * lineHeight;
        for (const token of line) {
          context.font = textFont(item, token);
          if (token.background) {
            context.fillStyle = token.background;
            context.fillRect(x, y, token.width, lineHeight);
          }
          context.fillStyle = token.color ?? item.fill;
          if ((item.textStrokeWidth ?? 0) > 0) {
            context.lineWidth = (item.textStrokeWidth ?? 0) * 2;
            context.strokeStyle = item.textStrokeColor ?? '#1A1626';
            context.strokeText(token.text, x, y);
          }
          context.fillText(token.text, x, y);
          const underline = token.underline || item.underline;
          const strike = token.strike || item.strikethrough;
          context.strokeStyle = token.color ?? item.fill;
          context.lineWidth = Math.max(1, item.fontSize / 18);
          if (underline) { context.beginPath(); context.moveTo(x, y + item.fontSize * 1.02); context.lineTo(x + token.width, y + item.fontSize * 1.02); context.stroke(); }
          if (strike) { context.beginPath(); context.moveTo(x, y + item.fontSize * .52); context.lineTo(x + token.width, y + item.fontSize * .52); context.stroke(); }
          x += token.width;
        }
      });
    } else if (item.kind === 'IMAGE') {
      roundedRect(context, 0, 0, item.width, item.height, item.radius);
      context.clip();
      const source = item.imageAssetId ? imageSources.get(item.imageAssetId) : undefined;
      if (source) {
        const image = new Image();
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = source; });
        const fit = item.fit ?? 'cover';
        const ratio = fit === 'cover' ? Math.max(item.width / image.width, item.height / image.height) : Math.min(item.width / image.width, item.height / image.height);
        const width = image.width * ratio;
        const height = image.height * ratio;
        context.filter = imageFilter(item);
        context.translate(item.flipX ? item.width : 0, item.flipY ? item.height : 0);
        context.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
        context.drawImage(image, (item.width - width) / 2, (item.height - height) / 2, width, height);
        context.filter = 'none';
      } else {
        context.fillStyle = canvasPaint(context, item);
        context.fillRect(0, 0, item.width, item.height);
      }
      if (item.strokeWidth) {
        roundedRect(context, 0, 0, item.width, item.height, item.radius);
        context.strokeStyle = item.stroke;
        context.lineWidth = item.strokeWidth;
        context.stroke();
      }
    } else if (item.kind === 'SHAPE' && (item.shape ?? 'RECTANGLE') !== 'RECTANGLE') {
      const path = new Path2D(SHAPE_PATHS[item.shape ?? 'RECTANGLE']);
      context.scale(item.width / 100, item.height / 100);
      context.fillStyle = canvasPaint(context, { ...item, width: 100, height: 100 });
      context.fill(path);
      if (item.strokeWidth) {
        context.strokeStyle = item.stroke;
        context.lineWidth = item.strokeWidth * (100 / Math.max(item.width, item.height));
        context.setLineDash(item.strokeStyle === 'DASHED' ? [10, 7] : item.strokeStyle === 'DOTTED' ? [2, 7] : []);
        context.stroke(path);
      }
    } else {
      roundedRect(context, 0, 0, item.width, item.height, item.kind === 'LINE' ? 0 : item.radius);
      context.fillStyle = canvasPaint(context, item);
      context.fill();
      if (item.strokeWidth) {
        context.strokeStyle = item.stroke;
        context.lineWidth = item.strokeWidth;
        context.setLineDash(item.strokeStyle === 'DASHED' ? [10, 7] : item.strokeStyle === 'DOTTED' ? [2, 7] : []);
        context.stroke();
      }
    }
    context.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, mime === 'image/jpeg' ? .94 : undefined));
  if (!blob) throw new Error('No image');
  return blob;
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="blast-field"><span>{label}</span><input type="number" value={Number(value.toFixed(2))} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function Blast({ me, stories, storyId }: { me?: User; stories: Story[]; storyId?: string }) {
  const [compactToolsOpen, setCompactToolsOpen] = useState(false);
  const store = useStore();
  const { gate, classifierReady } = useGate();
  const location = useLocation(); const navigate = useNavigate(); const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]); const requestedProjectId = searchParams.get('project'); const podcastCoverId = searchParams.get('podcastCover');
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [projects, setProjects] = useState<BlastProject[]>([]);
  const [project, setProject] = useState<BlastProject | null>(null);
  const [pageId, setPageId] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [sideTab, setSideTab] = useState<SideTab>('add');
  const [showLibrary, setShowLibrary] = useState(false);
  const [showStoryText, setShowStoryText] = useState(false);
  const [showReadyCheck, setShowReadyCheck] = useState(false);
  const [pendingExport, setPendingExport] = useState<'PNG' | 'SVG' | 'PDF' | 'PODCAST_COVER' | 'HANDOFF'>();
  const [storySources, setStorySources] = useState<BlastStorySource[]>([]);
  const [zoom, setZoom] = useState(.68);
  const [showGrid, setShowGrid] = useState(false);
  const [showMargins, setShowMargins] = useState(true);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [saveState, setSaveState] = useState('Saved here');
  const [error, setError] = useState<string>();
  const [reilyProblem, setReilyProblem] = useState<'import' | 'export'>();
  const [outputNotice, setOutputNotice] = useState<string>();
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const imageInput = useRef<HTMLInputElement>(null);
  const storyTextTrigger = useRef<HTMLButtonElement>(null);
  const layerClipboard = useRef<BlastElement[]>([]);
  const saveTimer = useRef<number>();
  const pendingJobs = useRef(0);
  const [working, setWorking] = useState(0);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    let live = true;
    setLibraryLoaded(false);
    store.blasts.list().then((rows) => {
      if (!live) return;
      const ordered = rows.map(editableBlastProject).sort((a, b) => b.updatedAt - a.updatedAt);
      setProjects(ordered);
      const requested = storyId || requestedProjectId ? selectStoryWorkspace(ordered, { storyId, projectId: requestedProjectId }) : undefined;
      if (requested) {
        setProject(requested);
        setPageId(requested.pages[0]?.id);
      } else {
        setProject(null);
        setPageId(undefined);
      }
    }).catch(() => { if (live) setError('Blast could not open your saved designs. Reload this page to try again.'); }).finally(() => { if (live) setLibraryLoaded(true); });
    return () => { live = false; };
  }, [store, requestedProjectId, storyId]);

  useEffect(() => {
    let live = true;
    void Promise.all([store.stories.list(), store.episodes.list(), store.users.list()]).then(([stories, episodes, users]) => {
      if (live) setStorySources(blastStorySources(stories, episodes, users));
    }).catch(() => setError('Story text could not load. Close this message and open Story text to try again.'));
    return () => { live = false; };
  }, [store]);

  useSessionCheckpoint(store, async () => {
    if (pendingJobs.current) throw new Error('Wait for Blast to finish importing or exporting, then retry.');
    window.clearTimeout(saveTimer.current);
    if (project) { await store.blasts.update(project.id, project); setSaveState('Saved here'); }
  });

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    if (!project) return;
    window.clearTimeout(saveTimer.current);
    setSaveState('Saving…');
    saveTimer.current = window.setTimeout(() => {
      store.blasts.update(project.id, project).then((saved) => {
        setSaveState('Saved here');
        setProjects((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      }).catch(() => {
        setError('This design did not save. Make another change to try saving again.');
        setSaveState('Not saved');
      });
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [project, store]);

  useEffect(() => {
    if (!project) return;
    const ids = [...new Set(project.pages.flatMap((page) => page.elements.map((item) => item.imageAssetId).filter(Boolean) as string[]))];
    for (const assetId of ids) {
      if (imageUrls.has(assetId)) continue;
      void (async () => {
        const asset = await store.assets.get(assetId);
        if (!asset) return;
        const bytes = await store.blobs.get(asset.path);
        if (!bytes) return;
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime }));
        objectUrls.current.push(url);
        setImageUrls((current) => new Map(current).set(assetId, url));
      })();
    }
  }, [project, imageUrls, store]);

  const page = project?.pages.find((item) => item.id === pageId) ?? project?.pages[0];
  const selectedId = selectedIds.at(-1);
  const selected = page?.elements.find((item) => item.id === selectedId);
  const selectedItems = page?.elements.filter((item) => selectedIds.includes(item.id)) ?? [];
  useReilyFocus(blastReilyFocus(selectedItems.length === 1 ? selected?.kind : undefined));
  useReilyRecovery(reilyProblem && error ? { kind: blastReilyRecovery(reilyProblem), workChanged: false } : undefined);

  function selectOnly(id?: string) {
    if (selected && editingId === selected.id && id !== selected.id) finishTextEdit(selected);
    setSelectedIds(id ? [id] : []);
  }

  function commit(change: (draft: BlastProject) => void) {
    if (!project) return;
    setHistory((rows) => [...rows.slice(-49), copy(project)]);
    setFuture([]);
    const next = copy(project);
    change(next);
    setProject(next);
  }

  function changeElement(id: string, change: (item: BlastElement) => void, remember = true) {
    const run = (draft: BlastProject) => {
      const targetPage = draft.pages.find((item) => item.id === (page?.id ?? pageId));
      const target = targetPage?.elements.find((item) => item.id === id);
      if (target) change(target);
    };
    if (remember) commit(run);
    else setProject((current) => {
      if (!current) return current;
      const next = copy(current);
      run(next);
      return next;
    });
  }

  async function chooseTemplate(templateId: string) {
    setError(undefined);
    const template = BLAST_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const built = template.build();
    try {
      await saveBeforeSwitch();
      const created = await store.blasts.create({ ...built, ...(me ? { authorId: me.id } : {}), ...((storyId ?? stories.find((item) => item.status !== 'DONE')?.id) ? { storyId: storyId ?? stories.find((item) => item.status !== 'DONE')?.id } : {}) });
      setProjects((rows) => [created, ...rows]);
      setProject(created);
      setPageId(created.pages[0]?.id);
      selectOnly();
      setHistory([]);
      setFuture([]);
      setShowLibrary(false);
    } catch {
      setError('Blast could not create that design. Pick the template again to retry.');
    }
  }

  async function saveBeforeSwitch() {
    window.clearTimeout(saveTimer.current);
    if (project) {
      const saved = await store.blasts.update(project.id, project);
      setProjects((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
    }
  }

  async function openSavedDesign(item: BlastProject) {
    if (pendingJobs.current) return;
    pendingJobs.current++; setWorking(pendingJobs.current);
    try {
      await saveBeforeSwitch();
      const next = project?.id === item.id ? project : item;
      setProject(next); setPageId(next.pages[0]?.id); setShowLibrary(false);
      selectOnly(); setHistory([]); setFuture([]);
    } catch { setError('Your current design did not save. Try opening the saved design again.'); }
    finally { pendingJobs.current--; setWorking(pendingJobs.current); }
  }

  async function chooseRecipe(familyId: string, directionId: string, slotValues?: Record<string, string>) {
    if (pendingJobs.current) return;
    pendingJobs.current++; setWorking(pendingJobs.current);
    setError(undefined);
    try {
      const built = buildBlastRecipe(familyId, directionId, { slotValues });
      await saveBeforeSwitch();
      const created = await store.blasts.create({ ...built, ...(me ? { authorId: me.id } : {}), ...((storyId ?? stories.find((item) => item.status !== 'DONE')?.id) ? { storyId: storyId ?? stories.find((item) => item.status !== 'DONE')?.id } : {}) });
      setProjects((rows) => [created, ...rows]); setProject(created); setPageId(created.pages[0]?.id); selectOnly(); setHistory([]); setFuture([]); setShowLibrary(false);
    } catch { setError('Blast could not start that design. Choose the page again to retry.'); }
    finally { pendingJobs.current--; setWorking(pendingJobs.current); }
  }

  function remix(directionId: string) {
    if (!project?.creativeRecipe) return;
    const rebuilt = remixBlastRecipe(project, directionId);
    setHistory((rows) => [...rows.slice(-49), copy(project)]); setFuture([]);
    setProject({ ...project, ...rebuilt, id: project.id, createdAt: project.createdAt, updatedAt: project.updatedAt, authorId: project.authorId, storyId: project.storyId });
    setPageId(rebuilt.pages[0]?.id); selectOnly();
  }

  function requestExport(kind: 'PNG' | 'SVG' | 'PDF' | 'PODCAST_COVER' | 'HANDOFF') {
    if (!project) return;
    if (checkBlastProject(project).some((item) => item.severity === 'BLOCKING')) { setPendingExport(kind); setShowReadyCheck(true); return; }
    if (kind === 'PNG' || kind === 'PODCAST_COVER' || kind === 'HANDOFF') void exportPng(kind === 'PODCAST_COVER', kind === 'HANDOFF'); else if (kind === 'SVG') void exportSvg(); else void exportPdf();
  }

  function continueExport() {
    const kind = pendingExport; setPendingExport(undefined); setShowReadyCheck(false);
    if (kind === 'PNG' || kind === 'PODCAST_COVER' || kind === 'HANDOFF') void exportPng(kind === 'PODCAST_COVER', kind === 'HANDOFF'); else if (kind === 'SVG') void exportSvg(); else if (kind === 'PDF') void exportPdf();
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous || !project) return;
    setFuture((rows) => [copy(project), ...rows].slice(0, 50));
    setHistory((rows) => rows.slice(0, -1));
    setProject(copy(previous));
  }

  function redo() {
    const next = future[0];
    if (!next || !project) return;
    setHistory((rows) => [...rows.slice(-49), copy(project)]);
    setFuture((rows) => rows.slice(1));
    setProject(copy(next));
  }

  function addElement(kind: BlastElement['kind'], shape: BlastShape = 'RECTANGLE') {
    if (!page) return;
    const item = kind === 'TEXT'
      ? element({ kind, x: 120, y: 160, width: 440, height: 100, text: 'Double-click to write', fill: '#1A1626', fontSize: 42, fontWeight: 900 })
      : kind === 'LINE'
        ? element({ kind, x: 150, y: 300, width: 420, height: 5, fill: '#1A1626', name: 'Line' })
        : element({ kind, x: 180, y: 220, width: 260, height: shape === 'ELLIPSE' ? 260 : 180, fill: '#22C7E8', radius: shape === 'RECTANGLE' ? 18 : 0, shape, name: kind === 'IMAGE' ? 'Photo' : SHAPES.find((item) => item.shape === shape)?.label ?? 'Shape' });
    commit((draft) => draft.pages.find((candidate) => candidate.id === page.id)!.elements.push(item));
    selectOnly(item.id);
  }

  function addStoryPiece(piece: BlastStoryPiece, source: BlastStorySource) {
    if (!page || !project) return;
    const textLayers = page.elements.filter((item) => item.kind === 'TEXT').length;
    const offset = textLayers % 7 * 14;
    const headline = piece.kind === 'HEADLINE';
    const byline = piece.kind === 'BYLINE';
    const quote = piece.kind === 'QUOTE';
    const angle = piece.kind === 'ANGLE';
    const fontSize = headline ? 48 : quote ? 26 : angle ? 24 : byline ? 16 : 19;
    const width = Math.max(220, project.width - 120);
    const charactersPerLine = Math.max(18, Math.floor(width / (fontSize * .56)));
    const estimatedLines = piece.text.split('\n').reduce((lines, row) => lines + Math.max(1, Math.ceil(row.length / charactersPerLine)), 0);
    const height = Math.min(project.height - 100, Math.max(headline ? 92 : byline ? 38 : 90, estimatedLines * fontSize * (quote ? 1.28 : 1.38) + 20));
    const item = element({
      kind: 'TEXT',
      name: `${piece.label} · ${source.title}`,
      x: 60 + offset,
      y: 68 + offset,
      width,
      height,
      text: piece.text,
      fill: '#1A1626',
      fontFamily: headline || angle || piece.kind === 'FULL_STORY' || piece.kind === 'PARAGRAPH' ? 'Newsreader' : 'Nunito',
      fontSize,
      fontWeight: headline ? 900 : quote ? 700 : byline ? 800 : 500,
      fontStyle: angle || quote ? 'italic' : 'normal',
      lineHeight: headline ? 1.02 : quote ? 1.28 : 1.38,
    });
    commit((draft) => draft.pages.find((candidate) => candidate.id === page.id)!.elements.push(item));
    selectOnly(item.id);
  }

  function closeStoryText() {
    setShowStoryText(false);
    window.setTimeout(() => storyTextTrigger.current?.focus());
  }

  function duplicateSelected() {
    if (!page || !selectedItems.length) return;
    const groupMap = new Map<string, string>();
    const duplicates = selectedItems.map((item) => {
      if (item.groupId && !groupMap.has(item.groupId)) groupMap.set(item.groupId, newId());
      return { ...item, id: newId(), name: `${item.name} copy`, x: item.x + 20, y: item.y + 20, locked: false, ...(item.groupId ? { groupId: groupMap.get(item.groupId) } : {}) };
    });
    commit((draft) => draft.pages.find((candidate) => candidate.id === page.id)!.elements.push(...duplicates));
    setSelectedIds(duplicates.map((item) => item.id));
  }

  function removeSelected() {
    if (!page || !selectedItems.length) return;
    const removable = selectedItems.filter((item) => !item.locked).map((item) => item.id);
    if (!removable.length) return;
    commit((draft) => {
      const target = draft.pages.find((candidate) => candidate.id === page.id)!;
      target.elements = target.elements.filter((item) => !removable.includes(item.id));
    });
    selectOnly();
  }

  function changeSelected(change: (item: BlastElement) => void) {
    if (!page || !selectedIds.length) return;
    commit((draft) => {
      draft.pages.find((candidate) => candidate.id === page.id)?.elements.forEach((item) => {
        if (selectedIds.includes(item.id) && !item.locked) change(item);
      });
    });
  }

  function groupSelected() {
    if (selectedIds.length < 2) return;
    const groupId = newId();
    changeSelected((item) => { item.groupId = groupId; });
  }

  function pasteLayers() {
    if (!page || !layerClipboard.current.length) return;
    const groupMap = new Map<string, string>();
    const pasted = layerClipboard.current.map((source) => {
      if (source.groupId && !groupMap.has(source.groupId)) groupMap.set(source.groupId, newId());
      return { ...copy(source), id: newId(), x: source.x + 24, y: source.y + 24, locked: false, ...(source.groupId ? { groupId: groupMap.get(source.groupId) } : {}) };
    });
    commit((draft) => draft.pages.find((candidate) => candidate.id === page.id)!.elements.push(...pasted));
    setSelectedIds(pasted.map((item) => item.id));
  }

  function ungroupSelected() {
    changeSelected((item) => { item.groupId = undefined; });
  }

  function alignSelected(mode: 'LEFT' | 'CENTER' | 'RIGHT' | 'TOP' | 'MIDDLE' | 'BOTTOM') {
    if (selectedItems.length < 2) return;
    const left = Math.min(...selectedItems.map((item) => item.x));
    const right = Math.max(...selectedItems.map((item) => item.x + item.width));
    const top = Math.min(...selectedItems.map((item) => item.y));
    const bottom = Math.max(...selectedItems.map((item) => item.y + item.height));
    changeSelected((item) => {
      if (mode === 'LEFT') item.x = left;
      if (mode === 'CENTER') item.x = (left + right - item.width) / 2;
      if (mode === 'RIGHT') item.x = right - item.width;
      if (mode === 'TOP') item.y = top;
      if (mode === 'MIDDLE') item.y = (top + bottom - item.height) / 2;
      if (mode === 'BOTTOM') item.y = bottom - item.height;
    });
  }

  function distributeSelected(axis: 'HORIZONTAL' | 'VERTICAL') {
    if (selectedItems.length < 3) return;
    const ordered = [...selectedItems].sort((a, b) => axis === 'HORIZONTAL' ? a.x - b.x : a.y - b.y);
    const start = axis === 'HORIZONTAL' ? ordered[0]!.x : ordered[0]!.y;
    const end = axis === 'HORIZONTAL' ? ordered.at(-1)!.x : ordered.at(-1)!.y;
    const gap = (end - start) / (ordered.length - 1);
    const positions = new Map(ordered.map((item, index) => [item.id, start + gap * index]));
    changeSelected((item) => { if (axis === 'HORIZONTAL') item.x = positions.get(item.id)!; else item.y = positions.get(item.id)!; });
  }

  function beginMove(event: ReactPointerEvent, item: BlastElement) {
    if (!project || item.locked || editingId === item.id) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    let movingIds: string[];
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      movingIds = selectedIds.includes(item.id) ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id];
    } else if (item.groupId) {
      movingIds = page?.elements.filter((candidate) => candidate.groupId === item.groupId).map((candidate) => candidate.id) ?? [item.id];
    } else {
      movingIds = selectedIds.includes(item.id) ? selectedIds : [item.id];
    }
    if (!movingIds.length) movingIds = [item.id];
    setSelectedIds(movingIds);
    const original = copy(project);
    setHistory((rows) => [...rows.slice(-49), original]);
    setFuture([]);
    const startX = event.clientX;
    const startY = event.clientY;
    const origins = new Map((page?.elements ?? []).filter((candidate) => movingIds.includes(candidate.id)).map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]));
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / zoom;
      const dy = (pointer.clientY - startY) / zoom;
      const unit = snap ? 8 : 1;
      setProject((current) => {
        if (!current) return current;
        const next = copy(current);
        const targetPage = next.pages.find((candidate) => candidate.id === page?.id);
        targetPage?.elements.forEach((target) => {
          const origin = origins.get(target.id);
          if (!origin) return;
          target.x = Math.max(0, Math.round((origin.x + dx) / unit) * unit);
          target.y = Math.max(0, Math.round((origin.y + dy) / unit) * unit);
        });
        return next;
      });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function beginResize(event: ReactPointerEvent, item: BlastElement) {
    if (!project || item.locked) return;
    event.stopPropagation();
    setHistory((rows) => [...rows.slice(-49), copy(project)]);
    setFuture([]);
    const startX = event.clientX;
    const startY = event.clientY;
    const width = item.width;
    const height = item.height;
    const move = (pointer: PointerEvent) => {
      const unit = snap ? 8 : 1;
      changeElement(item.id, (target) => {
        target.width = Math.max(24, Math.round((width + (pointer.clientX - startX) / zoom) / unit) * unit);
        target.height = Math.max(item.kind === 'LINE' ? 2 : 24, Math.round((height + (pointer.clientY - startY) / zoom) / unit) * unit);
      }, false);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function requestImage() {
    setError(undefined); setReilyProblem(undefined);
    imageInput.current?.click();
  }

  async function importImage(file: File) {
    setError(undefined); setReilyProblem(undefined);
    pendingJobs.current += 1; setWorking(pendingJobs.current);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await gate.ingest({ bytes, source: 'upload', meta: { kind: 'IMAGE', mime: file.type || 'image/jpeg', origin: 'UPLOAD', license: 'OWN', actor: me?.id } });
      if (result.status !== 'APPROVED' || !result.assetId) {
        setReilyProblem('import');
        setError(result.status === 'QUARANTINED'
          ? 'That photo needs an adviser check before it can join the layout. You can keep designing while it waits.'
          : 'That photo cannot be used in this design. Choose another image and keep rolling.');
        return;
      }
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: file.type || 'image/jpeg' }));
      objectUrls.current.push(url);
      setImageUrls((current) => new Map(current).set(result.assetId!, url));
      if (selected?.kind === 'IMAGE') {
        changeElement(selected.id, (item) => { item.imageAssetId = result.assetId; });
      } else if (page) {
        const item = element({ kind: 'IMAGE', name: file.name, x: 108, y: 160, width: 600, height: 420, fill: '#FFF6E4', radius: 16, imageAssetId: result.assetId, fit: 'cover' });
        commit((draft) => draft.pages.find((candidate) => candidate.id === page.id)!.elements.push(item));
        selectOnly(item.id);
      }
    } catch {
      setReilyProblem('import');
      setError('That picture could not be read. Press Add photo to choose it again or try a different file.');
    } finally {
      pendingJobs.current -= 1; setWorking(pendingJobs.current);
      if (imageInput.current) imageInput.current.value = '';
    }
  }

  async function imageSourcesForExport() {
    const sources = new Map<string, string>();
    if (!project) return sources;
    const ids = [...new Set(project.pages.flatMap((candidate) => candidate.elements.map((item) => item.imageAssetId).filter(Boolean) as string[]))];
    for (const id of ids) {
      const asset = await store.assets.get(id);
      if (!asset) continue;
      const bytes = await store.blobs.get(asset.path);
      if (bytes) sources.set(id, dataUrl(bytes, asset.mime));
    }
    return sources;
  }

  async function exportSvg() {
    setError(undefined); setReilyProblem(undefined);
    if (!project || !page) return;
    pendingJobs.current += 1; setWorking(pendingJobs.current);
    try {
      const sources = await imageSourcesForExport(); const fileName = `${safeName(project.title)}-${project.pages.indexOf(page) + 1}.svg`; const blob = new Blob([pageSvg(project, page, sources)], { type: 'image/svg+xml' }); const bytes = new Uint8Array(await blob.arrayBuffer());
      await saveDeliverable(store, { bytes, title: `${project.title} · ${page.name}`, fileName, kind: 'DESIGN', room: 'BLAST', stage: 'WORKING', mime: 'image/svg+xml', storyId: project.storyId, authorId: me?.id, sourceProjectId: project.id, width: project.width, height: project.height });
      download(fileName, blob); setOutputNotice(`${page.name} saved to the Media Bin and downloaded as SVG.`);
    } catch {
      setReilyProblem('export');
      setError('The SVG was not made. Press SVG to try exporting again.');
    } finally { pendingJobs.current -= 1; setWorking(pendingJobs.current); }
  }

  async function exportPng(useAsPodcastCover = false, handoff = false) {
    setError(undefined); setReilyProblem(undefined);
    if (!project || !page) return;
    pendingJobs.current += 1; setWorking(pendingJobs.current);
    try {
      await waitForEditorFonts();
      const sources = await imageSourcesForExport(); const fileName = `${safeName(project.title)}-${project.pages.indexOf(page) + 1}.png`;
      const blob = await renderPageImage(project, page, sources); const bytes = new Uint8Array(await blob.arrayBuffer());
      const ingested = await gate.ingest({ source: 'generated', bytes, meta: { kind: 'IMAGE', mime: 'image/png', origin: 'GENERATED', storyId: project.storyId, actor: me?.id, creator: me?.penName ?? 'Chatter crew', license: 'OWN' } });
      if (!ingested.assetId) throw new Error('The finished PNG could not enter the Media Bin.');
      await saveDeliverable(store, { bytes, title: `${project.title} · ${page.name}`, fileName, kind: 'IMAGE', room: 'BLAST', stage: handoff ? 'REVIEW' : 'WORKING', mime: 'image/png', storyId: project.storyId, authorId: me?.id, sourceAssetId: ingested.assetId, sourceProjectId: project.id, width: project.width, height: project.height });
      if (useAsPodcastCover && podcastCoverId) {
        await store.podcastProjects.update(podcastCoverId, { artworkAssetId: ingested.assetId, artworkMode: 'EPISODE', coverBlastProjectId: project.id });
        navigate('/chatterbox');
        return;
      }
      if (handoff && project.storyId) { await completeRecipeProduction(store, project.storyId, 'BLAST'); navigate(`/greenlight/${project.storyId}`); return; }
      download(fileName, blob); setOutputNotice(`${page.name} saved to the Media Bin and downloaded as PNG.`);
    } catch {
      setReilyProblem('export');
      setError('The PNG was not made. Press PNG to try exporting again.');
    } finally { pendingJobs.current -= 1; setWorking(pendingJobs.current); }
  }

  async function exportPdf() {
    setError(undefined); setReilyProblem(undefined);
    if (!project || !project.pages.length) return;
    pendingJobs.current += 1; setWorking(pendingJobs.current);
    try {
      await waitForEditorFonts();
      const sources = await imageSourcesForExport();
      const pages = [];
      for (const candidate of project.pages) {
        const blob = await renderPageImage(project, candidate, sources, 'image/jpeg');
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth: project.width * 2, pixelHeight: project.height * 2, pageWidth: project.width, pageHeight: project.height });
      }
      const bytes = imagePagesPdf(pages); const fileName = `${safeName(project.title)}.pdf`; const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      await saveDeliverable(store, { bytes, title: `${project.title} · print edition`, fileName, kind: 'DOCUMENT', room: 'BLAST', stage: 'REVIEW', mime: 'application/pdf', storyId: project.storyId, authorId: me?.id, sourceProjectId: project.id, width: project.width, height: project.height, pageCount: project.pages.length });
      download(fileName, blob); setOutputNotice(`${project.pages.length}-page PDF saved to the Media Bin and downloaded.`);
    } catch {
      setReilyProblem('export');
      setError('The PDF was not made. Press PDF to try exporting again.');
    } finally { pendingJobs.current -= 1; setWorking(pendingJobs.current); }
  }

  function applyRichCommand(command: 'bold' | 'italic' | 'underline' | 'strikeThrough') {
    if (!selected || selected.kind !== 'TEXT') return;
    const editor = document.querySelector<HTMLElement>(`[data-rich-id="${selected.id}"]`);
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
  }

  function beginTextEdit(item: BlastElement) {
    if (item.kind !== 'TEXT') return;
    if (project && editingId !== item.id) {
      setHistory((rows) => [...rows.slice(-49), copy(project)]);
      setFuture([]);
    }
    selectOnly(item.id);
    setEditingId(item.id);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-rich-id="${item.id}"]`)?.focus());
  }

  function finishTextEdit(item: BlastElement, editor?: HTMLElement | null) {
    const target = editor ?? document.querySelector<HTMLElement>(`[data-rich-id="${item.id}"]`);
    if (target) changeElement(item.id, (draft) => { draft.richText = sanitizedRichText(target.innerHTML); draft.text = target.innerText; }, false);
    setEditingId(undefined);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); return; }
      if (command && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelected() : groupSelected(); return; }
      if (command && event.key.toLowerCase() === 'c' && selectedItems.length) { event.preventDefault(); layerClipboard.current = copy(selectedItems); return; }
      if (command && event.key.toLowerCase() === 'v' && layerClipboard.current.length) { event.preventDefault(); pasteLayers(); return; }
      if (command && event.key.toLowerCase() === 'a' && page) { event.preventDefault(); setSelectedIds(page.elements.filter((item) => !item.hidden).map((item) => item.id)); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault(); removeSelected(); return; }
      if (selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        changeElement(selected.id, (item) => {
          if (event.key === 'ArrowLeft') item.x -= amount;
          if (event.key === 'ArrowRight') item.x += amount;
          if (event.key === 'ArrowUp') item.y -= amount;
          if (event.key === 'ArrowDown') item.y += amount;
        });
        return;
      }
      if (event.key.toLowerCase() === 't') addElement('TEXT');
      if (event.key.toLowerCase() === 'r') addElement('SHAPE');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!libraryLoaded) return <LoadingStatus label="Opening your design shelf…" />;

  if (!project || showLibrary) {
    return <div className="blast-room">
      {error && <div className="blast-error" role="alert">{error}</div>}
      {outputNotice && <div className="blast-output-ready" role="status"><span>✓ {outputNotice}</span><button onClick={() => navigate('/files')}>Open Media Bin →</button><button aria-label="Dismiss output message" onClick={() => setOutputNotice(undefined)}>×</button></div>}
      <BlastStart
        busy={working > 0}
        onChoose={(familyId, directionId, slotValues) => void chooseRecipe(familyId, directionId, slotValues)}
        onClose={project ? () => setShowLibrary(false) : undefined}
        projects={projects}
        onOpen={(item) => void openSavedDesign(item)}
      />
      <LookInside
        room="Blast"
        intro="Bonus round: the design habits that make flyers, posts, and newsletters easier to read."
        rows={[
          { nm: 'Build a clear pecking order', sb: <>Make one thing the star. The headline wins first, the key details come second, and credits or fine print stay readable without shouting.</> },
          { nm: 'Layers are clear sheets', sb: <>Picture each layer as a transparent sheet. Bring important type forward, send backgrounds back, name the layers, and lock anything you are done touching.</> },
          { nm: 'Align on purpose', sb: <>Shared edges make a page feel organized. Use guides, equal spacing, and repeated sizes before adding more decoration.</> },
          { nm: 'Use type like a team', sb: <>A display face grabs attention; a simple body face carries information. Two type families are usually enough for a whole publication.</> },
          { nm: 'Pick the right export', sb: <><b>SVG</b> stays razor-sharp at any size. <b>PNG</b> is ready for posts and screens. <b>PDF</b> is the usual choice for printing and sharing pages.</> },
          { nm: 'Run the final poster test', sb: <>Step back. Can you spot the headline, date, place, and next action in three seconds? Then check margins, contrast, spelling, and photo credits.</> },
        ]}
      />
    </div>;
  }

  const pageScaleStyle = { width: project.width * zoom, height: project.height * zoom };

  return (
    <div className={`blast-room blast-editor ${project.creativeRecipe?.mode === 'GUIDED' ? 'blast-guided' : 'blast-freeform'}`}>
      {working > 0 && <LoadingStatus label="Preparing your design files…" detail="Reading images, checking media, or saving your export. Keep this tab open." />}
      <input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImage(file); }} />
      <header className="blast-toolbar" data-tools-open={compactToolsOpen}>
        <button className="blast-brand" onClick={() => { selectOnly(); setShowLibrary(true); }}><span>BLAST</span><small>Design studio</small></button>
        <input className="blast-title-input" value={project.title} aria-label="Design title" onChange={(event) => setProject({ ...project, title: event.target.value })} />
        <button type="button" className="compact-blast-tools" aria-expanded={compactToolsOpen} onClick={() => setCompactToolsOpen(open => !open)}>Tools {compactToolsOpen ? '▴' : '▾'}</button>
        <label className="blast-story-link">Story<select aria-label="Design story" value={project.storyId ?? ''} onChange={(event) => setProject({ ...project, storyId: event.target.value || undefined })}><option value="">Standalone</option>{stories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <span className={`blast-save-state ${saveState === 'Not saved' ? 'bad' : ''}`}>{saveState}</span>
        <div className="blast-toolbar-divider" />
        {project.creativeRecipe && <div className="blast-recipe-controls"><button aria-pressed={project.creativeRecipe.mode === 'GUIDED'} onClick={() => commit((draft) => { if (draft.creativeRecipe) draft.creativeRecipe.mode = draft.creativeRecipe.mode === 'GUIDED' ? 'FREEFORM' : 'GUIDED'; })}>{project.creativeRecipe.mode === 'GUIDED' ? 'Guided' : 'Freeform'}</button><label>Try another look<select value={project.creativeRecipe.directionId} onChange={(event) => remix(event.target.value)}>{BLAST_RECIPE_FAMILIES.find((item) => item.id === project.creativeRecipe?.familyId)?.directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}
        <button className="blast-ready-button" onClick={() => setShowReadyCheck((value) => !value)}>Ready Check <b>{checkBlastProject(project).filter((item) => item.severity === 'BLOCKING').length}</b></button>
        <BlastHistoryControls canUndo={!!history.length} canRedo={!!future.length} onUndo={undo} onRedo={redo} />
        <label className="blast-zoom">Zoom <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value=".45">45%</option><option value=".55">55%</option><option value=".68">68%</option><option value=".8">80%</option><option value="1">100%</option></select></label>
        {podcastCoverId && <button className="blast-publish blast-cover-return" onClick={() => requestExport('PODCAST_COVER')}>Use as episode cover</button>}
        <div className="blast-publish-menu">
          <button onClick={() => requestExport('PNG')}>PNG</button>
          <button onClick={() => requestExport('SVG')}>SVG</button>
          <button className="blast-publish" onClick={() => requestExport('PDF')}>PDF</button>
          {project.storyId && resolveStoryCreationRecipe(stories.find((item) => item.id === project.storyId) ?? { channels: [] }).id === 'poster' && <button className="blast-publish" onClick={() => requestExport('HANDOFF')}>Send to Green Light</button>}
        </div>
      </header>

      {error && <div className="blast-error" role="alert">{error}</div>}
      {outputNotice && <div className="blast-output-ready" role="status"><span>✓ {outputNotice}</span><button onClick={() => navigate('/files')}>Open Media Bin →</button><button aria-label="Dismiss output message" onClick={() => setOutputNotice(undefined)}>×</button></div>}
      {showStoryText && <BlastStoryTextPicker sources={storySources} onAdd={addStoryPiece} onClose={closeStoryText} />}
      {showReadyCheck && <BlastReadyCheck findings={checkBlastProject(project)} onClose={() => { setShowReadyCheck(false); setPendingExport(undefined); }} onContinue={pendingExport ? continueExport : undefined} onFocus={(targetPageId, elementId) => { setPageId(targetPageId); setSelectedIds(elementId ? [elementId] : []); setShowReadyCheck(false); setPendingExport(undefined); }} />}
      {project.creativeRecipe?.mode === 'GUIDED' && <nav className="blast-guided-strip" aria-label="Guided design steps"><span><b>GUIDED DESK</b><small>The layout holds steady while you fill the important parts.</small></span><button onClick={() => { const item = page?.elements.find((entry) => entry.role === 'HEADLINE'); if (item) { selectOnly(item.id); beginTextEdit(item); } }}>1 · Headline</button><button onClick={() => { const item = page?.elements.find((entry) => entry.role === 'PHOTO'); if (item) selectOnly(item.id); }}>2 · Photo</button><button onClick={() => setShowStoryText(true)}>3 · Story words</button><button onClick={() => setShowReadyCheck(true)}>4 · Press check</button></nav>}

      <div className="blast-workspace">
        <aside className="blast-rail" aria-label="Design tools">
          {([['templates', 'Templates'], ['add', 'Add'], ['pages', 'Pages'], ['layers', 'Layers']] as const).map(([tab, label]) => (
            <button key={tab} aria-pressed={sideTab === tab} onClick={() => setSideTab(tab)}><CreativeToolIcon kind={tab} /><span>{label}</span></button>
          ))}
        </aside>

        <aside className="blast-panel">
          {sideTab === 'templates' && <>
            <h2>Starting points</h2><p>Open the job shelf for ten complete publishing systems. Your current design stays saved.</p>
            <button className="blast-wide-button primary" onClick={() => { selectOnly(); setShowLibrary(true); }}>Browse publishing jobs</button>
            <h3>Freeform</h3>{BLAST_TEMPLATES.filter((template) => template.id === 'blank').map((template) => <button className="blast-mini-template" key={template.id} onClick={() => void chooseTemplate(template.id)} style={{ '--template-accent': template.accent } as CSSProperties}><i /><span><b>{template.name}</b><small>{template.kind}</small></span></button>)}
          </>}
          {sideTab === 'add' && <>
            <h2>Add to page</h2><p>Everything lands as an editable layer.</p>
            <div className="blast-add-grid">
              <button onClick={() => addElement('TEXT')}><b>T</b><span>Text</span></button>
              <button onClick={() => addElement('SHAPE')}><b>■</b><span>Shape</span></button>
              <button onClick={() => addElement('LINE')}><b>━</b><span>Line</span></button>
              <button onClick={requestImage}><b>▧</b><span>Photo</span></button>
              <button ref={storyTextTrigger} onClick={() => setShowStoryText(true)}><b>“</b><span>Story text</span></button>
            </div>
            <h3>Shape library</h3>
            <div className="blast-shape-grid">{SHAPES.map((option) => <button key={option.shape} title={option.label} onClick={() => addElement('SHAPE', option.shape)}><b>{option.icon}</b><span>{option.label}</span></button>)}</div>
            <button className="blast-upload" onClick={requestImage}>Add photo from computer</button>
            <div className={`blast-gate-note ${classifierReady ? 'ready' : ''}`}><b>{classifierReady ? '✓ Photos ready' : '◌ Photo check starting'}</b><span>Use pictures you made or have permission to publish.</span></div>
            <h3>Quick colors</h3>
            <div className="blast-swatches">{PALETTE.map((color) => <button key={color} style={{ background: color }} title={color} onClick={() => selected && changeElement(selected.id, (item) => { item.fill = color; })} />)}</div>
          </>}
          {sideTab === 'pages' && <>
            <div className="blast-panel-heading"><h2>Pages</h2><button onClick={() => {
              const item = makeBlankPage(project.pages.length + 1);
              commit((draft) => draft.pages.push(item)); setPageId(item.id); selectOnly();
            }}>+ New</button></div>
            <div className="blast-page-list">{project.pages.map((item, index) => <button key={item.id} aria-current={item.id === page?.id} onClick={() => { setPageId(item.id); selectOnly(); }}><span>{index + 1}</span><i style={{ background: item.background }} /><b>{item.name}</b></button>)}</div>
            <button className="blast-wide-button" onClick={() => { if (!page) return; const item = clonePage(page); commit((draft) => draft.pages.splice(draft.pages.findIndex((candidate) => candidate.id === page.id) + 1, 0, item)); setPageId(item.id); }}>Duplicate page</button>
            <button className="blast-wide-button danger" disabled={project.pages.length === 1} onClick={() => { if (!page || project.pages.length === 1) return; const next = project.pages.find((candidate) => candidate.id !== page.id); commit((draft) => { draft.pages = draft.pages.filter((candidate) => candidate.id !== page.id); }); setPageId(next?.id); }}>Delete page</button>
          </>}
          {sideTab === 'layers' && <>
            <h2>Layers</h2><p>Top of this list is front of the page.</p>
            <div className="blast-layer-list">{layersForPanel(page?.elements ?? [], project.creativeRecipe?.mode).map((item) => <div key={item.id} className={selectedIds.includes(item.id) ? 'selected' : ''}>
              <button className="blast-layer-name" onClick={(event) => setSelectedIds(event.shiftKey ? (selectedIds.includes(item.id) ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id]) : [item.id])}><span>{item.kind === 'TEXT' ? 'T' : item.kind === 'IMAGE' ? '▧' : item.kind === 'LINE' ? '━' : '■'}</span><b>{item.name}</b>{item.recipeOwned && <small>Template</small>}</button>
              <button title={item.hidden ? 'Show' : 'Hide'} onClick={() => changeElement(item.id, (target) => { target.hidden = !target.hidden; })}>{item.hidden ? '○' : '◉'}</button>
              <button title={item.locked ? 'Unlock' : 'Lock'} onClick={() => changeElement(item.id, (target) => { target.locked = !target.locked; })}>{item.locked ? '▣' : '▢'}</button>
            </div>)}</div>
          </>}
        </aside>

        <main className="blast-stage" onPointerDown={() => { selectOnly(); }}>
          <div className="blast-stage-tools">
            <label><input type="checkbox" checked={showMargins} onChange={(event) => setShowMargins(event.target.checked)} /> Margins</label>
            <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Grid</label>
            <label><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} /> Snap</label>
            <span>Page {project.pages.indexOf(page!) + 1} of {project.pages.length}</span>
          </div>
          {selected?.kind === 'TEXT' && editingId === selected.id && <div className="blast-rich-toolbar" role="toolbar" aria-label="Format selected words" onPointerDown={(event) => event.stopPropagation()}>
            <span>Selected words</span>
            <button aria-label="Bold selected words" title="Bold" onMouseDown={(event) => { event.preventDefault(); applyRichCommand('bold'); }}><b>B</b></button>
            <button aria-label="Italic selected words" title="Italic" onMouseDown={(event) => { event.preventDefault(); applyRichCommand('italic'); }}><i>I</i></button>
            <button aria-label="Underline selected words" title="Underline" onMouseDown={(event) => { event.preventDefault(); applyRichCommand('underline'); }}><u>U</u></button>
            <button aria-label="Strikethrough selected words" title="Strikethrough" onMouseDown={(event) => { event.preventDefault(); applyRichCommand('strikeThrough'); }}><s>S</s></button>
            <button onMouseDown={(event) => { event.preventDefault(); finishTextEdit(selected); }}>Done</button>
          </div>}
          <div className="blast-page-shell" style={pageScaleStyle}>
            <div className={`blast-page ${showGrid ? 'show-grid' : ''}`} style={{ width: project.width, height: project.height, background: page?.background, transform: `scale(${zoom})` }} onPointerDown={(event) => event.stopPropagation()}>
              {showMargins && <div className="blast-margins" />}
              {page?.elements.map((item) => <div
                key={item.id}
                className={`blast-canvas-element kind-${item.kind.toLowerCase()} ${selectedIds.includes(item.id) ? 'selected' : ''} ${item.locked ? 'locked' : ''}`}
                style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: selectedCanvasZIndex(selectedIds.includes(item.id)), transform: `rotate(${item.rotation}deg)`, opacity: item.opacity, display: item.hidden ? 'none' : item.kind === 'TEXT' ? 'flex' : undefined, justifyContent: item.kind === 'TEXT' ? (item.verticalAlign === 'middle' ? 'center' : item.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start') : undefined, background: item.kind === 'LINE' || (item.kind === 'SHAPE' && (item.shape ?? 'RECTANGLE') === 'RECTANGLE') || (item.kind === 'IMAGE' && !item.imageAssetId) ? fillValue(item) : undefined, border: item.strokeWidth && (item.kind !== 'SHAPE' || (item.shape ?? 'RECTANGLE') === 'RECTANGLE') ? `${item.strokeWidth}px ${item.strokeStyle === 'DASHED' ? 'dashed' : item.strokeStyle === 'DOTTED' ? 'dotted' : 'solid'} ${item.stroke}` : undefined, borderRadius: item.kind === 'LINE' ? 0 : item.radius, color: item.kind === 'TEXT' ? item.fill : undefined, fontFamily: item.fontFamily, fontSize: item.fontSize, fontWeight: item.fontWeight, fontStyle: item.fontStyle, textDecoration: `${item.underline ? 'underline ' : ''}${item.strikethrough ? 'line-through' : ''}`.trim() || undefined, textTransform: item.textTransform, WebkitTextStroke: item.textStrokeWidth ? `${item.textStrokeWidth}px ${item.textStrokeColor}` : undefined, textShadow: item.kind === 'TEXT' ? shadowValue(item) : undefined, boxShadow: item.kind !== 'TEXT' ? shadowValue(item) : undefined, mixBlendMode: item.blendMode as CSSProperties['mixBlendMode'], lineHeight: item.lineHeight, letterSpacing: item.letterSpacing, textAlign: item.align } as CSSProperties}
                onPointerDown={(event) => beginMove(event, item)}
                onDoubleClick={(event) => { event.stopPropagation(); selectOnly(item.id); if (item.kind === 'TEXT') beginTextEdit(item); if (item.kind === 'IMAGE') requestImage(); }}
              >
                {item.kind === 'TEXT' && <div
                  className="blast-rich-text"
                  data-rich-id={item.id}
                  contentEditable={editingId === item.id}
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: richTextHtml(item) }}
                  onBlur={() => { /* Formatting toolbar clicks intentionally keep this edit session open. */ }}
                />}
                {item.kind === 'SHAPE' && (item.shape ?? 'RECTANGLE') !== 'RECTANGLE' && <svg className="blast-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ filter: shadowValue(item) ? `drop-shadow(${shadowValue(item)})` : undefined }}><defs>{item.fillType === 'LINEAR' && <linearGradient id={`canvas-gradient-${item.id}`} x1="0" y1="0" x2="1" y2="1" gradientTransform={`rotate(${item.fillAngle ?? 90} .5 .5)`}><stop stopColor={item.fill} /><stop offset="1" stopColor={item.fillSecondary ?? '#8B4DE8'} /></linearGradient>}{item.fillType === 'RADIAL' && <radialGradient id={`canvas-gradient-${item.id}`}><stop stopColor={item.fill} /><stop offset="1" stopColor={item.fillSecondary ?? '#8B4DE8'} /></radialGradient>}</defs><path d={SHAPE_PATHS[item.shape ?? 'RECTANGLE']} fill={item.fillType && item.fillType !== 'SOLID' ? `url(#canvas-gradient-${item.id})` : item.fill} stroke={item.stroke} strokeWidth={item.strokeWidth} strokeDasharray={dashArray(item)} vectorEffect="non-scaling-stroke" /></svg>}
                {item.kind === 'IMAGE' && item.imageAssetId && imageUrls.get(item.imageAssetId) && <img src={imageUrls.get(item.imageAssetId)} alt="" draggable={false} style={{ objectFit: item.fit ?? 'cover', filter: imageFilter(item), transform: `scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})` }} />}
                {item.kind === 'IMAGE' && !item.imageAssetId && <button onClick={(event) => { event.stopPropagation(); selectOnly(item.id); requestImage(); }}><b>＋</b><span>Add photo</span></button>}
                {selectedId === item.id && selectedIds.length === 1 && !item.locked && <span className="blast-resize" onPointerDown={(event) => beginResize(event, item)} />}
                {item.locked && <span className="blast-lock">▣</span>}
              </div>)}
            </div>
          </div>
        </main>

        <aside className="blast-inspector">
          <div className="blast-inspector-head"><h2>{selectedItems.length > 1 ? 'Edit selection' : selected ? 'Edit layer' : 'Page style'}</h2>{selected && <span>{selectedItems.length > 1 ? `${selectedItems.length} layers` : selected.kind.toLowerCase()}</span>}</div>
          {!selected && page && <>
            <label className="blast-field"><span>Page name</span><input value={page.name} onChange={(event) => commit((draft) => { draft.pages.find((item) => item.id === page.id)!.name = event.target.value; })} /></label>
            <label className="blast-field color"><span>Background</span><input type="color" value={page.background} onChange={(event) => commit((draft) => { draft.pages.find((item) => item.id === page.id)!.background = event.target.value; })} /><code>{page.background}</code></label>
            <div className="blast-help"><b>Start designing</b><span>Add text, shapes, lines, and pictures. Select anything on the page to customize it here.</span><span><kbd>T</kbd> adds text · <kbd>R</kbd> adds a shape</span></div>
          </>}
          {selectedItems.length > 1 && <>
            <div className="blast-selection-summary"><b>{selectedItems.length} layers selected</b><span>Shift-click layers or objects to change the selection.</span></div>
            <h3>Align</h3>
            <div className="blast-align-grid">
              <button title="Align left" onClick={() => alignSelected('LEFT')}>⇤</button><button title="Align centers" onClick={() => alignSelected('CENTER')}>↔</button><button title="Align right" onClick={() => alignSelected('RIGHT')}>⇥</button>
              <button title="Align top" onClick={() => alignSelected('TOP')}>⇡</button><button title="Align middles" onClick={() => alignSelected('MIDDLE')}>↕</button><button title="Align bottom" onClick={() => alignSelected('BOTTOM')}>⇣</button>
            </div>
            <div className="blast-arrange"><button disabled={selectedItems.length < 3} onClick={() => distributeSelected('HORIZONTAL')}>Space across</button><button disabled={selectedItems.length < 3} onClick={() => distributeSelected('VERTICAL')}>Space down</button></div>
            <h3>Selection</h3>
            <div className="blast-arrange"><button onClick={groupSelected}>Group</button><button onClick={ungroupSelected}>Ungroup</button></div>
            <div className="blast-arrange"><button onClick={duplicateSelected}>Duplicate</button><button onClick={() => changeSelected((item) => { item.locked = true; })}>Lock all</button></div>
            <button className="blast-wide-button danger" onClick={removeSelected}>Delete unlocked layers</button>
          </>}
          {selected && selectedItems.length === 1 && <>
            <label className="blast-field"><span>Layer name</span><input value={selected.name} onChange={(event) => changeElement(selected.id, (item) => { item.name = event.target.value; })} /></label>
            {selected.kind === 'TEXT' && <>
              <button className="blast-wide-button primary" onClick={() => beginTextEdit(selected)}>Edit words on page</button>
              <label className="blast-field textarea"><span>Plain text</span><textarea value={selected.text ?? ''} onChange={(event) => changeElement(selected.id, (item) => { item.text = event.target.value; item.richText = undefined; }, false)} /></label>
              <h3>Type</h3>
              <label className="blast-field"><span>Font</span><FontSelect value={selected.fontFamily} sample={selected.text ?? 'Aa'} ariaLabel="Text font" onChange={(fontFamily) => changeElement(selected.id, (item) => { item.fontFamily = fontFamily; })} /></label>
              <div className="blast-field-grid"><NumberField label="Size" value={selected.fontSize} min={8} max={220} onChange={(value) => changeElement(selected.id, (item) => { item.fontSize = value; })} /><NumberField label="Weight" value={selected.fontWeight} min={100} max={900} step={100} onChange={(value) => changeElement(selected.id, (item) => { item.fontWeight = value; })} /></div>
              <div className="blast-format-buttons"><button aria-pressed={selected.fontWeight >= 700} title="Bold whole text box" onClick={() => changeElement(selected.id, (item) => { item.fontWeight = item.fontWeight >= 700 ? 400 : 800; })}><b>B</b></button><button aria-pressed={selected.fontStyle === 'italic'} title="Italic" onClick={() => changeElement(selected.id, (item) => { item.fontStyle = item.fontStyle === 'italic' ? 'normal' : 'italic'; })}><i>I</i></button><button aria-pressed={!!selected.underline} title="Underline" onClick={() => changeElement(selected.id, (item) => { item.underline = !item.underline; })}><u>U</u></button><button aria-pressed={!!selected.strikethrough} title="Strikethrough" onClick={() => changeElement(selected.id, (item) => { item.strikethrough = !item.strikethrough; })}><s>S</s></button></div>
              <div className="blast-segmented"><button aria-pressed={selected.align === 'left'} title="Align left" onClick={() => changeElement(selected.id, (item) => { item.align = 'left'; })}>≡</button><button aria-pressed={selected.align === 'center'} title="Align center" onClick={() => changeElement(selected.id, (item) => { item.align = 'center'; })}>≣</button><button aria-pressed={selected.align === 'right'} title="Align right" onClick={() => changeElement(selected.id, (item) => { item.align = 'right'; })}>≡</button></div>
              <div className="blast-segmented"><button aria-pressed={(selected.verticalAlign ?? 'top') === 'top'} onClick={() => changeElement(selected.id, (item) => { item.verticalAlign = 'top'; })}>Top</button><button aria-pressed={selected.verticalAlign === 'middle'} onClick={() => changeElement(selected.id, (item) => { item.verticalAlign = 'middle'; })}>Middle</button><button aria-pressed={selected.verticalAlign === 'bottom'} onClick={() => changeElement(selected.id, (item) => { item.verticalAlign = 'bottom'; })}>Bottom</button></div>
              <label className="blast-field"><span>Letter case</span><select value={selected.textTransform ?? 'none'} onChange={(event) => changeElement(selected.id, (item) => { item.textTransform = event.target.value as BlastElement['textTransform']; })}><option value="none">As typed</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="capitalize">Title Case</option></select></label>
              <div className="blast-field-grid"><NumberField label="Line height" value={selected.lineHeight} min={.7} max={3} step={.05} onChange={(value) => changeElement(selected.id, (item) => { item.lineHeight = value; })} /><NumberField label="Letter space" value={selected.letterSpacing} min={-5} max={30} step={.5} onChange={(value) => changeElement(selected.id, (item) => { item.letterSpacing = value; })} /></div>
              <h3>Text outline</h3>
              <div className="blast-field-grid"><NumberField label="Outline" value={selected.textStrokeWidth ?? 0} min={0} max={12} step={.5} onChange={(value) => changeElement(selected.id, (item) => { item.textStrokeWidth = value; })} /><label className="blast-field"><span>Outline color</span><input type="color" value={selected.textStrokeColor ?? '#1A1626'} onChange={(event) => changeElement(selected.id, (item) => { item.textStrokeColor = event.target.value; })} /></label></div>
            </>}
            {selected.kind === 'SHAPE' && <><h3>Shape</h3><div className="blast-shape-grid inspector">{SHAPES.map((option) => <button key={option.shape} aria-pressed={(selected.shape ?? 'RECTANGLE') === option.shape} title={option.label} onClick={() => changeElement(selected.id, (item) => { item.shape = option.shape; item.name = option.label; if (option.shape !== 'RECTANGLE') item.radius = 0; })}><b>{option.icon}</b></button>)}</div></>}
            {selected.kind === 'IMAGE' && <>
              <button className="blast-wide-button primary" onClick={requestImage}>{selected.imageAssetId ? 'Replace photo' : 'Add photo'}</button><div className="blast-segmented"><button aria-pressed={(selected.fit ?? 'cover') === 'cover'} onClick={() => changeElement(selected.id, (item) => { item.fit = 'cover'; })}>Fill frame</button><button aria-pressed={selected.fit === 'contain'} onClick={() => changeElement(selected.id, (item) => { item.fit = 'contain'; })}>Fit photo</button></div>
              <h3>Photo adjustments</h3>
              <div className="blast-field-grid"><NumberField label="Brightness" value={selected.brightness ?? 100} min={0} max={200} onChange={(value) => changeElement(selected.id, (item) => { item.brightness = value; })} /><NumberField label="Contrast" value={selected.contrast ?? 100} min={0} max={200} onChange={(value) => changeElement(selected.id, (item) => { item.contrast = value; })} /><NumberField label="Saturation" value={selected.saturation ?? 100} min={0} max={200} onChange={(value) => changeElement(selected.id, (item) => { item.saturation = value; })} /><NumberField label="Grayscale" value={selected.grayscale ?? 0} min={0} max={100} onChange={(value) => changeElement(selected.id, (item) => { item.grayscale = value; })} /></div>
              <div className="blast-arrange"><button aria-pressed={!!selected.flipX} onClick={() => changeElement(selected.id, (item) => { item.flipX = !item.flipX; })}>Flip horizontal</button><button aria-pressed={!!selected.flipY} onClick={() => changeElement(selected.id, (item) => { item.flipY = !item.flipY; })}>Flip vertical</button></div>
            </>}
            <h3>Appearance</h3>
            <label className="blast-field color"><span>{selected.kind === 'TEXT' ? 'Text color' : 'Fill'}</span><input type="color" value={selected.fill === 'transparent' ? '#ffffff' : selected.fill} onChange={(event) => changeElement(selected.id, (item) => { item.fill = event.target.value; })} /><code>{selected.fill}</code></label>
            <div className="blast-swatches compact">{PALETTE.map((color) => <button key={color} style={{ background: color }} onClick={() => changeElement(selected.id, (item) => { item.fill = color; })} />)}</div>
            {selected.kind !== 'TEXT' && <>
              <div className="blast-segmented"><button aria-pressed={(selected.fillType ?? 'SOLID') === 'SOLID'} onClick={() => changeElement(selected.id, (item) => { item.fillType = 'SOLID'; })}>Solid</button><button aria-pressed={selected.fillType === 'LINEAR'} onClick={() => changeElement(selected.id, (item) => { item.fillType = 'LINEAR'; })}>Linear</button><button aria-pressed={selected.fillType === 'RADIAL'} onClick={() => changeElement(selected.id, (item) => { item.fillType = 'RADIAL'; })}>Radial</button></div>
              {selected.fillType !== 'SOLID' && <div className="blast-field-grid"><label className="blast-field"><span>Second color</span><input type="color" value={selected.fillSecondary ?? '#8B4DE8'} onChange={(event) => changeElement(selected.id, (item) => { item.fillSecondary = event.target.value; })} /></label><NumberField label="Angle" value={selected.fillAngle ?? 90} min={0} max={360} onChange={(value) => changeElement(selected.id, (item) => { item.fillAngle = value; })} /></div>}
            </>}
            <div className="blast-field-grid"><NumberField label="X" value={selected.x} onChange={(value) => changeElement(selected.id, (item) => { item.x = value; })} /><NumberField label="Y" value={selected.y} onChange={(value) => changeElement(selected.id, (item) => { item.y = value; })} /><NumberField label="Width" value={selected.width} min={2} onChange={(value) => changeElement(selected.id, (item) => { item.width = value; })} /><NumberField label="Height" value={selected.height} min={2} onChange={(value) => changeElement(selected.id, (item) => { item.height = value; })} /></div>
            <div className="blast-field-grid"><NumberField label="Rotate" value={selected.rotation} min={-180} max={180} onChange={(value) => changeElement(selected.id, (item) => { item.rotation = value; })} /><NumberField label="Opacity" value={selected.opacity} min={0} max={1} step={.05} onChange={(value) => changeElement(selected.id, (item) => { item.opacity = value; })} /></div>
            {selected.kind !== 'TEXT' && <>
              <h3>Border</h3>
              <div className="blast-field-grid"><NumberField label="Corner" value={selected.radius} min={0} max={200} onChange={(value) => changeElement(selected.id, (item) => { item.radius = value; })} /><NumberField label="Width" value={selected.strokeWidth} min={0} max={30} onChange={(value) => changeElement(selected.id, (item) => { item.strokeWidth = value; if (value && item.stroke === 'transparent') item.stroke = '#1A1626'; })} /></div>
              <div className="blast-field-grid"><label className="blast-field"><span>Border color</span><input type="color" value={selected.stroke === 'transparent' ? '#1A1626' : selected.stroke} onChange={(event) => changeElement(selected.id, (item) => { item.stroke = event.target.value; })} /></label><label className="blast-field"><span>Border style</span><select value={selected.strokeStyle ?? 'SOLID'} onChange={(event) => changeElement(selected.id, (item) => { item.strokeStyle = event.target.value as BlastElement['strokeStyle']; })}><option value="SOLID">Solid</option><option value="DASHED">Dashed</option><option value="DOTTED">Dotted</option></select></label></div>
            </>}
            <h3>Shadow & blend</h3>
            <div className="blast-field-grid"><label className="blast-field"><span>Shadow color</span><input type="color" value={selected.shadowColor ?? '#1A1626'} onChange={(event) => changeElement(selected.id, (item) => { item.shadowColor = event.target.value; })} /></label><label className="blast-field"><span>Blend mode</span><select value={selected.blendMode ?? 'normal'} onChange={(event) => changeElement(selected.id, (item) => { item.blendMode = event.target.value; })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="darken">Darken</option><option value="lighten">Lighten</option><option value="color-dodge">Color dodge</option><option value="color-burn">Color burn</option><option value="difference">Difference</option></select></label></div>
            <div className="blast-field-grid"><NumberField label="Shadow X" value={selected.shadowX ?? 0} min={-100} max={100} onChange={(value) => changeElement(selected.id, (item) => { item.shadowX = value; })} /><NumberField label="Shadow Y" value={selected.shadowY ?? 0} min={-100} max={100} onChange={(value) => changeElement(selected.id, (item) => { item.shadowY = value; })} /><NumberField label="Blur" value={selected.shadowBlur ?? 0} min={0} max={100} onChange={(value) => changeElement(selected.id, (item) => { item.shadowBlur = value; })} /><button className="blast-reset-effect" onClick={() => changeElement(selected.id, (item) => { item.shadowX = 0; item.shadowY = 0; item.shadowBlur = 0; })}>Clear shadow</button></div>
            <h3>Arrange</h3>
            <div className="blast-align-grid"><button title="Align to page left" onClick={() => changeElement(selected.id, (item) => { item.x = 0; })}>⇤</button><button title="Center on page" onClick={() => changeElement(selected.id, (item) => { item.x = (project.width - item.width) / 2; })}>↔</button><button title="Align to page right" onClick={() => changeElement(selected.id, (item) => { item.x = project.width - item.width; })}>⇥</button><button title="Align to page top" onClick={() => changeElement(selected.id, (item) => { item.y = 0; })}>⇡</button><button title="Center vertically" onClick={() => changeElement(selected.id, (item) => { item.y = (project.height - item.height) / 2; })}>↕</button><button title="Align to page bottom" onClick={() => changeElement(selected.id, (item) => { item.y = project.height - item.height; })}>⇣</button></div>
            <div className="blast-arrange"><button onClick={() => commit((draft) => { const items = draft.pages.find((candidate) => candidate.id === page?.id)!.elements; const at = items.findIndex((item) => item.id === selected.id); if (at < items.length - 1) [items[at], items[at + 1]] = [items[at + 1]!, items[at]!]; })}>Bring forward</button><button onClick={() => commit((draft) => { const items = draft.pages.find((candidate) => candidate.id === page?.id)!.elements; const at = items.findIndex((item) => item.id === selected.id); if (at > 0) [items[at], items[at - 1]] = [items[at - 1]!, items[at]!]; })}>Send backward</button></div>
            <div className="blast-arrange"><button onClick={duplicateSelected}>Duplicate</button><button onClick={() => changeElement(selected.id, (item) => { item.locked = !item.locked; })}>{selected.locked ? 'Unlock' : 'Lock'}</button></div>
            <button className="blast-wide-button danger" disabled={selected.locked} onClick={removeSelected}>Delete layer</button>
          </>}
        </aside>
      </div>

      <div className="blast-print-pages" aria-hidden="true">{project.pages.map((printPage) => <div key={printPage.id} className="blast-print-page" style={{ width: project.width, height: project.height }} dangerouslySetInnerHTML={{ __html: pageSvg(project, printPage, imageUrls) }} />)}</div>
    </div>
  );
}
