import { contrastRatio, looksLikeStarterCopy, minimumReadableDurationMs, type CreativeFinding, type MotionElement, type MotionPackage } from '@chatter/shared';

function surfaceBehind(item: MotionElement, before: readonly MotionElement[], fallback: string): string {
  const cx = item.x + item.width / 2; const cy = item.y + item.height / 2;
  return [...before].reverse().find((candidate) => candidate.kind === 'SHAPE' && cx >= candidate.x && cy >= candidate.y && cx <= candidate.x + candidate.width && cy <= candidate.y + candidate.height)?.fill ?? fallback;
}

export function checkMotionPackage(project: MotionPackage): CreativeFinding[] {
  const findings: CreativeFinding[] = [];
  for (const scene of project.scenes) {
    const visible = scene.elements.filter((item) => !item.hidden);
    const loud = visible.filter((item) => ['POP', 'SPIN', 'TYPE_ON', 'WIPE'].includes(item.enter)).sort((a, b) => a.startMs - b.startMs);
    if (loud.some((item, index) => loud.slice(index, index + 3).length === 3 && loud[index + 2]!.startMs - item.startMs <= 400)) {
      findings.push({ code: 'motion-clash', severity: 'ADVISORY', title: 'Too many things shout at once', message: `${scene.name} has three strong entrances landing together. Let one lead.`, sceneId: scene.id });
    }
    visible.forEach((item, index) => {
      if (item.startMs < 0 || item.endMs > scene.durationMs || item.endMs <= item.startMs) findings.push({ code: 'timing-outside-scene', severity: 'BLOCKING', title: 'A layer runs past the scene', message: `${item.name} starts or ends outside ${scene.name}.`, sceneId: scene.id, elementId: item.id });
      if (item.kind === 'IMAGE' && !item.imageAssetId) findings.push({ code: 'empty-image', severity: 'ADVISORY', title: 'Choose the real picture', message: `${item.name} is still an empty frame.`, sceneId: scene.id, elementId: item.id });
      if (item.recipeOwned || item.role === 'DECORATION') return;
      const marginX = project.width * .05; const marginY = project.height * .05;
      if (item.x < marginX || item.y < marginY || item.x + item.width > project.width - marginX || item.y + item.height > project.height - marginY) findings.push({ code: 'outside-safe-zone', severity: 'ADVISORY', title: 'Move this inside title safe', message: `${item.name} may be cropped on a classroom display or video player.`, sceneId: scene.id, elementId: item.id, repair: 'MOVE_TO_SAFE_ZONE' });
      if (item.kind !== 'TEXT') return;
      if (looksLikeStarterCopy(item.text)) findings.push({ code: 'starter-copy', severity: 'BLOCKING', title: 'Make these words yours', message: `${item.name} still has starting copy.`, sceneId: scene.id, elementId: item.id });
      const readableMs = minimumReadableDurationMs(item.text);
      if (item.endMs - item.startMs < readableMs) findings.push({ code: 'too-fast', severity: 'BLOCKING', title: 'These words leave too quickly', message: `${item.name} needs about ${(readableMs / 1000).toFixed(1)} seconds to read.`, sceneId: scene.id, elementId: item.id, repair: 'EXTEND_TIMING' });
      if (scene.background !== 'transparent') {
        const background = surfaceBehind(item, visible.slice(0, index), scene.background);
        const required = item.fontSize >= project.width * .032 ? 3 : 4.5;
        if (contrastRatio(item.fill, background) < required) findings.push({ code: 'low-contrast', severity: 'BLOCKING', title: 'These words fade into the background', message: `${item.name} needs a lighter or darker color.`, sceneId: scene.id, elementId: item.id });
      }
    });
  }
  return findings;
}
