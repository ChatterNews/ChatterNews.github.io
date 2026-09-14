import { resolveStoryCreationRecipe, storyRequiresDeskDraft, storyRoomPath, type Story } from '@chatter/shared';

export interface GreenLightStoryPresentation {
  previewLabel: string;
  needsDeskDraft: boolean;
  productionRoom: string;
  productionRoute: string;
  emptyMessage: string;
  genericPublishingReceipt: boolean;
}

export function greenLightStoryPresentation(story: Story): GreenLightStoryPresentation {
  const recipe = resolveStoryCreationRecipe(story);
  const needsDeskDraft = storyRequiresDeskDraft(story) && recipe.id === 'article';
  const checkIndex = recipe.steps.findIndex((step) => step.id === 'check');
  const production = recipe.steps[checkIndex - 1]!;
  const productionRoom = production.room.replace(/^\//, '').replace(/^./, (letter) => letter.toUpperCase());
  return {
    previewLabel: needsDeskDraft ? 'READER PREVIEW' : `${recipe.label.toUpperCase()} PREVIEW`,
    needsDeskDraft: storyRequiresDeskDraft(story),
    productionRoom,
    productionRoute: storyRoomPath(production.room, story.id),
    emptyMessage: needsDeskDraft
      ? 'This draft is empty. Write the piece in the Desk before reviewing it.'
      : `Open the finished ${recipe.label.toLowerCase()} from ${productionRoom} in the media preview below.`,
    genericPublishingReceipt: recipe.id !== 'podcast',
  };
}

