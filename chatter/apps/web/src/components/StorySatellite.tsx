import { useId, useState, type CSSProperties } from 'react';
import { recipeTrackIndex, resolveStoryCreationRecipe, storyRoomPath, type Story } from '@chatter/shared';
import { useNavigate } from 'react-router-dom';

interface StorySatelliteStyle extends CSSProperties {
  '--recipe-progress': string;
  '--recipe-accent': string;
}

export function StorySatellite({ story, onPick }: { story?: Story; onPick?: () => void }) {
  const navigate = useNavigate();
  const [routeOpen, setRouteOpen] = useState(false);
  const routeId = useId();

  if (!story) return null;

  const recipe = resolveStoryCreationRecipe(story);
  const stepIndex = recipeTrackIndex(story);
  const completed = stepIndex + 1;
  const total = recipe.steps.length;
  const style: StorySatelliteStyle = {
    '--recipe-progress': `${(completed / total) * 360}deg`,
    '--recipe-accent': recipe.accent,
  };

  const currentStep = recipe.steps[stepIndex]!;
  const recommendedRoom = currentStep.room.replace(/^\//, '');
  const roomForStory = (room: string) => storyRoomPath(room, story.id);

  return (
    <section className="story-guide" aria-label="Story route progress" style={style} data-route-open={routeOpen} data-recipe-progress={`${completed}/${total}`}>
      <button type="button" className="story-guide-title" onClick={onPick} title="Track a different story">
        <span className="story-satellite-ring" aria-hidden="true"><b>{completed}</b><small>/{total}</small></span>
        <span className="story-satellite-copy"><small>{recipe.label}</small><b>{story.title}</b></span>
      </button>
      <button type="button" className="compact-route-toggle" aria-expanded={routeOpen} aria-controls={routeId} onClick={() => setRouteOpen(open => !open)}><span>Story route</span><b>{currentStep.label} {routeOpen ? '▴' : '▾'}</b></button>
      <ol id={routeId} className="story-guide-steps">
        {recipe.steps.map((step, index) => (
          <li key={step.id} data-guide-step={step.id} data-step-state={index < stepIndex ? 'complete' : index === stepIndex ? 'current' : 'upcoming'}>
            <button
              type="button"
              aria-current={index === stepIndex ? 'step' : undefined}
              aria-label={`${step.label}: ${index < stepIndex ? 'complete' : index === stepIndex ? 'current step' : 'upcoming'}`}
              onClick={() => { setRouteOpen(false); navigate(roomForStory(step.room)); }}
            >
              <i aria-hidden="true">{index < stepIndex ? '✓' : index + 1}</i><span>{step.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="story-guide-next" data-recommended-room={recommendedRoom} onClick={() => navigate(roomForStory(currentStep.room))}>
        <small>Next room</small><b>{currentStep.action}</b><span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
