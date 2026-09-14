import type { Deliverable, Story } from './types.js';
import { resolveStoryCreationRecipe } from './story-recipes.js';
import { storyRoomPath } from './track.js';

export interface RecipeOutputRequirement {
  recipeId: ReturnType<typeof resolveStoryCreationRecipe>['id'];
  label: string;
  room: Deliverable['room'];
  route: string;
  ready: boolean;
  files: Deliverable[];
}

const REVIEWED_STAGES = new Set<Deliverable['stage']>(['REVIEW', 'FINAL', 'PUBLISHED']);

/** The audience-facing file a creation route promises to make. */
export function recipeOutputRequirement(story: Story, deliverables: Deliverable[]): RecipeOutputRequirement {
  const recipe = resolveStoryCreationRecipe(story);
  const storyFiles = deliverables.filter((file) => file.storyId === story.id && REVIEWED_STAGES.has(file.stage));
  const spec = recipe.id === 'article'
    ? { label: 'reviewed writing copy', room: 'DESK' as const, route: storyRoomPath('/desk', story.id), kinds: ['DOCUMENT'] }
    : recipe.id === 'podcast'
      ? { label: 'reviewed Chatterbox listening master', room: 'CHATTERBOX' as const, route: storyRoomPath('/chatterbox', story.id), kinds: ['AUDIO'] }
      : recipe.id === 'poster'
        ? { label: 'reviewed Blast page', room: 'BLAST' as const, route: storyRoomPath('/blast', story.id), kinds: ['IMAGE', 'DESIGN', 'DOCUMENT'] }
        : { label: 'reviewed Showtime final cut', room: 'SHOWTIME' as const, route: storyRoomPath('/showtime', story.id), kinds: ['VIDEO'] };
  const files = storyFiles.filter((file) => file.room === spec.room && spec.kinds.includes(file.kind));
  return { recipeId: recipe.id, label: spec.label, room: spec.room, route: spec.route, ready: files.length > 0, files };
}

