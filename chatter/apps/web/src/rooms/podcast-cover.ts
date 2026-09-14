import type { BlastProject } from '@chatter/shared';
import { element } from './blast-model.js';

export interface PodcastCoverInput {
  showTitle: string;
  episodeTitle: string;
  episodeNumber?: number;
  artworkAssetId?: string;
}

export function buildPodcastCoverProject(input: PodcastCoverInput): Pick<BlastProject, 'title' | 'format' | 'width' | 'height' | 'pages'> {
  const artwork = input.artworkAssetId
    ? element({ kind: 'IMAGE', name: 'Cover photo', role: 'PHOTO', x: 74, y: 74, width: 932, height: 590, fill: '#261D35', radius: 44, imageAssetId: input.artworkAssetId })
    : element({ kind: 'SHAPE', name: 'Broadcast color field', role: 'DECORATION', x: 74, y: 74, width: 932, height: 590, fill: '#7459B7', fillType: 'LINEAR', fillSecondary: '#65D6CE', fillAngle: 135, stroke: '#211B30', strokeWidth: 7, radius: 44 });
  return {
    title: `${input.episodeTitle} cover`, format: 'SQUARE', width: 1080, height: 1080,
    pages: [{ id: crypto.randomUUID(), name: 'Episode cover', background: '#F4C83D', elements: [
      element({ kind: 'SHAPE', name: 'Broadcast frame', role: 'DECORATION', x: 34, y: 34, width: 1012, height: 1012, fill: '#FF765F', stroke: '#211B30', strokeWidth: 8, radius: 64 }),
      artwork,
      element({ kind: 'SHAPE', name: 'Title card', role: 'DECORATION', x: 74, y: 620, width: 932, height: 386, fill: '#FFF7DE', stroke: '#211B30', strokeWidth: 7, radius: 38 }),
      element({ kind: 'TEXT', name: 'Show and episode', role: 'KICKER', x: 116, y: 665, width: 848, height: 48, text: `${input.showTitle}  ·  EP ${input.episodeNumber ?? '—'}`, fill: '#7459B7', fontFamily: 'Space Mono', fontSize: 25, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }),
      element({ kind: 'TEXT', name: 'Episode title', role: 'HEADLINE', x: 110, y: 735, width: 860, height: 196, text: input.episodeTitle, fill: '#211B30', fontFamily: 'Bricolage Grotesque', fontSize: 76, fontWeight: 900, lineHeight: .96 }),
      element({ kind: 'SHAPE', name: 'On air badge', role: 'DECORATION', x: 806, y: 64, width: 174, height: 64, fill: '#FFD624', stroke: '#211B30', strokeWidth: 5, radius: 32, rotation: 2 }),
      element({ kind: 'TEXT', name: 'On air words', role: 'LOGO', x: 829, y: 79, width: 132, height: 34, text: 'ON AIR', fill: '#211B30', fontFamily: 'Bungee', fontSize: 23, fontWeight: 900, align: 'center', rotation: 2 }),
    ] }],
  };
}

export function podcastCoverHandoff(blastProjectId: string, podcastProjectId: string): string {
  const params = new URLSearchParams({ project: blastProjectId, podcastCover: podcastProjectId });
  return `/blast?${params.toString()}`;
}
