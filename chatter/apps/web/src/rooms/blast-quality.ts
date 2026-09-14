import { contrastRatio, looksLikeStarterCopy, type BlastElement, type BlastProject, type CreativeFinding } from '@chatter/shared';

function surfaceBehind(item: BlastElement, before: readonly BlastElement[], fallback: string): string {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const surface = [...before].reverse().find((candidate) => candidate.kind === 'SHAPE' && candidate.fillType !== 'LINEAR' && candidate.fillType !== 'RADIAL'
    && cx >= candidate.x && cy >= candidate.y && cx <= candidate.x + candidate.width && cy <= candidate.y + candidate.height);
  return surface?.fill ?? fallback;
}

export function checkBlastProject(project: Pick<BlastProject, 'pages' | 'width' | 'height'>): CreativeFinding[] {
  const findings: CreativeFinding[] = [];
  for (const page of project.pages) {
    const visible = page.elements.filter((item) => !item.hidden);
    if (!visible.some((item) => item.kind === 'TEXT' && item.role === 'HEADLINE')) {
      findings.push({ code: 'missing-headline', severity: 'BLOCKING', title: 'Give this page a headline', message: `${page.name} needs one clear place for the reader to begin.`, pageId: page.id });
    }
    if (visible.length > 28) findings.push({ code: 'crowded-page', severity: 'ADVISORY', title: 'This page is getting crowded', message: `${page.name} has ${visible.length} layers. Try grouping details or removing decoration that repeats the same idea.`, pageId: page.id });
    visible.forEach((item, index) => {
      if (item.x < 0 || item.y < 0 || item.x + item.width > project.width || item.y + item.height > project.height) {
        findings.push({ code: 'outside-page', severity: 'BLOCKING', title: 'A layer slips off the page', message: `${item.name} will be clipped when this is printed or exported.`, pageId: page.id, elementId: item.id });
      }
      if (item.kind === 'IMAGE' && !item.imageAssetId) findings.push({ code: 'empty-image', severity: 'ADVISORY', title: 'Choose the real photo', message: `${item.name} is still an empty frame.`, pageId: page.id, elementId: item.id });
      if (item.kind !== 'TEXT') return;
      if (looksLikeStarterCopy(item.text)) findings.push({ code: 'starter-copy', severity: 'BLOCKING', title: 'Make these words yours', message: `${item.name} still has its starting words.`, pageId: page.id, elementId: item.id });
      if (item.fontSize < 14 || (item.role === 'BODY' && item.fontSize < 17)) findings.push({ code: 'tiny-type', severity: 'BLOCKING', title: 'This type will be hard to read', message: `${item.name} is ${Math.round(item.fontSize)} px. Give readers a little more size.`, pageId: page.id, elementId: item.id });
      const background = surfaceBehind(item, visible.slice(0, index), page.background);
      const required = item.fontSize >= 24 || (item.fontSize >= 19 && item.fontWeight >= 700) ? 3 : 4.5;
      if (contrastRatio(item.fill, background) < required) findings.push({ code: 'low-contrast', severity: 'BLOCKING', title: 'These words disappear into the background', message: `${item.name} needs a lighter or darker color.`, pageId: page.id, elementId: item.id });
    });
  }
  return findings;
}
